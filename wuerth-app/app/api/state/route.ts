import { getState } from "../../../lib/store";
import { api, json, requireOwner } from "../../../lib/validation";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => { const user = await requireOwner(request); return json(await getState(user.userId)); });
}
