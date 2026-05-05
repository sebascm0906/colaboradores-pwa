import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildInventoryView } from '../src/modules/ruta/routeInventoryView.js'

test('buildInventoryView uses reconciliation totals even when line_ids are not expanded', () => {
  const view = buildInventoryView({
    id: 10,
    qty_loaded: 18,
    qty_delivered: 7,
    qty_returned: 3,
    qty_scrap: 0,
    qty_difference: 8,
  }, [
    { product_id: [760, 'Bolsa 5kg'], quantity: 18 },
  ])

  assert.equal(view.source, 'reconciliation')
  assert.deepEqual(view.totals, {
    loaded: 18,
    delivered: 7,
    returned: 3,
    scrap: 0,
    difference: 8,
  })
  assert.equal(view.lines[0].loaded, 18)
})
