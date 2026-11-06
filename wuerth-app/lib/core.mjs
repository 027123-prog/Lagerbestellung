/**
 * Mengen werden intern immer in einzelnen Blättern/Stücken geführt.
 * contentsPerSalesUnit: Inhalt eines kaufmännischen Shop-Stücks (z.B. 30 Blatt).
 * purchaseMultipleSalesUnits: erlaubter Bestellschritt im Shop (z.B. 5 Einzelblätter).
 * Keine Netzwerkzugriffe und keine Änderung des Bestands bei einer Berechnung.
 */
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const missing = value => value === null || value === undefined || value === '';
const whole = value => Number.isSafeInteger(value) && value >= 0;

function blankResult(product) {
  return {
    id: product?.id ?? null,
    articleNumber: product?.articleNumber ?? null,
    name: product?.name ?? '',
    stockUnit: product?.stockUnit ?? 'Stück',
    priceAsOf: product?.priceAsOf ?? null,
    status: 'open',
    errors: [],
    warnings: [],
    missingFields: [],
    requiredPieces: null,
    shopQuantity: null,
    purchasePacks: null,
    orderedPieces: null,
    extraPieces: null,
    netTotalCents: null,
    stockTotalPieces: null,
    targetTotalPieces: null,
    transfers: [],
  };
}

function readCount(input, field, result) {
  const value = input[field];
  if (missing(value)) {
    result.missingFields.push(field);
    return null;
  }
  if (!whole(value)) {
    result.errors.push({ field, code: 'nonnegative_integer_required' });
    return null;
  }
  return value;
}

/**
 * @returns status ready, open (fehlende Eingaben), invalid oder inactive.
 * Eine explizite manuelle 0 ist gültig und überschreibt die Bestandsrechnung.
 * Fehlende Preise verhindern die Mengenrechnung nicht; Kosten bleiben dann null.
 */
export function calculateLine(product, input = {}) {
  const result = blankResult(product);
  if (product?.active === false) {
    return { ...result, status: 'inactive', requiredPieces: 0, shopQuantity: 0,
      purchasePacks: 0, orderedPieces: 0, extraPieces: 0, netTotalCents: 0 };
  }
  if (!product || typeof product !== 'object') {
    return { ...result, status: 'invalid', errors: [{ field: 'product', code: 'product_required' }] };
  }
  for (const field of ['contentsPerSalesUnit', 'purchaseMultipleSalesUnits']) {
    if (!Number.isSafeInteger(product[field]) || product[field] <= 0) {
      result.errors.push({ field, code: 'positive_integer_required' });
    }
  }
  const knownPrice = !missing(product.netPricePerSalesUnitCents);
  if (knownPrice && !whole(product.netPricePerSalesUnitCents)) {
    result.errors.push({ field: 'netPricePerSalesUnitCents', code: 'nonnegative_integer_required' });
  }
  if (!knownPrice) result.warnings.push({ field: 'netPricePerSalesUnitCents', code: 'price_missing' });
  if (!input || typeof input !== 'object') input = {};
  const mode = input.mode ?? product.orderMode ?? 'stock';
  if (mode === 'manual') {
    result.requiredPieces = readCount(input, 'manualPieces', result);
  } else if (mode === 'empty') {
    if (missing(input.empty)) result.missingFields.push('empty');
    else if (typeof input.empty !== 'boolean') result.errors.push({ field: 'empty', code: 'boolean_required' });
    else if (!result.errors.length) {
      const required = input.empty ? BigInt(product.contentsPerSalesUnit) * BigInt(product.purchaseMultipleSalesUnits) : 0n;
      if (required > MAX) result.errors.push({ field: 'order', code: 'quantity_overflow' });
      else result.requiredPieces = Number(required);
    }
  } else if (mode === 'stock') {
    const workshop = readCount(input, 'stockWorkshop', result);
    const reserve = readCount(input, 'stockReserve', result);
    const targets = {
      targetWorkshop: Object.hasOwn(input, 'targetWorkshop') ? input.targetWorkshop : product.targetWorkshop,
      targetReserve: Object.hasOwn(input, 'targetReserve') ? input.targetReserve : product.targetReserve,
    };
    const targetWorkshop = readCount(targets, 'targetWorkshop', result);
    const targetReserve = readCount(targets, 'targetReserve', result);
    if (!result.missingFields.length && !result.errors.length) {
      const stockTotal = BigInt(workshop) + BigInt(reserve);
      const targetTotal = BigInt(targetWorkshop) + BigInt(targetReserve);
      if (stockTotal > MAX || targetTotal > MAX) {
        result.errors.push({ field: 'stock', code: 'quantity_overflow' });
      } else {
        result.stockTotalPieces = Number(stockTotal);
        result.targetTotalPieces = Number(targetTotal);
        result.requiredPieces = Number(targetTotal > stockTotal ? targetTotal - stockTotal : 0n);
        const toReserve = Math.min(Math.max(0, workshop - targetWorkshop), Math.max(0, targetReserve - reserve));
        const toWorkshop = Math.min(Math.max(0, reserve - targetReserve), Math.max(0, targetWorkshop - workshop));
        if (toReserve) result.transfers.push({ from: 'workshop', to: 'reserve', pieces: toReserve });
        if (toWorkshop) result.transfers.push({ from: 'reserve', to: 'workshop', pieces: toWorkshop });
      }
    }
  } else {
    result.errors.push({ field: 'mode', code: 'unknown_mode' });
  }
  if (result.errors.length) return { ...result, status: 'invalid' };
  if (result.missingFields.length) return result;

  // Ganzzahlige Packungsrundung und Centrechnung, ohne gerundete Blattpreise.
  const contents = BigInt(product.contentsPerSalesUnit);
  const multiple = BigInt(product.purchaseMultipleSalesUnits);
  const packPieces = contents * multiple;
  const required = BigInt(result.requiredPieces);
  const packs = (required + packPieces - 1n) / packPieces;
  const shopQuantity = packs * multiple;
  const ordered = shopQuantity * contents;
  const totalCents = knownPrice ? shopQuantity * BigInt(product.netPricePerSalesUnitCents) : null;
  if (packs > MAX || shopQuantity > MAX || ordered > MAX || (totalCents !== null && totalCents > MAX)) {
    return { ...result, status: 'invalid', errors: [{ field: 'order', code: 'quantity_or_cost_overflow' }] };
  }
  return {
    ...result,
    status: 'ready',
    shopQuantity: Number(shopQuantity),
    purchasePacks: Number(packs),
    orderedPieces: Number(ordered),
    extraPieces: Number(ordered - required),
    netTotalCents: totalCents === null ? (shopQuantity === 0n ? 0 : null) : Number(totalCents),
  };
}

/**
 * inputs ist ein Objekt oder eine Map, indiziert nach product.id.
 * orderLines enthält nur positive, fertig berechnete Mengen.
 * hasIncompleteInputs zeigt zusätzlich nicht berechnete aktive Positionen an;
 * canPrepareCart wird bei fehlenden/fehlerhaften Mengen nicht auf true gesetzt.
 * Vollständige Kostensumme nur, wenn alle Eingaben und Preise vorliegen.
 */
export function calculateOrder(products, inputs = {}) {
  if (!Array.isArray(products)) throw new TypeError('products muss ein Array sein.');
  const seen = new Set();
  const lines = products.map(product => {
    let input = {};
    if (inputs instanceof Map) input = inputs.get(product?.id) ?? {};
    else if (inputs && Object.hasOwn(inputs, product?.id)) input = inputs[product.id];
    const line = calculateLine(product, input);
    if (!product?.id || seen.has(product.id)) {
      return { ...line, status: 'invalid', errors: [...line.errors,
        { field: 'id', code: product?.id ? 'duplicate_product_id' : 'product_id_required' }] };
    }
    seen.add(product.id);
    return line;
  });
  const invalidLines = lines.filter(line => line.status === 'invalid');
  const openLines = lines.filter(line => line.status === 'open');
  const orderLines = lines.filter(line => line.status === 'ready' && line.shopQuantity > 0);
  const hasIncompleteInputs = invalidLines.length > 0 || openLines.length > 0;
  const hasMissingPrices = orderLines.some(line => line.netTotalCents === null);
  const knownSubtotal = orderLines.reduce((sum, line) => sum + BigInt(line.netTotalCents ?? 0), 0n);
  const costOverflow = knownSubtotal > MAX;
  const status = invalidLines.length || costOverflow ? 'invalid' : openLines.length ? 'open' : 'ready';
  return {
    status,
    lines,
    orderLines,
    blockedLineIds: [...invalidLines, ...openLines].map(line => line.id),
    hasIncompleteInputs,
    hasMissingPrices,
    canPrepareCart: status === 'ready' && orderLines.length > 0,
    knownNetSubtotalCents: costOverflow ? null : Number(knownSubtotal),
    netTotalCents: hasIncompleteInputs || hasMissingPrices || costOverflow ? null : Number(knownSubtotal),
    errors: costOverflow ? [{ field: 'netTotalCents', code: 'cost_overflow' }] : [],
  };
}
