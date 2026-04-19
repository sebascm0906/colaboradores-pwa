export const DEFAULT_SUPERVISION_WAREHOUSE_ID = 76

export function resolveSupervisionWarehouseId(session, preferredWarehouseId = 0) {
  const candidates = [
    preferredWarehouseId,
    session?.warehouse_id,
    session?.plant_warehouse_id,
    session?.warehouse?.id,
    DEFAULT_SUPERVISION_WAREHOUSE_ID,
  ]

  for (const value of candidates) {
    const warehouseId = Number(value || 0)
    if (Number.isFinite(warehouseId) && warehouseId > 0) {
      return warehouseId
    }
  }

  return DEFAULT_SUPERVISION_WAREHOUSE_ID
}
