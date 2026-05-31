export function resolveHarvestProduct({ slot = {}, tank = {} } = {}) {
  const slotId = Number(slot?.product_id || 0)
  if (slotId) {
    return {
      product_id: slotId,
      product_name: String(slot?.product_name || '').trim(),
      source: 'slot',
    }
  }

  const tankId = Number(tank?.product_id || 0)
  if (tankId) {
    return {
      product_id: tankId,
      product_name: String(tank?.product_name || '').trim(),
      source: 'tank',
    }
  }

  return {
    product_id: 0,
    product_name: '',
    source: 'missing',
  }
}

export function resolveHarvestShiftId({ slot = {}, activeShift = {} } = {}) {
  // La cosecha se registra contra el TURNO ACTIVO del operador (turno de cosecha),
  // NO contra el turno en que se llenó el slot. El slot.shift_id (=x_shift_id)
  // arrastra el turno de llenado, que típicamente ya está cerrado 25h después
  // cuando se cosecha. Si la packing.entry queda en ese turno cerrado, el
  // almacenista PT (que consulta por turno activo) no la verá en recepciones
  // pendientes.
  //
  // Priorizar activeShift.id; fallback al shift del slot solo si no hay turno
  // activo (caso edge: operador sin turno abierto — el backend rechazará igual,
  // pero al menos quedará trazabilidad al slot).
  const activeId = Number(activeShift?.id || 0)
  if (activeId) return activeId
  return Number(slot?.shift_id || 0)
}

export function resolveBarHarvestQuantities({ tank = {}, scrapBars = 0 } = {}) {
  const configuredBars = Number(tank?.bars_per_basket || 0)
  const totalBars = Number.isFinite(configuredBars) && configuredBars > 0
    ? Math.floor(configuredBars)
    : 8
  const kgPerBar = Number(tank?.kg_per_bar || 0)
  const normalizedScrapBars = Number(scrapBars || 0)

  const invalid = (error) => ({
    valid: false,
    error,
    totalBars,
    scrapBars: normalizedScrapBars,
    goodBars: 0,
    kgPerBar,
    scrapKg: 0,
    goodKg: 0,
  })

  if (!Number.isFinite(normalizedScrapBars) || normalizedScrapBars < 0) {
    return invalid('Las barras mermadas deben ser 0 o mayor')
  }
  if (!Number.isInteger(normalizedScrapBars)) {
    return invalid('Las barras mermadas deben ser un numero entero')
  }
  if (normalizedScrapBars > totalBars) {
    return invalid(`Las barras mermadas no pueden exceder ${totalBars}`)
  }

  const goodBars = totalBars - normalizedScrapBars
  const scrapKg = normalizedScrapBars * kgPerBar
  const goodKg = goodBars * kgPerBar

  return {
    valid: true,
    error: '',
    totalBars,
    scrapBars: normalizedScrapBars,
    goodBars,
    kgPerBar,
    scrapKg,
    goodKg,
  }
}

export function buildBarHarvestScrapNotes({ slot = {}, tank = {}, quantities = {} } = {}) {
  const slotName = String(slot?.name || '').trim() || 'sin canastilla'
  const tankName = String(tank?.display_name || tank?.name || '').trim() || 'sin tanque'
  const scrapBars = Number(quantities?.scrapBars || 0)
  const goodBars = Number(quantities?.goodBars || 0)
  const totalBars = Number(quantities?.totalBars || 0)
  const scrapKg = Number(quantities?.scrapKg || 0)

  return [
    `Cosecha barra ${slotName}`,
    tankName,
    `${scrapBars} barras mermadas`,
    `${goodBars} barras buenas`,
    totalBars ? `${totalBars} barras totales` : '',
    scrapKg ? `${scrapKg} kg merma` : '',
  ].filter(Boolean).join(' · ')
}

export function buildPtReceptionFromHarvest({ slot = {}, tank = {}, scrapBars = 0 } = {}) {
  const product = resolveHarvestProduct({ slot, tank })
  const slotName = String(slot?.name || '').trim()
  const tankName = String(tank?.display_name || tank?.name || '').trim()
  const quantities = resolveBarHarvestQuantities({ tank, scrapBars })
  const qtyReported = quantities.valid ? quantities.goodBars : 0
  const scrapNote = quantities.valid && quantities.scrapBars > 0
    ? ` · ${quantities.scrapBars} mermadas`
    : ''

  return {
    product_id: product.product_id,
    product_name: product.product_name,
    qty_reported: qtyReported,
    total_bars: quantities.totalBars,
    scrap_bars: quantities.valid ? quantities.scrapBars : 0,
    good_bars: qtyReported,
    source_product_id: Number(slot?.product_id || 0),
    source_product_name: String(slot?.product_name || '').trim(),
    notes: `Cosecha barra ${slotName} · ${tankName}${scrapNote}`.trim(),
  }
}

function normalizeHarvestedProduct(productId, productName, source) {
  const normalizedId = Number(productId || 0)
  if (!normalizedId) return null
  return {
    product_id: normalizedId,
    product_name: String(productName || '').trim(),
    source,
  }
}

export function resolvePackedProductFromHarvest({ harvestResult = {}, fallbackProduct = {} } = {}) {
  const candidates = [
    normalizeHarvestedProduct(harvestResult?.product_id, harvestResult?.product_name, 'harvest'),
    normalizeHarvestedProduct(harvestResult?.data?.product_id, harvestResult?.data?.product_name, 'harvest'),
    normalizeHarvestedProduct(harvestResult?.result?.product_id, harvestResult?.result?.product_name, 'harvest'),
    normalizeHarvestedProduct(fallbackProduct?.product_id, fallbackProduct?.product_name, 'fallback'),
  ]

  return candidates.find(Boolean) || {
    product_id: 0,
    product_name: '',
    source: 'missing',
  }
}
