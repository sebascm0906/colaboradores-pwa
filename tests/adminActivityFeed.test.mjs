import test from 'node:test'
import assert from 'node:assert/strict'

import { buildModuleActivityFeed } from '../src/modules/admin/activityFeedModel.js'

test('buildModuleActivityFeed returns only expense events for gastos module', () => {
  const events = buildModuleActivityFeed('gastos', {
    sales: [
      { id: 11, name: 'S14717', amount_total: 120, date_order: '2026-05-13 12:00:00' },
    ],
    expenses: [
      { id: 21, name: 'Prueba', total_amount: 500, payment_mode: 'company_account', create_date: '2026-05-13 13:00:00' },
    ],
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'expense')
  assert.equal(events[0].label, 'Prueba')
})

test('buildModuleActivityFeed returns only sale events for pos module', () => {
  const events = buildModuleActivityFeed('pos', {
    sales: [
      { id: 11, name: 'S14717', amount_total: 120, date_order: '2026-05-13 12:00:00', partner_name: 'Público general' },
    ],
    expenses: [
      { id: 21, name: 'Prueba', total_amount: 500, payment_mode: 'company_account', create_date: '2026-05-13 13:00:00' },
    ],
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'sale')
  assert.equal(events[0].label, 'S14717')
})

test('buildModuleActivityFeed returns only transfer events for traspaso mp module', () => {
  const events = buildModuleActivityFeed('traspaso-mp', {
    sales: [
      { id: 11, name: 'S14717', amount_total: 120, date_order: '2026-05-13 12:00:00' },
    ],
    expenses: [
      { id: 21, name: 'Prueba', total_amount: 500, payment_mode: 'company_account', create_date: '2026-05-13 13:00:00' },
    ],
    transfers: [
      {
        id: 31,
        material_name: 'MP BOLSA LAURITA ROLITO (5.5KG)',
        qty_issued: 25,
        uom: 'Units',
        state: 'issued',
        create_date: '2026-05-13 14:00:00',
      },
    ],
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'transfer')
  assert.match(events[0].label, /LAURITA ROLITO/i)
})
