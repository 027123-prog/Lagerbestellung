import { env } from "cloudflare:workers";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { entries, products, settings } from "../db/schema";
import { ApiError, entrySchema, legacyPayloadSchema, productSchema, type EntryInput, type LegacyGroups, type LegacyState, type ProductInput } from "./validation";

export type Product = typeof products.$inferSelect;
const owned = (ownerId: string, id: string) => and(eq(products.ownerId, ownerId), eq(products.id, id));
const now = () => new Date().toISOString();

function visibleProduct(row: Product) {
  const { ownerId: _ownerId, createdAt: _createdAt, updatedAt: _updatedAt, sortOrder: _sortOrder, ...visible } = row;
  return visible;
}

async function stableUuid(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes.slice(0, 16)].map(n => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function ensureBootstrap(ownerId: string) {
  const db = getDb();
  const key = "catalogue_bootstrap_v1";
  const done = await db.select().from(settings).where(and(eq(settings.ownerId, ownerId), eq(settings.key, key))).get();
  if (done || !env.BOOTSTRAP_CATALOG_JSON) return;
  let raw: unknown;
  try { raw = JSON.parse(env.BOOTSTRAP_CATALOG_JSON); }
  catch { throw new ApiError(500, "Das Startsortiment konnte nicht gelesen werden."); }
  const seed = Array.isArray(raw) ? raw : (raw && typeof raw === "object" && "items" in raw ? raw.items : null);
  if (!Array.isArray(seed) || seed.length > 500) throw new ApiError(500, "Das Startsortiment ist nicht gültig.");
  let parsed: ProductInput[];
  try { parsed = seed.map(item => productSchema.parse(item)); }
  catch { throw new ApiError(500, "Das Startsortiment enthält ungültige Artikelangaben."); }
  const stamp = now();
  // This is runtime seeding, never migration-owned data. Stable keys make retries safe.
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    const id = await stableUuid(`${ownerId}\n${item.articleNumber}\n${item.name}`);
    await db.insert(products).values({ ...item, id, ownerId, sortOrder: i, createdAt: stamp, updatedAt: stamp }).onConflictDoNothing();
  }
  await db.insert(settings).values({ ownerId, key, value: "done", updatedAt: stamp }).onConflictDoNothing();
}

export async function listProducts(ownerId: string) {
  const rows = await getDb().select().from(products).where(and(eq(products.ownerId, ownerId), eq(products.active, true))).orderBy(asc(products.sortOrder), asc(products.name));
  return rows.map(visibleProduct);
}

export async function getProduct(ownerId: string, id: string) {
  const row = await getDb().select().from(products).where(owned(ownerId, id)).get();
  if (!row) throw new ApiError(404, "Dieser Artikel wurde nicht gefunden.");
  return row;
}

export async function createProduct(ownerId: string, input: ProductInput) {
  const id = crypto.randomUUID();
  const stamp = now();
  await getDb().insert(products).values({ ...input, id, ownerId, sortOrder: Date.now(), createdAt: stamp, updatedAt: stamp });
  return visibleProduct(await getProduct(ownerId, id));
}

export async function updateProduct(ownerId: string, id: string, input: unknown) {
  const original = await getProduct(ownerId, id);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "Bitte gültige Artikelangaben eingeben.");
  const next = productSchema.parse({ ...original, ...input });
  await getDb().update(products).set({ ...next, updatedAt: now() }).where(owned(ownerId, id));
  return visibleProduct(await getProduct(ownerId, id));
}

export async function deactivateProduct(ownerId: string, id: string) {
  await getProduct(ownerId, id);
  await getDb().update(products).set({ active: false, updatedAt: now() }).where(owned(ownerId, id));
}

export async function listEntries(ownerId: string) {
  const rows = await getDb().select().from(entries).where(eq(entries.ownerId, ownerId));
  const result: Record<string, EntryInput> = {};
  for (const row of rows) {
    try { result[row.productId] = entrySchema.parse(JSON.parse(row.data)); }
    catch { throw new ApiError(500, "Eine gespeicherte Erfassung ist ungültig. Bitte erneut erfassen."); }
  }
  return result;
}

export async function saveEntries(ownerId: string, changes: Record<string, EntryInput>) {
  const db = getDb();
  const current = await listEntries(ownerId);
  const allowed = new Set((await listProducts(ownerId)).map(item => item.id));
  for (const id of Object.keys(changes)) if (!allowed.has(id)) throw new ApiError(404, "Ein Artikel gehört nicht zum aktiven Sortiment.");
  // Validate the complete patch first, then atomically apply the prepared writes.
  const stamp = now();
  const operations = Object.entries(changes).map(([productId, patch]) => {
    const merged = entrySchema.parse({ ...current[productId], ...patch });
    const value = { ownerId, productId, data: JSON.stringify(merged), updatedAt: stamp };
    return db.insert(entries).values(value).onConflictDoUpdate({ target: [entries.ownerId, entries.productId], set: { data: value.data, updatedAt: stamp } });
  });
  if (operations.length) await db.batch(operations as [typeof operations[number], ...typeof operations]);
  return listEntries(ownerId);
}

export async function getState(ownerId: string) {
  await ensureBootstrap(ownerId);
  return { items: await listProducts(ownerId), entries: await listEntries(ownerId), connection: { configured: false } };
}

const LEGACY_GROUPS_KEY = "legacy_groups";

function parseLegacyState(value: string, initial = false): LegacyState {
  try {
    const raw: unknown = JSON.parse(value);
    const parsed = legacyPayloadSchema.parse(Array.isArray(raw) ? { groups: raw } : raw);
    return { groups: parsed.groups, entryMode: parsed.entryMode ?? "stock" };
  } catch {
    throw new ApiError(500, initial ? "Die vorhandene Lagerliste konnte nicht eingelesen werden." : "Die gespeicherte Lagerliste konnte nicht gelesen werden.");
  }
}

export async function loadLegacyState(ownerId: string): Promise<LegacyState> {
  const db = getDb();
  const condition = and(eq(settings.ownerId, ownerId), eq(settings.key, LEGACY_GROUPS_KEY));
  const saved = await db.select().from(settings).where(condition).get();
  if (saved) return parseLegacyState(saved.value);
  if (!env.LEGACY_GROUPS_JSON) return { groups: [], entryMode: "stock" };
  const state = parseLegacyState(env.LEGACY_GROUPS_JSON, true);
  // A simultaneous explicit save wins over this one-time initial catalogue.
  await db.insert(settings).values({ ownerId, key: LEGACY_GROUPS_KEY, value: JSON.stringify(state), updatedAt: now() }).onConflictDoNothing();
  const result = await db.select().from(settings).where(condition).get();
  return result ? parseLegacyState(result.value) : state;
}

export async function saveLegacyGroups(ownerId: string, groups: LegacyGroups, entryMode?: "stock" | "order") {
  const parsed = legacyPayloadSchema.parse({ groups, entryMode });
  const mode = parsed.entryMode ?? (await loadLegacyState(ownerId)).entryMode;
  const value = JSON.stringify({ groups: parsed.groups, entryMode: mode });
  await getDb().insert(settings).values({ ownerId, key: LEGACY_GROUPS_KEY, value, updatedAt: now() })
    .onConflictDoUpdate({ target: [settings.ownerId, settings.key], set: { value, updatedAt: now() } });
}
