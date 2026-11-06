import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  IDS_ENDPOINT, IDS_XML_NAMESPACE, IdsError, buildIdsCartXml,
  checkIdsConnection, parseSupportedVersions, prepareIdsCart, versionParameter,
} from './ids.mjs';

const date = new Date('2026-01-02T03:04:05Z');
const identity = { customerNumber: 'TEST-CUSTOMER', username: 'TEST-USER' };
const credentials = { ...identity, password: 'synthetic-password-only' };
const item = {
  id: 'synthetic-id', articleNumber: '0001234567', name: 'Synthetisches Set',
  contentsPerSalesUnit: 30, purchaseMultipleSalesUnits: 1, orderMode: 'manual',
  netPricePerSalesUnitCents: null, active: true,
};
const prepare = (extra = {}) => prepareIdsCart({
  items: [item], entries: { [item.id]: { mode: 'manual', manualPieces: 50 } },
  ...identity, version: '2.5', unitConfirmed: true,
  hookUrl: 'https://synthetic.example/api/ids/return', date, ...extra,
});
const versionsXml = '<?xml version="1.0"?><Schnittstellenversionen><Version>1.3</Version><Version>2.0</Version><Version>2.3</Version><Version>2.5</Version></Schnittstellenversionen>';
const expectStatus = status => error => error instanceof IdsError && error.status === status;

test('WKS uses shop set quantity, preserves leading zero, and omits prices/password/order flag', () => {
  const result = prepare();
  assert.equal(result.endpoint, IDS_ENDPOINT);
  assert.equal(result.fields.action, 'WKS');
  assert.equal(result.fields.version, '2.5');
  assert.equal(result.fields.Version, undefined);
  assert.match(result.fields.warenkorb, /<ArtNo>0001234567<\/ArtNo><Qty>2<\/Qty><QU>PCE<\/QU>/);
  assert.match(result.fields.warenkorb, /<Date>2026-01-02<\/Date><Time>03:04:05<\/Time>/);
  assert.match(result.fields.warenkorb, new RegExp(IDS_XML_NAMESPACE));
  assert.doesNotMatch(result.fields.warenkorb, /RueckgabeKZ|NetPrice|OfferPrice|PriceBasis|VAT|password|pw_kunde/);
  assert.equal(result.fields.pw_kunde, undefined);
  assert.equal(result.positionCount, 1);
  assert.equal(result.cartTested, false);
});

test('individual items with a five-piece purchase step send five shop pieces, not one set', () => {
  const result = prepare({ items: [{ ...item, contentsPerSalesUnit: 1, purchaseMultipleSalesUnits: 5 }], entries: { [item.id]: { mode: 'manual', manualPieces: 3 } } });
  assert.match(result.fields.warenkorb, /<Qty>5<\/Qty><QU>PCE<\/QU>/);
});

test('missing, invalid or wholly zero orders and unconfirmed units block preparation', () => {
  assert.throws(() => prepare({ unitConfirmed: false }), expectStatus(400));
  assert.throws(() => prepare({ unitConfirmed: 'true' }), expectStatus(400));
  assert.throws(() => prepare({ entries: {} }), expectStatus(400));
  assert.throws(() => prepare({ entries: { [item.id]: { mode: 'manual', manualPieces: 0 } } }), expectStatus(400));
  assert.throws(() => prepare({ entries: { [item.id]: { mode: 'manual', manualPieces: -1 } } }), expectStatus(400));
});

test('unknown versions and duplicate/malformed articles cannot reach a prepared form', () => {
  assert.equal(versionParameter('2.0'), 'Version');
  assert.equal(versionParameter('2.3'), 'Version');
  assert.equal(versionParameter('2.5'), 'version');
  assert.throws(() => prepare({ version: '9.9' }), expectStatus(400));
  assert.throws(() => buildIdsCartXml([{ articleNumber: '000001', shopQuantity: 1 }, { articleNumber: '000001', shopQuantity: 1 }], '2.5'), expectStatus(400));
  assert.throws(() => buildIdsCartXml([{ articleNumber: '</ArtNo><bad>', shopQuantity: 1 }], '2.5'), expectStatus(400));
  assert.throws(() => buildIdsCartXml([{ articleNumber: '000001', shopQuantity: 100_000_000_000 }], '2.5'), expectStatus(400));
});

test('version parser allows namespaced XML and pure text, never a login page or arbitrary prose', () => {
  assert.deepEqual(parseSupportedVersions(versionsXml, 'application/xml'), ['2.0', '2.3', '2.5']);
  assert.deepEqual(parseSupportedVersions('<i:Schnittstellenversionen xmlns:i="urn:synthetic"><i:Version>2.3</i:Version></i:Schnittstellenversionen>'), ['2.3']);
  assert.deepEqual(parseSupportedVersions('2.0; 2.5', 'text/plain'), ['2.0', '2.5']);
  for (const text of ['<html><form>Login 2.5</form></html>', 'Anmeldung fehlgeschlagen. Version 2.5', '<Error>2.5</Error>', '<!DOCTYPE x><Schnittstellenversionen><Version>2.5</Version></Schnittstellenversionen>', '9.9']) {
    assert.throws(() => parseSupportedVersions(text), expectStatus(502));
  }
  assert.throws(() => parseSupportedVersions(versionsXml, 'text/html'), expectStatus(502));
});

test('connection check sends only SV to the fixed endpoint and never returns credentials', async () => {
  let calls = 0;
  const result = await checkIdsConnection(credentials, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, IDS_ENDPOINT);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.body.get('action'), 'SV');
    assert.equal(options.body.get('warenkorb'), null);
    assert.equal(options.body.get('pw_kunde'), credentials.password);
    assert.equal(options.body.get('kndnr'), identity.customerNumber);
    return new Response(versionsXml, { headers: { 'Content-Type': 'application/xml' } });
  } });
  assert.equal(calls, 1);
  assert.equal(result.selectedVersion, '2.5');
  assert.equal(result.credentialsVerified, false);
  assert.equal(result.cartTested, false);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-password|TEST-CUSTOMER|TEST-USER/);
});

test('rejected login, redirect, oversized reply and network failure produce safe errors', async () => {
  for (const [response, status] of [
    [new Response('synthetic-password-only', { status: 401 }), 401],
    [new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/login' } }), 502],
    [new Response('<html><form>Login</form></html>', { headers: { 'Content-Type': 'text/html' } }), 502],
    [new Response('x'.repeat(40_000)), 502],
  ]) {
    await assert.rejects(checkIdsConnection(credentials, { fetchImpl: async () => response }), error => {
      assert.doesNotMatch(error.message, /synthetic-password-only/);
      return expectStatus(status)(error);
    });
  }
  await assert.rejects(checkIdsConnection(credentials, { fetchImpl: async () => { throw new Error(credentials.password); } }), error => error.status === 502 && !error.message.includes(credentials.password));
});

test('connection timeout is bounded and uses a distinct timeout error', async () => {
  await assert.rejects(checkIdsConnection(credentials, { timeoutMs: 5, fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) }), expectStatus(504));
});

// Optional local reference validation, separate from the portable Node-only suite.
// Set IDS_SCHEMA_PATH to the original ITEK send XSD and PYTHON to a Python binary
// with lxml installed. Neither downloaded reference files nor personal paths are
// required in a fresh checkout. No reference files are downloaded by this test.
const schema = process.env.IDS_SCHEMA_PATH;
const python = process.env.PYTHON;
const schemaValidationAvailable = Boolean(schema && python && existsSync(schema) && existsSync(python));
test('optional: generated 2.5 cart validates against the original ITEK send schema', {
  skip: schemaValidationAvailable ? false : 'Optional XML validation needs existing IDS_SCHEMA_PATH and PYTHON paths with lxml.',
}, () => {
  const script = 'import sys; from lxml import etree as E; p=E.XMLParser(resolve_entities=False,no_network=True); schema=E.XMLSchema(E.parse(sys.argv[1],p)); root=E.fromstring(sys.stdin.buffer.read(),p); schema.assertValid(root); print("valid")';
  const run = spawnSync(python, ['-c', script, schema], { input: prepare().fields.warenkorb, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /valid/);
});
