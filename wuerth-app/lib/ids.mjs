import { calculateOrder } from './core.mjs';

// Public URL read from Würth's IDS account configuration. Credentials are never stored.
export const IDS_ENDPOINT = 'https://eshop.wuerth.de/is-bin/INTERSHOP.enfinity/WFS/1401-B1-Site/de_DE/-/EUR/ViewIDSCatalogService-IDSInBound';
export const IDS_VERSIONS = Object.freeze(['2.0', '2.3', '2.5']);
export const IDS_XML_NAMESPACE = 'http://www.itek.de/Shop-Anbindung/Warenkorb/';
const MAX_RESPONSE = 32_768;
const MAX_QTY = 99_999_999_999;

export class IdsError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'IdsError';
    this.status = status;
  }
}

function requiredText(value, field, max = 50) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new IdsError(400, `Bitte ${field} vollständig und ohne Steuerzeichen eingeben.`);
  }
  return value.trim();
}

export function validateIdsIdentity({ customerNumber, username } = {}) {
  return {
    customerNumber: requiredText(customerNumber, 'die Würth-Kundennummer'),
    username: requiredText(username, 'den IDS-Benutzernamen'),
  };
}

export function versionParameter(version) {
  if (!IDS_VERSIONS.includes(version)) throw new IdsError(400, 'Bitte zuerst eine unterstützte IDS-Version prüfen.');
  return version === '2.5' ? 'version' : 'Version';
}

export function parseSupportedVersions(body, contentType = '') {
  if (typeof body !== 'string' || body.length > MAX_RESPONSE) throw new IdsError(502, 'Die Schnittstelle hat keine lesbare Versionsantwort geliefert.');
  const text = body.trim().replace(/^\uFEFF/, '');
  // A login page is not a successful IDS connection, even if it mentions a version.
  if (/text\/html/i.test(contentType) || /<(?:!doctype\s+html|html|head|body|form|input)\b/i.test(text) || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) {
    throw new IdsError(502, 'Würth hat eine Anmeldeseite statt einer IDS-Versionsantwort geliefert. Bitte IDS-Zugang prüfen.');
  }
  let versions;
  if (text.startsWith('<')) {
    if (!/<(?:[A-Za-z_][\w.-]*:)?Schnittstellenversionen\b[^>]*>[\s\S]*<\/(?:[A-Za-z_][\w.-]*:)?Schnittstellenversionen\s*>/i.test(text)) {
      throw new IdsError(502, 'Würth hat keine gültige IDS-Versionsliste zurückgegeben.');
    }
    versions = [...text.matchAll(/<(?:[A-Za-z_][\w.-]*:)?Version\b[^>]*>\s*(\d+\.\d+)\s*<\/(?:[A-Za-z_][\w.-]*:)?Version\s*>/gi)].map(match => match[1]);
  } else {
    // Some installations answer a plain version list. Arbitrary prose is rejected.
    if (!/^\d+\.\d+(?:[\s,;|]+\d+\.\d+)*$/.test(text)) throw new IdsError(502, 'Würth hat keine gültige IDS-Versionsliste zurückgegeben.');
    versions = text.match(/\d+\.\d+/g) ?? [];
  }
  const supported = IDS_VERSIONS.filter(version => versions.includes(version));
  if (!supported.length) throw new IdsError(502, 'Die gemeldete IDS-Version wird von der Bestellhilfe noch nicht unterstützt.');
  return supported;
}

async function readSmallResponse(response) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE) throw new IdsError(502, 'Die IDS-Antwort ist zu groß.');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE) throw new IdsError(502, 'Die IDS-Antwort ist zu groß.');
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

/** Only SV is sent here. This function never sends a shopping cart or an order. */
export async function checkIdsConnection(credentials, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const identity = validateIdsIdentity(credentials);
  const password = credentials?.password;
  if (typeof password !== 'string' || !password || password.length > 200 || /[\u0000-\u001f\u007f]/.test(password)) {
    throw new IdsError(400, 'Bitte das IDS-Passwort eingeben.');
  }
  const form = new FormData();
  form.set('action', 'SV');
  form.set('kndnr', identity.customerNumber);
  form.set('name_kunde', identity.username);
  form.set('pw_kunde', password);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(IDS_ENDPOINT, {
      method: 'POST', body: form, redirect: 'manual', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/xml, text/xml, text/plain' },
    });
    if (response.status === 401 || response.status === 403) throw new IdsError(401, 'Würth hat den IDS-Zugang abgelehnt. Bitte Zugangsdaten und Freischaltung prüfen.');
    if (response.status >= 300 && response.status < 400) throw new IdsError(502, 'Die IDS-Anfrage wurde umgeleitet. Bitte den IDS-Zugang prüfen.');
    if (!response.ok) throw new IdsError(502, 'Die Würth-Schnittstelle konnte die Versionsanfrage gerade nicht beantworten.');
    const versions = parseSupportedVersions(await readSmallResponse(response), response.headers.get('content-type') ?? '');
    return {
      ok: true, versions, selectedVersion: versions.at(-1), interfaceReachable: true,
      // SV can be public: a version reply alone does not prove credential acceptance.
      credentialsVerified: false, cartTested: false,
    };
  } catch (error) {
    if (error instanceof IdsError) throw error;
    if (controller.signal.aborted) throw new IdsError(504, 'Die Würth-Schnittstelle hat nicht rechtzeitig geantwortet. Bitte erneut prüfen.');
    throw new IdsError(502, 'Die Würth-Schnittstelle ist gerade nicht erreichbar.');
  } finally { clearTimeout(timer); }
}

const escapeXml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function buildIdsCartXml(orderLines, version, date = new Date()) {
  versionParameter(version);
  if (!Array.isArray(orderLines) || !orderLines.length || orderLines.length > 500) throw new IdsError(400, 'Bitte mindestens eine vollständige Position mit Bestellmenge auswählen.');
  if (!(date instanceof Date) || !Number.isFinite(date.valueOf())) throw new IdsError(400, 'Das Datum des Warenkorbs ist ungültig.');
  const articles = new Set();
  const rows = orderLines.map((line, index) => {
    if (typeof line.articleNumber !== 'string' || !/^\d{5,15}$/.test(line.articleNumber)) throw new IdsError(400, 'Eine Artikelnummer ist für IDS nicht gültig. Bitte die Artikelangaben prüfen.');
    if (articles.has(line.articleNumber)) throw new IdsError(400, 'Eine Artikelnummer steht mehrfach im Sortiment. Bitte vor der Übergabe zusammenführen.');
    articles.add(line.articleNumber);
    if (!Number.isSafeInteger(line.shopQuantity) || line.shopQuantity <= 0 || line.shopQuantity > MAX_QTY) throw new IdsError(400, 'Eine Bestellmenge ist für IDS nicht gültig.');
    return `    <OrderItem><RefItems><Customer>${index + 1}</Customer></RefItems><ArtNo>${escapeXml(line.articleNumber)}</ArtNo><Qty>${line.shopQuantity}</Qty><QU>PCE</QU></OrderItem>`;
  });
  const iso = date.toISOString();
  // 2.0 requires OrderInfo. Including only ModeOfShipment is valid in all versions.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Warenkorb xmlns="${IDS_XML_NAMESPACE}">\n  <WarenkorbInfo><Date>${iso.slice(0, 10)}</Date><Time>${iso.slice(11, 19)}</Time><Version>${version}</Version></WarenkorbInfo>\n  <Order>\n    <OrderInfo><ModeOfShipment>Lieferung</ModeOfShipment></OrderInfo>\n${rows.join('\n')}\n  </Order>\n</Warenkorb>`;
}

export function prepareIdsCart({ items, entries, customerNumber, username, version, unitConfirmed, hookUrl, date = new Date() }) {
  if (unitConfirmed !== true) throw new IdsError(400, 'Bitte zuerst bestätigen, dass die Shop-Bestelleinheiten und Mengen geprüft sind.');
  const identity = validateIdsIdentity({ customerNumber, username });
  const versionKey = versionParameter(version);
  const hook = new URL(hookUrl);
  if (!['http:', 'https:'].includes(hook.protocol) || hook.username || hook.password || hook.search || hook.hash || hook.pathname !== '/api/ids/return') throw new IdsError(400, 'Die Rücksprungadresse ist ungültig.');
  const order = calculateOrder(items, entries);
  if (!order.canPrepareCart) throw new IdsError(400, order.hasIncompleteInputs ? 'Bitte alle aktiven Positionen vollständig erfassen oder mit null ausdrücklich abwählen.' : 'Es gibt keine positive Bestellmenge für den Warenkorb.');
  const xml = buildIdsCartXml(order.orderLines, version, date);
  return {
    endpoint: IDS_ENDPOINT,
    fields: { action: 'WKS', [versionKey]: version, kndnr: identity.customerNumber, name_kunde: identity.username, hookurl: hook.href, warenkorb: xml },
    positionCount: order.orderLines.length,
    cartTested: false,
  };
}
