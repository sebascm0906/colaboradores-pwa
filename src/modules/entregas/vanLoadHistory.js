function relationId(value) {
  if (Array.isArray(value)) return Number(value[0] || 0) || null
  const id = Number(value || 0)
  return id > 0 ? id : null
}

function relationName(value, fallback = '') {
  if (Array.isArray(value)) return value[1] || fallback
  return fallback
}

function formatTime(value) {
  if (!value) return ''
  const text = String(value)
  const time = text.includes(' ') ? text.split(' ')[1] : text.split('T')[1]
  return time ? time.slice(0, 5) : ''
}

function stateLabel(state) {
  switch (state) {
    case 'draft': return 'Borrador'
    case 'waiting': return 'En espera'
    case 'confirmed': return 'Confirmada'
    case 'assigned': return 'Reservada'
    case 'done': return 'Hecha'
    case 'cancel': return 'Cancelada'
    default: return state || 'Sin estado'
  }
}

function loadKindLabel(kind) {
  if (kind === 'refill') return 'Recarga'
  return 'Carga'
}

function normalizeLine(line = {}) {
  const productId = relationId(line.product_id) || relationId(line.productId)
  const productName = line.product_name
    || line.productName
    || relationName(line.product_id)
    || (productId ? `Producto ${productId}` : 'Producto')
  const qty = Number(line.qty ?? line.quantity ?? line.product_uom_qty ?? line.product_qty ?? 0) || 0
  return { productId, productName, qty }
}

export function normalizeVanLoadHistoryItems(rows = []) {
  if (!Array.isArray(rows)) return []
  return rows.map((row = {}) => {
    const lines = (Array.isArray(row.lines) ? row.lines : [])
      .map(normalizeLine)
      .filter((line) => line.productId && line.qty > 0)
    const loadKind = row.gf_route_load_kind || row.load_kind || row.loadKind || 'initial'
    const createDate = row.create_date || row.createDate || row.scheduled_date || row.date_done || ''
    const driverEmployeeId = relationId(row.driver_employee_id) || relationId(row.driverEmployeeId)
    const driverEmployeeName = row.driver_employee_name
      || row.driverEmployeeName
      || relationName(row.driver_employee_id)
      || ''
    const mobileLocationId = relationId(row.mobile_location_id)
      || relationId(row.mobileLocationId)
      || relationId(row.location_dest_id)
    const mobileLocationName = row.mobile_location_name
      || row.mobileLocationName
      || relationName(row.mobile_location_id)
      || relationName(row.location_dest_id)
      || ''
    const registeredById = relationId(row.registered_by_id) || relationId(row.user_id) || relationId(row.registeredById)
    const registeredByName = row.registered_by_name
      || row.registeredByName
      || relationName(row.registered_by_id)
      || relationName(row.user_id)
      || ''
    const routePlanId = relationId(row.route_plan_id) || relationId(row.gf_route_plan_id) || relationId(row.routePlanId)
    const routePlanName = row.route_plan_name
      || row.routePlanName
      || relationName(row.route_plan_id)
      || relationName(row.gf_route_plan_id)
      || ''

    return {
      id: Number(row.id || 0) || null,
      name: row.name || row.picking_name || '',
      state: row.state || '',
      stateLabel: stateLabel(row.state || ''),
      loadKind,
      loadKindLabel: loadKindLabel(loadKind),
      createDate,
      time: row.time || formatTime(createDate),
      driverEmployeeId,
      driverEmployeeName,
      mobileLocationId,
      mobileLocationName,
      registeredById,
      registeredByName,
      routePlanId,
      routePlanName,
      totalQty: lines.reduce((sum, line) => sum + line.qty, 0),
      lines,
    }
  }).sort((a, b) => String(a.createDate).localeCompare(String(b.createDate)))
}

export function groupVanLoadHistoryByVan(items = []) {
  const groups = new Map()
  for (const item of items) {
    const key = item.driverEmployeeId
      ? `driver:${item.driverEmployeeId}`
      : item.mobileLocationId
        ? `location:${item.mobileLocationId}`
        : 'unknown'
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: item.driverEmployeeName || item.mobileLocationName || 'Unidad sin asignar',
        driverEmployeeId: item.driverEmployeeId,
        mobileLocationId: item.mobileLocationId,
        totalLoads: 0,
        totalQty: 0,
        items: [],
      })
    }
    const group = groups.get(key)
    group.totalLoads += 1
    group.totalQty += item.totalQty
    group.items.push(item)
  }
  return [...groups.values()]
}

export function buildVanLoadHistorySummary(items = []) {
  return {
    totalLoads: items.length,
    totalVans: groupVanLoadHistoryByVan(items).length,
    totalQty: items.reduce((sum, item) => sum + item.totalQty, 0),
  }
}
