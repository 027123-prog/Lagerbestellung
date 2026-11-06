import { deactivateProduct, updateProduct } from "../../../../lib/store";
import { api, json, readJson, requireOwner, uuidSchema } from "../../../../lib/validation";

type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  return api(async () => {
    const user = await requireOwner(request, true);
    const id = uuidSchema.parse((await context.params).id);
    return json(await updateProduct(user.userId, id, await readJson(request)));
  });
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    const user = await requireOwner(request, true);
    const id = uuidSchema.parse((await context.params).id);
    await deactivateProduct(user.userId, id);
    return json({ ok: true });
  });
}
