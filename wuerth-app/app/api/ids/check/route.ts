import { z } from 'zod';
import { checkIdsConnection, IdsError } from '../../../../lib/ids.mjs';
import { ApiError, api, json, readJson, requireOwner } from '../../../../lib/validation';

const checkSchema = z.object({
  customerNumber: z.string().min(1).max(50), username: z.string().min(1).max(50), password: z.string().min(1).max(200),
}).strict();
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return api(async () => {
    await requireOwner(request, true);
    const input = checkSchema.parse(await readJson(request, 4_000));
    try { return json(await checkIdsConnection(input)); }
    catch (error) { if (error instanceof IdsError) throw new ApiError(error.status, error.message); throw error; }
  });
}
