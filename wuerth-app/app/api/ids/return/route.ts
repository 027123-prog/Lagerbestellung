import { api, json, requireOwner } from '../../../../lib/validation';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return api(async () => {
    await requireOwner(request);
    return json({ message: 'Bitte den Warenkorb direkt bei Würth prüfen. Diese Bestellhilfe übernimmt noch keine Warenkorbrückgaben.', cartTested: false });
  });
}
export async function POST() {
  // Never parse, log or echo posted shop data. Private Sites cannot authenticate
  // a third-party callback. Receiving/persisting returns needs a separate design.
  return json({ error: 'Warenkorbrückgaben werden hier noch nicht übernommen. Bitte den Warenkorb bei Würth prüfen.' }, 403);
}
