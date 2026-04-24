const ALLOWED_DESTINATIONS = new Set(['rolito', 'pt'])

export function normalizeDispatchConfig(raw = {}) {
  const destinations = Array.isArray(raw?.material_dispatch?.destinations)
    ? raw.material_dispatch.destinations.filter((item) =>
        ALLOWED_DESTINATIONS.has(String(item?.key || ''))
      )
    : []

  return {
    warehouse_id: Number(raw?.warehouse_id || 0) || null,
    warehouse_name: raw?.warehouse_name || '',
    material_dispatch: { destinations },
    bags_policy: {
      product_id: Number(raw?.bags_policy?.product_id || 0) || null,
      product_name: raw?.bags_policy?.product_name || '',
      unit_cost: Number(raw?.bags_policy?.unit_cost || 0),
      auto_create_employee_debt: Boolean(raw?.bags_policy?.auto_create_employee_debt),
    },
  }
}

export function getEnabledDispatchDestinations(config = {}) {
  return Array.isArray(config?.material_dispatch?.destinations)
    ? config.material_dispatch.destinations
    : []
}
