import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildVanLoadHistorySummary,
  groupVanLoadHistoryByVan,
  mexicoDateRangeToOdooUtc,
  mexicoTodayDateKey,
  normalizeVanLoadHistoryItems,
} from '../src/modules/entregas/vanLoadHistory.js'

test('mexicoDateRangeToOdooUtc builds UTC boundaries for a Mexico calendar day', () => {
  assert.deepEqual(mexicoDateRangeToOdooUtc('2026-05-28'), {
    start: '2026-05-28 06:00:00',
    end: '2026-05-29 06:00:00',
  })
})

test('mexicoTodayDateKey uses Mexico calendar day instead of browser UTC day', () => {
  assert.equal(mexicoTodayDateKey(new Date('2026-05-29T03:30:00Z')), '2026-05-28')
})

test('normalizeVanLoadHistoryItems displays Odoo UTC datetimes in Mexico time', () => {
  const [item] = normalizeVanLoadHistoryItems([
    {
      id: 500,
      name: 'WH/OUT/0500',
      state: 'done',
      create_date: '2026-05-28 23:15:00',
      driver_employee_id: [17, 'Ruta Centro'],
      lines: [{ product_id: 10, product_name: 'Bolsa 5kg', qty: 20 }],
    },
  ])

  assert.equal(item.time, '17:15')
})

test('normalizeVanLoadHistoryItems keeps loads and refills grouped by picking', () => {
  const items = normalizeVanLoadHistoryItems([
    {
      id: 500,
      name: 'WH/OUT/0500',
      state: 'assigned',
      create_date: '2026-05-30 08:15:00',
      gf_route_load_kind: 'initial',
      driver_employee_id: [17, 'Ruta Centro'],
      registered_by_id: [8, 'Almacen Uno'],
      lines: [
        { product_id: 10, product_name: 'Bolsa 5kg', qty: 20 },
        { product_id: 11, product_name: 'Bolsa 15kg', qty: 4 },
      ],
    },
    {
      id: 501,
      name: 'WH/OUT/0501',
      state: 'done',
      create_date: '2026-05-30 12:40:00',
      gf_route_load_kind: 'refill',
      driver_employee_id: 17,
      driver_employee_name: 'Ruta Centro',
      registered_by_id: false,
      lines: [
        { product_id: [10, 'Bolsa 5kg'], quantity: 6 },
      ],
    },
  ])

  assert.deepEqual(items, [
    {
      id: 500,
      name: 'WH/OUT/0500',
      state: 'assigned',
      stateLabel: 'Reservada',
      loadKind: 'initial',
      loadKindLabel: 'Carga',
      createDate: '2026-05-30 08:15:00',
      time: '02:15',
      driverEmployeeId: 17,
      driverEmployeeName: 'Ruta Centro',
      mobileLocationId: null,
      mobileLocationName: '',
      registeredById: 8,
      registeredByName: 'Almacen Uno',
      routePlanId: null,
      routePlanName: '',
      totalQty: 24,
      lines: [
        { productId: 10, productName: 'Bolsa 5kg', qty: 20 },
        { productId: 11, productName: 'Bolsa 15kg', qty: 4 },
      ],
    },
    {
      id: 501,
      name: 'WH/OUT/0501',
      state: 'done',
      stateLabel: 'Hecha',
      loadKind: 'refill',
      loadKindLabel: 'Recarga',
      createDate: '2026-05-30 12:40:00',
      time: '06:40',
      driverEmployeeId: 17,
      driverEmployeeName: 'Ruta Centro',
      mobileLocationId: null,
      mobileLocationName: '',
      registeredById: null,
      registeredByName: '',
      routePlanId: null,
      routePlanName: '',
      totalQty: 6,
      lines: [
        { productId: 10, productName: 'Bolsa 5kg', qty: 6 },
      ],
    },
  ])
})

test('groupVanLoadHistoryByVan aggregates totals per van and summary', () => {
  const items = normalizeVanLoadHistoryItems([
    { id: 1, driver_employee_id: [17, 'Ruta Centro'], lines: [{ product_id: 10, qty: 20 }] },
    { id: 2, driver_employee_id: [17, 'Ruta Centro'], gf_route_load_kind: 'refill', lines: [{ product_id: 10, qty: 6 }] },
    { id: 3, mobile_location_id: [44, 'VAN-44'], lines: [{ product_id: 11, qty: 3 }] },
  ])

  assert.deepEqual(groupVanLoadHistoryByVan(items).map((group) => ({
    key: group.key,
    label: group.label,
    totalLoads: group.totalLoads,
    totalQty: group.totalQty,
  })), [
    { key: 'driver:17', label: 'Ruta Centro', totalLoads: 2, totalQty: 26 },
    { key: 'location:44', label: 'VAN-44', totalLoads: 1, totalQty: 3 },
  ])

  assert.deepEqual(buildVanLoadHistorySummary(items), {
    totalLoads: 3,
    totalVans: 2,
    totalQty: 29,
  })
})
