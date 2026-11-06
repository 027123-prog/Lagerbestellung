import { calculateOrder } from "../../../lib/core.mjs";
import { getState } from "../../../lib/store";
import { api, json, requireOwner } from "../../../lib/validation";

export async function POST(request: Request) {
  return api(async () => {
    const user = await requireOwner(request, true);
    const state = await getState(user.userId);
    return json(calculateOrder(state.items, state.entries));
  });
}
