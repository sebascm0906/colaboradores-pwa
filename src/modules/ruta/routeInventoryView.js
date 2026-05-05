function toLoadedQty(line) {
  return Number(line?.product_uom_qty || line?.quantity || line?.qty || 0)
}

function mapLoadLine(line) {
  const loaded = toLoadedQty(line)
  return {
    product: line.product_id?.[1] || line.product_name || 'Producto',
    product_id: line.product_id?.[0] || line.product_id,
    loaded,
    delivered: 0,
    returned: 0,
    scrap: 0,
    difference: 0,
    remaining: loaded,
  }
}

function mapReconciliationLine(line) {
  const loaded = Number(line.qty_loaded || 0)
  const delivered = Number(line.qty_delivered || 0)
  const returned = Number(line.qty_returned || 0)
  const scrap = Number(line.qty_scrap || 0)

  return {
    product: line.product_id?.[1] || line.product_name || 'Producto',
    product_id: line.product_id?.[0] || line.product_id,
    loaded,
    delivered,
    returned,
    scrap,
    difference: Number(line.qty_difference || 0),
    remaining: loaded - delivered - returned - scrap,
  }
}

function reconciliationTotals(reconciliation) {
  return {
    loaded: Number(reconciliation?.qty_loaded || 0),
    delivered: Number(reconciliation?.qty_delivered || 0),
    returned: Number(reconciliation?.qty_returned || 0),
    scrap: Number(reconciliation?.qty_scrap || 0),
    difference: Number(reconciliation?.qty_difference || 0),
  }
}

/**
 * Build inventory view: what was loaded vs delivered vs returned vs remaining.
 * Uses reconciliation totals when available; line_ids may be omitted by the
 * backend proxy when relation expansion is not allowed.
 */
export function buildInventoryView(reconciliation, loadLines) {
  const reconciliationLines = Array.isArray(reconciliation?.line_ids) ? reconciliation.line_ids : []
  if (reconciliation) {
    return {
      source: 'reconciliation',
      totals: reconciliationTotals(reconciliation),
      lines: reconciliationLines.length > 0
        ? reconciliationLines.map(mapReconciliationLine)
        : (Array.isArray(loadLines) ? loadLines.map(mapLoadLine) : []),
    }
  }

  if (loadLines && loadLines.length > 0) {
    const totalLoaded = loadLines.reduce((s, l) => s + toLoadedQty(l), 0)
    return {
      source: 'load_lines',
      totals: {
        loaded: totalLoaded,
        delivered: 0,
        returned: 0,
        scrap: 0,
        difference: 0,
      },
      lines: loadLines.map(mapLoadLine),
    }
  }

  return { source: 'empty', totals: { loaded: 0, delivered: 0, returned: 0, scrap: 0, difference: 0 }, lines: [] }
}
