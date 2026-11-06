import { saveEntries } from "../../../lib/store";
import { api, entryMapSchema, json, readJson, requireOwner } from "../../../lib/validation";

export async function PUT(request: Request) {
  return api(async () => {
    const user = await requireOwner(request, true);
    const patch = entryMapSchema.parse(await readJson(request));
    return json({ entries: await saveEntries(user.userId, patch.entries) });
  });
}
