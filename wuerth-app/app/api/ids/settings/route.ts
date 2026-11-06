import { env } from 'cloudflare:workers';
import { IDS_ENDPOINT } from '../../../../lib/ids.mjs';
import { api, json, requireOwner } from '../../../../lib/validation';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(async () => {
    await requireOwner(request);
    const config = env as unknown as Record<string, unknown>;
    return json({
      endpoint: IDS_ENDPOINT,
      customerNumber: typeof config.WURTH_IDS_CUSTOMER_NUMBER === 'string' ? config.WURTH_IDS_CUSTOMER_NUMBER : '',
      username: typeof config.WURTH_IDS_USERNAME === 'string' ? config.WURTH_IDS_USERNAME : '',
      configured: false, needsPassword: true, cartTested: false,
    });
  });
}
