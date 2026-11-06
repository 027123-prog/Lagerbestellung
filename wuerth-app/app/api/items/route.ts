import { createProduct, ensureBootstrap } from "../../../lib/store";
import { api, json, productSchema, readJson, requireOwner } from "../../../lib/validation";

export async function POST(request: Request) {
  return api(async () => {
    const user = await requireOwner(request, true);
    const input = productSchema.parse(await readJson(request));
    await ensureBootstrap(user.userId);
    return json(await createProduct(user.userId, input), 201);
  });
}
