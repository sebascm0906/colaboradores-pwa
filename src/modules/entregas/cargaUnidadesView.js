export function getCedisDispatchLabel(vans = []) {
  const firstWithSource = vans.find((van) => String(van?.cedis_location_name || '').trim())
  return String(firstWithSource?.cedis_location_name || '').trim()
}

export function getVanUnitLabel(van = {}) {
  return String(van?.mobile_location_name || '').trim() || `Ubicación ${van?.mobile_location_id || ''}`.trim()
}

export function getVanDispatchSourceLabel(van = {}) {
  return String(van?.cedis_location_name || '').trim() || 'Almacén de entregas'
}
