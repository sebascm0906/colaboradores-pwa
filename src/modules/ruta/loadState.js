const PENDING_LOAD_STATES = new Set(['confirmed', 'assigned', 'waiting', 'partially_available'])

export function getPickingId(value) {
  if (Array.isArray(value)) return Number(value[0] || 0)
  return Number(value || 0)
}

function inferInitialPickingId(plan, load, rawCards) {
  const planName = String(load?.name || plan?.name || '')
  const originalLoad = rawCards.find((raw) => (
    planName && String(raw?.origin || '').includes(`${planName}/LOAD`)
  ))
  const doneInitial = rawCards.find((raw) => (
    String(raw?.state || '') === 'done'
    && (raw?.load_kind === 'initial' || raw?.gf_route_load_kind === 'initial' || !raw?.load_kind || !raw?.gf_route_load_kind)
  ))
  return getPickingId(originalLoad?.picking_id || originalLoad?.id || doneInitial?.picking_id || doneInitial?.id || load?.load_picking_id || plan?.load_picking_id)
}

export function normalizeLoadCard(raw, initialPickingId, hasMultipleLoadCards = false) {
  const pickingId = getPickingId(raw?.picking_id || raw?.id || raw?.load_picking_id)
  if (!pickingId) return null
  const accepted = raw?.accepted === true || raw?.gf_route_load_accepted === true
  const fieldKind = raw?.load_kind || raw?.gf_route_load_kind || ''
  const loadKind = pickingId === initialPickingId
    ? 'initial'
    : (fieldKind === 'refill' || hasMultipleLoadCards ? 'refill' : (fieldKind || 'initial'))
  return {
    ...raw,
    id: pickingId,
    picking_id: pickingId,
    name: raw?.name || raw?.picking_name || `Picking ${pickingId}`,
    state: raw?.state || raw?.picking_state || '',
    accepted,
    gf_route_load_accepted: accepted,
    load_kind: loadKind,
    isRefill: loadKind === 'refill',
    scheduled_date: raw?.scheduled_date || raw?.create_date || '',
  }
}

export function buildLoadState(plan, load) {
  const rawCards = Array.isArray(load?.load_pickings) ? load.load_pickings : []
  const rawPending = Array.isArray(load?.pending_loads) ? load.pending_loads : []
  const initialPickingId = inferInitialPickingId(plan, load, rawCards)
  const hasMultipleLoadCards = rawCards.length > 1
  const cardsById = new Map()

  for (const raw of rawCards) {
    const card = normalizeLoadCard(raw, initialPickingId, hasMultipleLoadCards)
    if (card) cardsById.set(card.picking_id, card)
  }

  if (initialPickingId && !cardsById.has(initialPickingId)) {
    const fallbackIsRefill = load?.load_sealed === true
    const card = normalizeLoadCard({
      picking_id: initialPickingId,
      name: fallbackIsRefill ? 'Recarga pendiente' : 'Carga inicial',
      state: 'assigned',
      accepted: false,
      load_kind: fallbackIsRefill ? 'refill' : 'initial',
    }, fallbackIsRefill ? 0 : initialPickingId, false)
    if (card) cardsById.set(card.picking_id, card)
  }

  for (const raw of rawPending) {
    const card = normalizeLoadCard(raw, initialPickingId, hasMultipleLoadCards)
    if (card) cardsById.set(card.picking_id, { ...cardsById.get(card.picking_id), ...card, accepted: false })
  }

  const loadCards = Array.from(cardsById.values()).filter(Boolean)
  const pendingLoads = rawPending.length > 0
    ? rawPending.map((raw) => normalizeLoadCard(raw, initialPickingId, hasMultipleLoadCards)).filter(Boolean)
    : loadCards.filter((card) => PENDING_LOAD_STATES.has(card.state) && card.accepted !== true)

  return { loadCards, pendingLoads }
}
