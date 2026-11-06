import { z } from "zod";
import { getChatGPTUser } from "../app/chatgpt-auth";

const count = z.number().int("Bitte eine ganze Stückzahl eingeben.").min(0, "Die Menge darf nicht negativ sein.").max(Number.MAX_SAFE_INTEGER);
const positiveCount = count.min(1, "Die Packungsmenge muss mindestens eins sein.");
export const uuidSchema = z.string().uuid("Ungültige Artikel-ID.");
export const productSchema = z.object({
  articleNumber: z.string().trim().regex(/^\d{5,20}$/, "Bitte die vollständige Artikelnummer als Ziffern eingeben."),
  name: z.string().trim().min(1, "Bitte eine Bezeichnung eingeben.").max(160),
  category: z.string().trim().min(1).max(80).default("Sonstiges"),
  stockUnit: z.string().trim().min(1).max(24).default("Stück"),
  orderMode: z.enum(["stock", "empty", "manual"]).default("stock"),
  contentsPerSalesUnit: positiveCount,
  purchaseMultipleSalesUnits: positiveCount,
  netPricePerSalesUnitCents: count.nullable().optional().default(null),
  priceAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().default(null),
  targetWorkshop: count.nullable().optional().default(null),
  targetReserve: count.nullable().optional().default(null),
  active: z.boolean().default(true),
});

export const entrySchema = z.object({
  mode: z.enum(["stock", "empty", "manual"]).optional(),
  stockWorkshop: count.nullable().optional(),
  stockReserve: count.nullable().optional(),
  targetWorkshop: count.nullable().optional(),
  targetReserve: count.nullable().optional(),
  manualPieces: count.nullable().optional(),
  empty: z.boolean().nullable().optional(),
}).strict();

export const entryMapSchema = z.object({
  entries: z.record(uuidSchema, entrySchema),
}).refine(value => Object.keys(value.entries).length <= 500, "Zu viele Positionen in einer Anfrage.");
export type ProductInput = z.infer<typeof productSchema>;
export type EntryInput = z.infer<typeof entrySchema>;

const legacyQuantity = z.number().finite("Bitte eine endliche Zahl eingeben.").min(0, "Die Menge darf nicht negativ sein.").nullable().optional().default(null);
const legacyText = z.string().max(500, "Dieser Text darf höchstens 500 Zeichen lang sein.");
const legacyItemSchema = z.object({
  article: legacyText.optional().default(""),
  size: legacyText.optional().default(""),
  target_stock: legacyQuantity,
  current_stock: legacyQuantity,
  order_qty: legacyQuantity,
  unit: legacyText.optional().default(""),
});
const legacyGroupSchema = z.object({
  name: legacyText,
  supplier_email: legacyText.optional().default(""),
  entryMode: z.enum(["stock", "order"]).optional(),
  items: z.array(legacyItemSchema).max(2000, "Eine Gruppe enthält zu viele Artikel."),
});
export const legacyGroupsSchema = z.array(legacyGroupSchema).max(100, "Es sind höchstens 100 Gruppen möglich.")
  .refine(groups => groups.reduce((total, group) => total + group.items.length, 0) <= 2000, "Es sind insgesamt höchstens 2000 Artikel möglich.");
export const legacyPayloadSchema = z.object({ groups: legacyGroupsSchema, entryMode: z.enum(["stock", "order"]).optional() });
export type LegacyGroups = z.infer<typeof legacyGroupsSchema>;
export type LegacyState = { groups: LegacyGroups; entryMode: "stock" | "order" };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireOwner(request: Request, write = false) {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "Bitte zuerst anmelden.");
  if (write) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      throw new ApiError(403, "Diese Änderung muss aus der Bestellhilfe gestartet werden.");
    }
  }
  return user;
}

export async function readJson(request: Request, maxLength = 500_000) {
  const body = await request.text();
  if (body.length > maxLength) throw new ApiError(413, "Die Anfrage ist zu groß.");
  try { return JSON.parse(body); }
  catch { throw new ApiError(400, "Die Eingabe konnte nicht gelesen werden."); }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function api(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) {
      return json({ error: "Bitte die markierten Angaben prüfen.", issues: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, 400);
    }
    // Do not log request bodies, SQL arguments, catalogue data or credentials.
    console.error("Bestellhilfe API failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "Speichern oder Laden ist gerade nicht möglich. Bitte erneut versuchen." }, 500);
  }
}
