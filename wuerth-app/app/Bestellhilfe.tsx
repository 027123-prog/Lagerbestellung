"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mode = "stock" | "empty" | "manual";
type Tab = "count" | "order" | "items";
type Item = {
  id: string; articleNumber: string; name: string; category: string; stockUnit: string;
  orderMode: Mode; contentsPerSalesUnit: number; purchaseMultipleSalesUnits: number;
  netPricePerSalesUnitCents?: number | null; priceAsOf?: string | null;
  targetWorkshop?: number | null; targetReserve?: number | null; active: boolean;
};
type Entry = { mode?: Mode; stockWorkshop?: number | null; stockReserve?: number | null; manualPieces?: number | null; empty?: boolean | null };
type Connection = { configured: boolean; endpoint?: string; version?: string };
type IdsSettings = { endpoint: string; customerNumber?: string; username?: string; configured: boolean; needsPassword: boolean; cartTested: boolean };
type IdsCheck = { supportedVersions?: string[]; versions?: string[]; selectedVersion: string; credentialsVerified?: boolean; cartTested?: boolean };
type IdsPrepared = { endpoint: string; fields: Record<string, string>; positionCount?: number };
type Line = {
  id: string; status: string; requiredPieces: number | null; shopQuantity: number | null;
  purchasePacks: number | null; orderedPieces: number | null; extraPieces: number | null;
  netTotalCents: number | null; transfers?: { from: string; to: string; pieces: number }[];
};
type Order = { lines: Line[]; orderLines: Line[]; netTotalCents: number | null; hasIncompleteInputs: boolean; canPrepareCart: boolean };
type State = { items: Item[]; entries: Record<string, Entry>; connection: Connection };
type FormState = Omit<Item, "id" | "active">;
const IDS_ENDPOINT = "https://eshop.wuerth.de/is-bin/INTERSHOP.enfinity/WFS/1401-B1-Site/de_DE/-/EUR/ViewIDSCatalogService-IDSInBound";
const articleUrl = (articleNumber: string) => `https://eshop.wuerth.de/is-bin/INTERSHOP.enfinity/WFS/1401-B1-Site/de_DE/-/EUR/ViewAfterSearch-ExecuteAfterSearchLoggedIn?VisibleSearchTerm=${encodeURIComponent(articleNumber)}`;

const money = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const units = (n: number | null | undefined, unit: string) => n == null ? "offen" : `${n} ${unit}`;
const modeName = (m: Mode) => m === "stock" ? "Bestand zählen" : m === "empty" ? "Leer melden" : "Menge eingeben";
// Übernommenes Zahlenformat der vorhandenen Lagerbestellung; API prüft Ganzzahlen.
const numericValue = (value: unknown): number | null => {
  if (value == null) return null;
  const text = String(value).replace(",", ".").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};
const blankForm: FormState = { name: "", articleNumber: "", category: "", stockUnit: "Stück", orderMode: "empty", contentsPerSalesUnit: 1, purchaseMultipleSalesUnits: 1, targetWorkshop: null, targetReserve: null, netPricePerSalesUnitCents: null, priceAsOf: null };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } }); }
  catch { throw new Error("Keine Verbindung. Prüfe dein Netz und versuche es erneut."); }
  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("Die Antwort konnte nicht gelesen werden. Bitte erneut versuchen."); }
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : typeof data.message === "string" ? data.message : "Das hat nicht geklappt. Bitte erneut versuchen.");
  return data as T;
}

function Icon({ type }: { type: "count" | "order" | "items" | "search" | "plus" | "edit" | "arrow" | "close" }) {
  const paths: Record<string, React.ReactNode> = {
    count: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h3" /></>,
    order: <path d="M3 4h2l2.5 12h11L21 8H6M9 20h.01M18 20h.01" />,
    items: <path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    edit: <path d="m15 4 5 5M4 20l4-1 13-13-4-4L4 15l0 5Z" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
}

function NumberField({ label, value, onChange, suffix, hint, id }: { label: string; value?: number | null; onChange: (n: number | null) => void; suffix?: string; hint?: string; id?: string }) {
  return <label className="number-field" htmlFor={id}><span className="field-label">{label}</span><span className="number-input"><input id={id} type="text" inputMode="numeric" pattern="[0-9]*" placeholder="—" value={value ?? ""} onChange={e => { if (/^\d*$/.test(e.target.value)) onChange(numericValue(e.target.value)); }} />{suffix && <span>{suffix}</span>}</span>{hint && <small>{hint}</small>}</label>;
}

export default function Bestellhilfe() {
  const [items, setItems] = useState<Item[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [order, setOrder] = useState<Order | null>(null);
  const [tab, setTab] = useState<Tab>("count");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [showConnection, setShowConnection] = useState(false);
  const [idsSettingsLoaded, setIdsSettingsLoaded] = useState(false);
  const [idsLoading, setIdsLoading] = useState(false);
  const [idsChecking, setIdsChecking] = useState(false);
  const [idsCustomerNumber, setIdsCustomerNumber] = useState("");
  const [idsUsername, setIdsUsername] = useState("");
  const [idsPassword, setIdsPassword] = useState("");
  const [idsVersion, setIdsVersion] = useState("");
  const [idsReachable, setIdsReachable] = useState(false);
  const [idsError, setIdsError] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [unitConfirmed, setUnitConfirmed] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [formError, setFormError] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const dirty = useRef<Record<string, Entry>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const connectionDialog = useRef<HTMLDialogElement>(null);
  const orderRequest = useRef(0);
  const orderSignature = useRef("");
  const entryRevision = useRef(0);

  const refreshOrder = useCallback(async () => {
    const request = ++orderRequest.current;
    const result = await api<Order>("/api/order", { method: "POST", body: "{}" });
    if (request === orderRequest.current) {
      const signature = JSON.stringify({ lines: result.orderLines.map(line => [line.id, line.shopQuantity, line.orderedPieces, line.purchasePacks]), incomplete: result.hasIncompleteInputs });
      if (signature !== orderSignature.current) { setUnitConfirmed(false); orderSignature.current = signature; }
      setOrder(result);
    }
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const state = await api<State>("/api/state");
      setItems(state.items ?? []); setEntries(state.entries ?? {});
      await refreshOrder();
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [refreshOrder]);
  useEffect(() => { void load(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [load]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current) await inFlight.current;
    const snapshot = { ...dirty.current };
    if (!Object.keys(snapshot).length) return;
    setSaveStatus("saving");
    const operation = (async () => {
      try {
        await api("/api/entries", { method: "PUT", body: JSON.stringify({ entries: snapshot }) });
        for (const [id, entry] of Object.entries(snapshot)) if (dirty.current[id] === entry) delete dirty.current[id];
        if (!Object.keys(dirty.current).length) setSaveStatus("saved");
        await refreshOrder();
      } catch (e) { setSaveStatus("error"); setError((e as Error).message); throw e; }
    })();
    inFlight.current = operation;
    try { await operation; } finally { inFlight.current = null; }
    if (Object.keys(dirty.current).length) await flush();
  }, [refreshOrder]);
  const updateEntry = (item: Item, patch: Partial<Entry>) => {
    entryRevision.current += 1;
    setUnitConfirmed(false); setHandoffError("");
    const entry = { mode: item.orderMode, ...entries[item.id], ...patch };
    setEntries(old => ({ ...old, [item.id]: entry }));
    dirty.current[item.id] = entry;
    setSaveStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => {}); }, 650);
  };
  const showOrder = async () => {
    setBusy(true); setError("");
    try { await flush(); await refreshOrder(); setTab("order"); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const retryState = async () => {
    setError("");
    try {
      if (Object.keys(dirty.current).length || saveStatus === "error") {
        await flush(); await refreshOrder();
        if (!Object.keys(dirty.current).length) setSaveStatus("saved");
      } else await load();
    } catch (e) { setError((e as Error).message); }
  };
  const activeItems = useMemo(() => items.filter(i => i.active !== false), [items]);
  const categories = useMemo(() => [...new Set(activeItems.map(i => i.category).filter(Boolean))].sort((a,b) => a.localeCompare(b, "de")), [activeItems]);
  useEffect(() => { if (category && !categories.includes(category)) setCategory(""); }, [category, categories]);
  const visibleItems = activeItems.filter(item => (!category || item.category === category) && `${item.name} ${item.articleNumber}`.toLowerCase().includes(query.toLowerCase()));
  const unresolvedEmptyItems = visibleItems.filter(item => (entries[item.id]?.mode ?? item.orderMode) === "empty" && entries[item.id]?.empty == null);
  const lineMap = new Map((order?.lines ?? []).map(line => [line.id, line]));
  const openCount = order?.lines.filter(line => line.status === "open" || line.status === "invalid").length ?? activeItems.length;
  const orderCount = order?.orderLines.length ?? 0;
  const quantitiesReady = !!order?.canPrepareCart && !order.hasIncompleteInputs && order.orderLines.length > 0 && order.orderLines.every(line => {
    const item = activeItems.find(candidate => candidate.id === line.id);
    return !!item && Number.isSafeInteger(line.shopQuantity) && (line.shopQuantity ?? 0) > 0 && Number.isSafeInteger(line.orderedPieces) && (line.orderedPieces ?? 0) > 0 && Number.isSafeInteger(line.purchasePacks) && (line.purchasePacks ?? 0) > 0 && line.shopQuantity! * item.contentsPerSalesUnit === line.orderedPieces;
  });
  const idsReady = idsReachable && !!idsVersion && !!idsCustomerNumber.trim() && !!idsUsername.trim() && !!idsPassword;

  const loadIdsSettings = useCallback(async () => {
    setIdsLoading(true); setIdsError("");
    try {
      const settings = await api<IdsSettings>("/api/ids/settings");
      setIdsCustomerNumber(old => old || settings.customerNumber || "");
      setIdsUsername(old => old || settings.username || "");
      setIdsSettingsLoaded(true);
    } catch (e) { setIdsError((e as Error).message); }
    finally { setIdsLoading(false); }
  }, []);
  useEffect(() => { if (showConnection && !idsSettingsLoaded) void loadIdsSettings(); }, [showConnection, idsSettingsLoaded, loadIdsSettings]);
  const resetIdsCheck = () => { setIdsReachable(false); setIdsVersion(""); setIdsError(""); };
  const checkIds = async (event: React.FormEvent) => {
    event.preventDefault(); setIdsError(""); setIdsChecking(true); setIdsReachable(false); setIdsVersion("");
    try {
      const result = await api<IdsCheck>("/api/ids/check", { method: "POST", body: JSON.stringify({ customerNumber: idsCustomerNumber.trim(), username: idsUsername.trim(), password: idsPassword }) });
      const supported = result.supportedVersions ?? result.versions ?? [];
      if (!supported.length || !supported.includes(result.selectedVersion)) throw new Error("Würth hat keine passende Schnittstellenversion bestätigt. Bitte erneut versuchen.");
      setIdsVersion(result.selectedVersion); setIdsReachable(true);
    } catch (e) { setIdsError((e as Error).message); }
    finally { setIdsChecking(false); }
  };
  const handoffToWuerth = async () => {
    setHandoffError("");
    if (!unitConfirmed || !quantitiesReady) { setHandoffError("Bitte die vollständigen Packungen und Mengen prüfen und bestätigen."); return; }
    if (!idsReady) { setShowConnection(true); return; }
    const revision = entryRevision.current;
    const confirmedSignature = orderSignature.current;
    const password = idsPassword;
    setHandoffBusy(true);
    try {
      await flush();
      if (entryRevision.current !== revision || orderSignature.current !== confirmedSignature) throw new Error("Die Mengen wurden geändert. Bitte den Vorschlag erneut prüfen und bestätigen.");
      const prepared = await api<IdsPrepared>("/api/ids/prepare", { method: "POST", body: JSON.stringify({ customerNumber: idsCustomerNumber.trim(), username: idsUsername.trim(), version: idsVersion, unitConfirmed: true }) });
      if (entryRevision.current !== revision || orderSignature.current !== confirmedSignature) throw new Error("Die Mengen wurden geändert. Bitte den Vorschlag erneut prüfen und bestätigen.");
      if (prepared.endpoint !== IDS_ENDPOINT || !prepared.fields || typeof prepared.fields !== "object" || Array.isArray(prepared.fields) || Object.values(prepared.fields).some(value => typeof value !== "string") || !prepared.fields.warenkorb || prepared.fields.action !== "WKS") throw new Error("Die Warenkorbübergabe konnte nicht vorbereitet werden. Bitte erneut versuchen.");
      const transferForm = document.createElement("form");
      transferForm.method = "POST"; transferForm.enctype = "multipart/form-data"; transferForm.action = prepared.endpoint; transferForm.target = "_self"; transferForm.hidden = true;
      for (const [name, value] of Object.entries({ ...prepared.fields, pw_kunde: password })) {
        const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; transferForm.appendChild(input);
      }
      document.body.appendChild(transferForm);
      try { HTMLFormElement.prototype.submit.call(transferForm); }
      finally { transferForm.remove(); setIdsPassword(""); setIdsReachable(false); setIdsVersion(""); setUnitConfirmed(false); }
    } catch (e) { setHandoffError((e as Error).message); }
    finally { setHandoffBusy(false); }
  };

  const openEditor = (item: Item | "new") => {
    entryRevision.current += 1; setUnitConfirmed(false);
    setForm(item === "new" ? { ...blankForm } : { ...item });
    setPriceInput(item === "new" || item.netPricePerSalesUnitCents == null ? "" : String(item.netPricePerSalesUnitCents / 100).replace(".", ","));
    setFormError(""); setEditing(item);
  };
  useEffect(() => { if (editing) dialog.current?.showModal(); else dialog.current?.close(); }, [editing]);
  useEffect(() => { if (showConnection) connectionDialog.current?.showModal(); else connectionDialog.current?.close(); }, [showConnection]);
  const setFormField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(old => ({ ...old, [key]: value }));
  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault(); setFormError(""); setFormBusy(true);
    const price = numericValue(priceInput);
    if (priceInput.trim() && (price == null || price < 0)) { setFormError("Bitte einen gültigen Nettopreis eintragen oder das Preisfeld leer lassen."); setFormBusy(false); return; }
    const item = { ...form, name: form.name.trim(), articleNumber: form.articleNumber.trim(), category: form.category.trim(), stockUnit: form.stockUnit.trim() || "Stück", netPricePerSalesUnitCents: price == null ? null : Math.round(price*100), active: true };
    if (!item.name || !item.articleNumber || !Number.isSafeInteger(item.contentsPerSalesUnit) || item.contentsPerSalesUnit < 1 || !Number.isSafeInteger(item.purchaseMultipleSalesUnits) || item.purchaseMultipleSalesUnits < 1) {
      setFormError("Bitte Name, Artikelnummer und gültige Verpackungsmengen eintragen."); setFormBusy(false); return;
    }
    try {
      await flush();
      await api(editing === "new" ? "/api/items" : `/api/items/${encodeURIComponent((editing as Item).id)}`, { method: editing === "new" ? "POST" : "PUT", body: JSON.stringify(item) });
      if (editing !== "new" && editing && editing.orderMode !== item.orderMode) {
        await api("/api/entries", { method: "PUT", body: JSON.stringify({ entries: { [editing.id]: { ...entries[editing.id], mode: item.orderMode } } }) });
      }
      setEditing(null); await load();
    } catch (e) { setFormError((e as Error).message); } finally { setFormBusy(false); }
  };
  const archiveItem = async () => {
    if (!editing || editing === "new") return;
    setFormBusy(true); setFormError("");
    try { await flush(); await api(`/api/items/${encodeURIComponent(editing.id)}`, { method: "DELETE" }); setEditing(null); await load(); }
    catch (e) { setFormError((e as Error).message); } finally { setFormBusy(false); }
  };

  return <div className="app-shell">
    <header className="app-header"><div className="header-inner"><div className="brand"><span className="brand-mark" aria-hidden="true"><span/><span/></span><div><strong>Würth</strong><a className="back-link" href="/">← Lagerbestellung</a></div></div><span className={`save-status ${saveStatus}`} role="status"><i/>{saveStatus === "saved" ? "Gespeichert" : saveStatus === "saving" ? "Speichert …" : "Nicht gespeichert"}</span></div></header>
    <main>
      <section className="page-intro"><div><p className="eyebrow">{tab === "order" ? "Nachbestellen" : tab === "items" ? "Sortiment" : "Lager & Büroreserve"}</p><h1>{tab === "order" ? "Dein Vorschlag" : tab === "items" ? "Deine Artikel" : "Was ist noch da?"}</h1><p>{tab === "order" ? "Volle Verpackungen, passende Mengen. Prüfe die Auswahl vor der Übergabe." : tab === "items" ? "Lege je Artikel fest, wie du den Bedarf erfasst." : "Blätter zählen oder ein leeres Fach markieren. Den Rest rechnen wir aus."}</p></div>{tab === "items" && <button className="primary add-top" onClick={() => openEditor("new")}><Icon type="plus"/>Artikel hinzufügen</button>}{tab === "order" && <button className="secondary" onClick={() => setShowConnection(true)}>Würth-Verbindung</button>}</section>
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void retryState()}>Erneut versuchen</button></div>}
      {loading ? <div className="loading-state" role="status"><span className="spinner"/>Artikel werden geladen …</div> : <>
        {tab !== "order" && activeItems.length > 0 && <><div className="search-row"><label className="search-box"><Icon type="search"/><input type="search" placeholder="Artikel oder Nummer suchen" aria-label="Artikel oder Nummer suchen" value={query} onChange={e => setQuery(e.target.value)}/></label><span className="result-count">{visibleItems.length} Artikel</span></div>{categories.length > 0 && <div className="category-list" aria-label="Kategorie wählen"><button className={!category ? "selected" : ""} onClick={() => setCategory("")}>Alle</button>{categories.map(c => <button key={c} className={category === c ? "selected" : ""} onClick={() => setCategory(c)}>{c}</button>)}</div>}</>}
        {tab === "count" && <>
          {activeItems.length > 0 && <div className="progress-strip"><span><strong>{activeItems.length - openCount}</strong> von {activeItems.length} erfasst</span><span>{orderCount ? `${orderCount} zum Nachbestellen` : "Noch kein Bedarf"}</span></div>}
          {unresolvedEmptyItems.length > 0 && <div className="bulk-empty-action"><p>Alle leeren Fächer markiert? Die übrigen sichtbaren Leer-Meldungen kannst du gemeinsam abschließen.</p><button className="secondary" onClick={() => unresolvedEmptyItems.forEach(item => updateEntry(item, { empty: false }))}>Übrige als nicht leer markieren <span>{unresolvedEmptyItems.length}</span></button></div>}
          <div className="item-grid">{visibleItems.map(item => {
            const entry = entries[item.id] ?? {};
            const mode = entry.mode ?? item.orderMode;
            const line = lineMap.get(item.id);
            const packSize = item.contentsPerSalesUnit * item.purchaseMultipleSalesUnits;
            const ready = line?.status === "ready";
            return <article className={`item-card ${ready ? "is-complete" : ""}`} key={item.id}>
              <div className="card-heading"><div><p className="item-category">{item.category || "Artikel"}</p><h2>{item.name}</h2><p className="article-number">Art. <a href={articleUrl(item.articleNumber)} target="_blank" rel="noopener noreferrer" aria-label={`Artikel ${item.articleNumber} bei Würth öffnen`}>{item.articleNumber}</a></p></div><button className="icon-button" aria-label={`${item.name} bearbeiten`} onClick={() => openEditor(item)}><Icon type="edit"/></button></div>
              <div className="card-meta"><span>{packSize} {item.stockUnit} / Verpackung</span>{item.orderMode !== "manual" && <button className="text-button" onClick={() => updateEntry(item, { mode: mode === "manual" ? item.orderMode : "manual" })}>{mode === "manual" ? "Zurück zur Erfassung" : "Menge direkt"}</button>}</div>
              {mode === "stock" && <div className="count-fields"><NumberField id={`lager-${item.id}`} label="Kleinmaschinenlager" value={entry.stockWorkshop} onChange={n => updateEntry(item, { stockWorkshop: n })} hint={`Soll: ${units(item.targetWorkshop, item.stockUnit)}`}/><NumberField id={`buero-${item.id}`} label="Büroreserve" value={entry.stockReserve} onChange={n => updateEntry(item, { stockReserve: n })} hint={`Soll: ${units(item.targetReserve, item.stockUnit)}`}/></div>}
              {mode === "empty" && <div className="empty-choice" aria-label={`Vorrat ${item.name}`}><button className={entry.empty === false ? "chosen available" : ""} aria-pressed={entry.empty === false} onClick={() => updateEntry(item, { empty: false })}><span className="choice-symbol">✓</span>Vorrat da</button><button className={entry.empty === true ? "chosen depleted" : ""} aria-pressed={entry.empty === true} onClick={() => updateEntry(item, { empty: true })}><span className="empty-square"/>Leer<span className="choice-detail">1 Verpackung</span></button></div>}
              {mode === "manual" && <NumberField id={`direkt-${item.id}`} label="Benötigte Menge" value={entry.manualPieces} suffix={item.stockUnit} hint="0 bedeutet: nichts nachbestellen." onChange={n => updateEntry(item, { manualPieces: n })}/>}
              <div className={`card-result ${ready && (line?.orderedPieces ?? 0) > 0 ? "needs-order" : ""}`} role="status">{line?.status === "invalid" ? "Bitte Eingaben prüfen" : ready ? line.orderedPieces ? <><strong>{line.purchasePacks} Verpackung{line.purchasePacks === 1 ? "" : "en"}</strong><span>{units(line.orderedPieces, item.stockUnit)}{line.extraPieces ? ` · ${line.extraPieces} zusätzlich` : ""}</span></> : <><strong>Vorrat reicht</strong><span>{line.transfers?.length ? "Zwischen Lager und Büro umverteilen" : "Keine Nachbestellung"}</span></> : <span>{mode === "empty" ? "Vorrat auswählen" : mode === "stock" && (item.targetWorkshop == null || item.targetReserve == null) ? "Sollbestand im Artikel ergänzen" : "Noch offen"}</span>}</div>
              {(line?.transfers ?? []).map((t,i) => <p className="transfer-note" key={i}>{t.pieces} {item.stockUnit} {t.from === "workshop" ? "vom Lager ins Büro" : "vom Büro ins Lager"} umlegen.</p>)}
            </article>;
          })}</div>
        </>}
        {tab === "items" && <div className="catalog-list">{visibleItems.map(item => <button className="catalog-row" key={item.id} onClick={() => openEditor(item)}><span className="catalog-icon"><Icon type="items"/></span><span className="catalog-copy"><strong>{item.name}</strong><span>{item.articleNumber} · {modeName(item.orderMode)}</span><small>{item.contentsPerSalesUnit * item.purchaseMultipleSalesUnits} {item.stockUnit} pro Verpackung</small></span><Icon type="edit"/></button>)}</div>}
        {tab !== "order" && (!activeItems.length || !visibleItems.length) && <div className="empty-state"><span className="empty-state-icon"><Icon type={activeItems.length ? "search" : "items"}/></span><h2>{activeItems.length ? "Keine passenden Artikel" : "Dein Lager beginnt hier"}</h2><p>{activeItems.length ? "Versuche eine andere Suche oder Kategorie." : "Füge eure Artikel hinzu. Du bestimmst, ob gezählt, ein leeres Fach markiert oder eine Menge eingegeben wird."}</p>{!activeItems.length && <button className="primary" onClick={() => openEditor("new")}><Icon type="plus"/>Ersten Artikel hinzufügen</button>}</div>}
        {tab === "order" && <section className="order-section">
          {order?.hasIncompleteInputs && <div className="notice"><div><strong>{openCount} Artikel noch offen</strong><p>Ergänze die Erfassung, damit der Vorschlag vollständig ist.</p></div><button className="secondary compact" onClick={() => setTab("count")}>Erfassen</button></div>}
          {!orderCount ? <div className="empty-state"><span className="empty-state-icon"><Icon type="order"/></span><h2>{order?.hasIncompleteInputs ? "Noch kein vollständiger Vorschlag" : "Aktuell nichts nachzubestellen"}</h2><p>{order?.hasIncompleteInputs ? "Trage die Bestände ein oder markiere leere Fächer." : "Die erfassten Vorräte decken euren Bedarf."}</p><button className="secondary" onClick={() => setTab("count")}>Zur Erfassung</button></div> : <>
            <div className="order-list">{order?.orderLines.map(line => { const item = activeItems.find(i => i.id === line.id); if (!item) return null; return <article className="order-card" key={line.id}><div className="order-line-head"><div><p className="item-category">{item.category || "Artikel"}</p><h2>{item.name}</h2><p className="article-number">Art. <a href={articleUrl(item.articleNumber)} target="_blank" rel="noopener noreferrer" aria-label={`Artikel ${item.articleNumber} bei Würth öffnen`}>{item.articleNumber}</a></p></div><span className="pack-count">{line.purchasePacks}<small>VE</small></span></div><div className="shop-quantity"><span>Würth-Bestellmenge</span><strong>{units(line.shopQuantity, "Würth-Stück")}</strong><small>1 Würth-Stück = {item.contentsPerSalesUnit} {item.stockUnit} · 1 VE = {item.purchaseMultipleSalesUnits} Würth-Stück</small></div><div className="order-line-bottom"><div><strong>Enthält {units(line.orderedPieces, item.stockUnit)}</strong><span>{line.extraPieces ? `${line.extraPieces} ${item.stockUnit} durch volle Verpackungen zusätzlich` : "Deckt den Bedarf genau"}</span></div><strong>{line.netTotalCents == null ? "Preis offen" : money(line.netTotalCents)}</strong></div>{item.priceAsOf && <p className="price-date">Preisstand {new Date(item.priceAsOf).toLocaleDateString("de-DE")}</p>}</article>; })}</div>
            <div className="order-total"><div><span>Warenwert netto</span><strong>{order?.netTotalCents != null ? money(order.netTotalCents) : "Noch offen"}</strong></div><p>Erfasste Preise, keine Livepreise. Aktuelle Preise und Versand siehst du bei Würth.</p><label className={`quantity-confirmation ${unitConfirmed ? "confirmed" : ""}`}><input type="checkbox" checked={unitConfirmed} disabled={!quantitiesReady || saveStatus !== "saved" || handoffBusy} onChange={e => { setUnitConfirmed(e.target.checked); setHandoffError(""); }}/><span><strong>Packungen und Mengen geprüft</strong><small>Würth-Bestellmengen und enthaltene Stückzahlen passen.</small></span></label>{handoffError && <p className="form-error" role="alert">{handoffError}</p>}<button className="primary full-width" onClick={() => void handoffToWuerth()} disabled={!quantitiesReady || !unitConfirmed || handoffBusy || saveStatus === "error"}>{handoffBusy ? "Bereitet Übergabe vor …" : "An Würth übergeben"}<Icon type="arrow"/></button><p className="handoff-note">Du wechselst zu Würth und übernimmst die Artikel in den Warenkorb. Bestellt wird erst dort.</p></div>
          </>}
        </section>}
      </>}
    </main>
    {tab === "count" && activeItems.length > 0 && <div className="review-bar"><div><strong>{orderCount} Position{orderCount === 1 ? "" : "en"}</strong><span>{openCount ? `${openCount} noch offen` : "Alles erfasst"}</span></div><button className="primary" onClick={() => void showOrder()} disabled={busy || loading}>{busy ? "Prüft …" : "Vorschlag prüfen"}<Icon type="arrow"/></button></div>}
    <nav className="bottom-nav" aria-label="Hauptnavigation">{([{ id: "count", icon: "count", label: "Erfassen" }, { id: "order", icon: "order", label: "Vorschlag" }, { id: "items", icon: "items", label: "Artikel" }] as const).map(nav => <button key={nav.id} aria-current={tab === nav.id ? "page" : undefined} className={tab === nav.id ? "current" : ""} onClick={() => nav.id === "order" ? void showOrder() : setTab(nav.id)}><span><Icon type={nav.icon}/>{nav.id === "order" && orderCount > 0 && <b className="nav-badge">{orderCount}</b>}</span>{nav.label}</button>)}</nav>
    <dialog ref={dialog} className="editor-dialog" onCancel={() => setEditing(null)} onClose={() => setEditing(null)}><form onSubmit={saveItem}><div className="dialog-heading"><div><p className="eyebrow">Sortiment</p><h2>{editing === "new" ? "Artikel hinzufügen" : "Artikel bearbeiten"}</h2></div><button type="button" className="icon-button" aria-label="Schließen" onClick={() => setEditing(null)}><Icon type="close"/></button></div>{formError && <p className="form-error" role="alert">{formError}</p>}
      <label className="form-field"><span>Name</span><input autoFocus required value={form.name} onChange={e => setFormField("name", e.target.value)} placeholder="z. B. Bohrer 6 mm"/></label>
      <label className="form-field"><span>Würth-Artikelnummer</span><input required inputMode="numeric" value={form.articleNumber} onChange={e => setFormField("articleNumber", e.target.value)} placeholder="Führende Nullen mit eintragen" autoComplete="off"/></label>
      <div className="form-grid"><label className="form-field"><span>Kategorie</span><input value={form.category} onChange={e => setFormField("category", e.target.value)} list="known-categories" placeholder="z. B. Bohrer"/><datalist id="known-categories">{categories.map(c => <option key={c} value={c}/>)}</datalist></label><label className="form-field"><span>Zähleinheit</span><input value={form.stockUnit} onChange={e => setFormField("stockUnit", e.target.value)} placeholder="Blatt, Stück …"/></label></div>
      <label className="form-field"><span>Wie wird erfasst?</span><select value={form.orderMode} onChange={e => setFormField("orderMode", e.target.value as Mode)}><option value="stock">Bestand zählen</option><option value="empty">Leer melden → eine VE</option><option value="manual">Bestellmenge eingeben</option></select></label>
      {form.orderMode === "stock" && <fieldset><legend>Sollbestand in {form.stockUnit || "Stück"}</legend><div className="form-grid"><NumberField label="Kleinmaschinenlager" value={form.targetWorkshop} onChange={n => setFormField("targetWorkshop", n)}/><NumberField label="Büroreserve" value={form.targetReserve} onChange={n => setFormField("targetReserve", n)}/></div></fieldset>}
      <fieldset><legend>Verpackung bei Würth</legend><p className="field-help">Ein Würth-Stück kann ein ganzes Sägeblatt-Set sein. Die Angaben findest du am Artikel.</p><div className="form-grid"><NumberField label={`${form.stockUnit || "Stück"} je Würth-Stück`} value={form.contentsPerSalesUnit} onChange={n => setFormField("contentsPerSalesUnit", n ?? 0)}/><NumberField label="Würth-Stück je VE" value={form.purchaseMultipleSalesUnits} onChange={n => setFormField("purchaseMultipleSalesUnits", n ?? 0)}/></div><p className="pack-explainer">Eine Verpackung enthält <strong>{form.contentsPerSalesUnit * form.purchaseMultipleSalesUnits} {form.stockUnit || "Stück"}</strong>.</p></fieldset>
      <details className="price-details"><summary>Preis ergänzen</summary><label className="form-field"><span>Nettopreis je Würth-Stück in €</span><input type="text" inputMode="decimal" value={priceInput} onChange={e => setPriceInput(e.target.value)}/></label><label className="form-field"><span>Preisstand</span><input type="date" value={form.priceAsOf?.slice(0,10) ?? ""} onChange={e => setFormField("priceAsOf", e.target.value || null)}/></label></details>
      <div className="dialog-actions"><button type="submit" className="primary full-width" disabled={formBusy}>{formBusy ? "Speichert …" : "Artikel speichern"}</button>{editing !== "new" && <button type="button" className="archive-button" disabled={formBusy} onClick={() => void archiveItem()}>Aus Sortiment nehmen</button>}</div>
    </form></dialog>
    <dialog ref={connectionDialog} className="connection-dialog" onCancel={() => setShowConnection(false)} onClose={() => setShowConnection(false)}><form onSubmit={checkIds} autoComplete="off"><div className="dialog-heading"><h2>Würth-Verbindung</h2><button type="button" className="icon-button" aria-label="Schließen" onClick={() => setShowConnection(false)}><Icon type="close"/></button></div><p className="connection-intro">Trage eure IDS-Zugangsdaten ein. Der normale Shop-Login kann davon abweichen.</p>{idsLoading && <p className="connection-loading" role="status">Verbindungsdaten werden geladen …</p>}{idsError && <div className="form-error" role="alert"><p>{idsError}</p>{!idsSettingsLoaded && <button type="button" className="secondary compact" disabled={idsLoading} onClick={() => void loadIdsSettings()}>Daten erneut laden</button>}</div>}<label className="form-field"><span>Kundennummer</span><input required autoComplete="off" inputMode="numeric" value={idsCustomerNumber} disabled={idsLoading || idsChecking || handoffBusy} onChange={e => { setIdsCustomerNumber(e.target.value); resetIdsCheck(); }}/></label><label className="form-field"><span>IDS-Benutzer</span><input required autoComplete="off" autoCapitalize="none" spellCheck={false} value={idsUsername} disabled={idsLoading || idsChecking || handoffBusy} onChange={e => { setIdsUsername(e.target.value); resetIdsCheck(); }}/></label><label className="form-field"><span>IDS-Passwort</span><input required type="password" autoComplete="off" value={idsPassword} disabled={idsLoading || idsChecking || handoffBusy} onChange={e => { setIdsPassword(e.target.value); resetIdsCheck(); }}/><small className="field-help password-help">Bleibt nur für diese Sitzung im Arbeitsspeicher und wird nach der Übergabe geleert.</small></label><button type="submit" className="primary full-width" disabled={idsLoading || idsChecking || handoffBusy || !idsCustomerNumber.trim() || !idsUsername.trim() || !idsPassword}>{idsChecking ? "Prüft Verbindung …" : "Verbindung prüfen"}</button>{idsReachable && <div className="connection-result" role="status"><strong>Schnittstelle erreichbar</strong><p>Würth bestätigt Anmeldung und Warenkorb erst bei der Übergabe.</p></div>}<p className="connection-check-note">Die Prüfung übergibt noch keine Artikel. Anschließend im Vorschlag auf „An Würth übergeben“ tippen.</p><button type="button" className="secondary full-width" disabled={idsChecking} onClick={() => setShowConnection(false)}>Zurück zum Vorschlag</button></form></dialog>
  </div>;
}
