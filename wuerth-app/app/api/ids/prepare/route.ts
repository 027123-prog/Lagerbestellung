import { z } from 'zod';
import { prepareIdsCart, IdsError } from '../../../../lib/ids.mjs';
import { getState } from '../../../../lib/store';
import { ApiError, api, json, readJson, requireOwner } from '../../../../lib/validation';

const prepareSchema = z.object({
  customerNumber: z.string().min(1).max(50), username: z.string().min(1).max(50),
  version: z.enum(['2.0', '2.3', '2.5']), unitConfirmed: z.boolean(),
}).strict();
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireOwner(request, true);
    const input = prepareSchema.parse(await readJson(request, 4_000));
    const state = await getState(user.userId);
    const hookUrl = new URL('/api/ids/return', new URL(request.url).origin).href;
    try { return json(prepareIdsCart({ ...input, items: state.items, entries: state.entries, hookUrl })); }
    catch (error) { if (error instanceof IdsError) throw new ApiError(error.status, error.message); throw error; }
  });
}
