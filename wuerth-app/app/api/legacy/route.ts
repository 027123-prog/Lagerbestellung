import { loadLegacyState, saveLegacyGroups } from "../../../lib/store";
import { api, json, legacyPayloadSchema, readJson, requireOwner } from "../../../lib/validation";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireOwner(request);
    return json(await loadLegacyState(user.userId));
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireOwner(request, true);
    const input = legacyPayloadSchema.parse(await readJson(request, 2_000_000));
    await saveLegacyGroups(user.userId, input.groups, input.entryMode);
    return json({ saved: true });
  });
}
