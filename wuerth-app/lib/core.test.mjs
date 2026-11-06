import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLine, calculateOrder } from './core.mjs';

const set30 = {
  id: 'wood150', articleNumber: '0123456789', name: 'Test Set 30', stockUnit: 'Blatt',
  contentsPerSalesUnit: 30, purchaseMultipleSalesUnits: 1,
  netPricePerSalesUnitCents: 4500, priceAsOf: '2026-01-01', active: true,
};
const starlock5 = {
  id: 'starlock', articleNumber: '0123456788', name: 'Test Einzelblatt', stockUnit: 'Blatt',
  contentsPerSalesUnit: 1, purchaseMultipleSalesUnits: 5,
  netPricePerSalesUnitCents: 500, priceAsOf: '2026-01-01', active: true,
};
const stock = (overrides = {}) => ({ mode: 'stock', stockWorkshop: 0, stockReserve: 0,
  targetWorkshop: 25, targetReserve: 25, ...overrides });

test('50 einzelne Blätter werden zu zwei kaufmännischen 30er-Sets', () => {
  const result = calculateLine(set30, stock());
  assert.equal(result.status, 'ready');
  assert.equal(result.requiredPieces, 50);
  assert.equal(result.shopQuantity, 2);
  assert.equal(result.purchasePacks, 2);
  assert.equal(result.orderedPieces, 60);
  assert.equal(result.extraPieces, 10);
  assert.equal(result.netTotalCents, 9000);
  assert.equal(result.articleNumber, '0123456789');
});

test('Starlock: sieben Blätter werden zehn Shop-Stück und zwei 5er-Packungen', () => {
  const result = calculateLine(starlock5, { mode: 'manual', manualPieces: 7 });
  assert.equal(result.shopQuantity, 10);
  assert.equal(result.purchasePacks, 2);
  assert.equal(result.orderedPieces, 10);
  assert.equal(result.extraPieces, 3);
  assert.equal(result.netTotalCents, 5000);
});

test('unbekannter Bestand bleibt offen; tatsächliche Null wird berechnet', () => {
  for (const empty of [null, undefined, '']) {
    const result = calculateLine(set30, stock({ stockWorkshop: empty }));
    assert.equal(result.status, 'open');
    assert.equal(result.shopQuantity, null);
    assert.equal(result.netTotalCents, null);
    assert.deepEqual(result.missingFields, ['stockWorkshop']);
  }
  assert.equal(calculateLine(set30, stock({ stockWorkshop: 0 })).requiredPieces, 50);
});

test('manuelle Null bleibt Null und benötigt keine Bestandsangaben', () => {
  const result = calculateLine(set30, { mode: 'manual', manualPieces: 0 });
  assert.equal(result.status, 'ready');
  assert.equal(result.requiredPieces, 0);
  assert.equal(result.shopQuantity, 0);
  assert.equal(result.netTotalCents, 0);
});

test('negative, gebrochene, numerische Texte und unendliche Mengen werden abgewiesen', () => {
  for (const value of [-1, 1.5, '7', Infinity, NaN]) {
    const result = calculateLine(set30, { mode: 'manual', manualPieces: value });
    assert.equal(result.status, 'invalid');
    assert.equal(result.shopQuantity, null);
  }
  const result = calculateLine(set30, stock({ targetReserve: -2 }));
  assert.equal(result.status, 'invalid');
});

test('Überbestand im Lager deckt fehlende Büroreserve ohne Kauf', () => {
  const result = calculateLine(set30, stock({ stockWorkshop: 40, stockReserve: 10 }));
  assert.equal(result.requiredPieces, 0);
  assert.equal(result.shopQuantity, 0);
  assert.deepEqual(result.transfers, [{ from: 'workshop', to: 'reserve', pieces: 15 }]);
});

test('Überschuss in der Reserve wird ebenfalls berücksichtigt', () => {
  const result = calculateLine(set30, stock({ stockWorkshop: 0, stockReserve: 40 }));
  assert.equal(result.requiredPieces, 10);
  assert.deepEqual(result.transfers, [{ from: 'reserve', to: 'workshop', pieces: 15 }]);
});

test('deaktivierte Position erzeugt keinen Auftrag', () => {
  const result = calculateLine({ ...set30, active: false }, { mode: 'manual', manualPieces: 50 });
  assert.equal(result.status, 'inactive');
  assert.equal(result.shopQuantity, 0);
  assert.equal(result.netTotalCents, 0);
});

test('fehlender Preis wird nicht als kostenloser Auftrag ausgegeben', () => {
  const result = calculateLine({ ...set30, netPricePerSalesUnitCents: null }, stock());
  assert.equal(result.status, 'ready');
  assert.equal(result.shopQuantity, 2);
  assert.equal(result.netTotalCents, null);
  assert.equal(result.warnings[0].code, 'price_missing');
});

test('Nullpreis ist erlaubt; ungültige Packungen oder Centbeträge nicht', () => {
  assert.equal(calculateLine({ ...set30, netPricePerSalesUnitCents: 0 }, stock()).netTotalCents, 0);
  for (const override of [{ contentsPerSalesUnit: 0 }, { purchaseMultipleSalesUnits: 0 },
    { contentsPerSalesUnit: 2.5 }, { netPricePerSalesUnitCents: -1 }, { netPricePerSalesUnitCents: 1.5 }]) {
    assert.equal(calculateLine({ ...set30, ...override }, stock()).status, 'invalid');
  }
});

test('Mengen- und Kostenüberläufe werden sichtbar abgefangen', () => {
  const result = calculateLine(set30, { mode: 'manual', manualPieces: Number.MAX_SAFE_INTEGER });
  assert.equal(result.status, 'invalid');
  assert.equal(result.shopQuantity, null);
  assert.equal(calculateLine(set30, stock({ stockWorkshop: Number.MAX_SAFE_INTEGER, stockReserve: 1 })).status, 'invalid');
});

test('Gesamtauswertung summiert nur tatsächliche Bestellpositionen', () => {
  const products = [set30, starlock5, { ...set30, id: 'off', active: false }];
  const inputs = { wood150: { mode: 'manual', manualPieces: 50 }, starlock: { mode: 'manual', manualPieces: 7 } };
  const result = calculateOrder(products, inputs);
  assert.equal(result.status, 'ready');
  assert.equal(result.orderLines.length, 2);
  assert.equal(result.netTotalCents, 14000);
  assert.equal(result.canPrepareCart, true);
});

test('offene Eingaben bleiben in Gesamtauswertung sichtbar', () => {
  const result = calculateOrder([set30, starlock5], { wood150: { mode: 'manual', manualPieces: 50 } });
  assert.equal(result.status, 'open');
  assert.equal(result.netTotalCents, null);
  assert.equal(result.knownNetSubtotalCents, 9000);
  assert.deepEqual(result.blockedLineIds, ['starlock']);
  assert.equal(result.canPrepareCart, false);
});

test('Gesamtsumme bleibt bei fehlendem Preis offen und doppelte IDs sind Fehler', () => {
  const result = calculateOrder([{ ...set30, netPricePerSalesUnitCents: null }], new Map([
    ['wood150', { mode: 'manual', manualPieces: 30 }],
  ]));
  assert.equal(result.hasMissingPrices, true);
  assert.equal(result.netTotalCents, null);
  const duplicate = calculateOrder([set30, set30], { wood150: { mode: 'manual', manualPieces: 0 } });
  assert.equal(duplicate.status, 'invalid');
  assert.equal(duplicate.lines[1].errors[0].code, 'duplicate_product_id');
});

test('Eingabedaten werden nicht verändert und leerer Warenkorb wird nicht vorbereitet', () => {
  const product = structuredClone(set30);
  const input = stock();
  const before = JSON.stringify({ product, input });
  calculateLine(product, input);
  assert.equal(JSON.stringify({ product, input }), before);
  assert.equal(calculateOrder([], {}).canPrepareCart, false);
});

test('leer markiert bestellt exakt eine VE und nutzt den Produktmodus', () => {
  const drill = { ...starlock5, orderMode: 'empty' };
  const result = calculateLine(drill, { empty: true });
  assert.equal(result.status, 'ready');
  assert.equal(result.requiredPieces, 5);
  assert.equal(result.purchasePacks, 1);
  assert.equal(result.shopQuantity, 5);
  assert.equal(result.orderedPieces, 5);
  assert.equal(result.extraPieces, 0);
});

test('nicht leer erzeugt keine Bestellung; nicht geprüft bleibt offen', () => {
  const drill = { ...set30, orderMode: 'empty' };
  assert.equal(calculateLine(drill, { empty: false }).shopQuantity, 0);
  for (const value of [null, undefined, '']) {
    const result = calculateLine(drill, { empty: value });
    assert.equal(result.status, 'open');
    assert.equal(result.shopQuantity, null);
    assert.deepEqual(result.missingFields, ['empty']);
  }
  assert.equal(calculateLine(drill, { empty: 'false' }).status, 'invalid');
});

test('Sollwerte stammen aus dem Artikel, explizit geleerter Sollwert bleibt offen', () => {
  const product = { ...set30, orderMode: 'stock', targetWorkshop: 25, targetReserve: 25 };
  assert.equal(calculateLine(product, { stockWorkshop: 5, stockReserve: 15 }).requiredPieces, 30);
  const result = calculateLine(product, { stockWorkshop: 5, stockReserve: 15, targetReserve: null });
  assert.equal(result.status, 'open');
  assert.deepEqual(result.missingFields, ['targetReserve']);
});

test('manuelle Null kann eine leere VE ausdrücklich übersteuern', () => {
  assert.equal(calculateLine({ ...starlock5, orderMode: 'empty' }, { empty: true, mode: 'manual', manualPieces: 0 }).shopQuantity, 0);
});
