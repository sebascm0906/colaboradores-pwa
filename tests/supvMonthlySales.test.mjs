import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCedisMonthlySalesDomain,
  resolveMonthlySalesTarget,
  sumSaleOrderTotals,
} from '../src/modules/supervisor-ventas/monthSales.js'
import { getDayOverview } from '../src/modules/supervisor-ventas/supvService.js'

const originalLocalStorage = globalThis.localStorage
const originalFetch = globalThis.fetch
const originalWindow = globalThis.window

function createLocalStorageMock() {
  let store = {}
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key, value) {
      store[key] = String(value)
    },
    removeItem(key) {
      delete store[key]
    },
    clear() {
      store = {}
    },
  }
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(payload)
    },
  }
}

function setSession(session = {}) {
  globalThis.localStorage.setItem('gf_session', JSON.stringify({
    session_token: 'token-test',
    gf_employee_token: 'employee-token-test',
    employee_id: 699,
    role: 'supervisor_ventas',
    company_id: 34,
    warehouse_id: 89,
    x_analytic_account_id: [820, 'CEDIS Iguala'],
    ...session,
  }))
}

test.beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock()
  globalThis.window = { dispatchEvent() {} }
})

test.afterEach(() => {
  globalThis.localStorage = originalLocalStorage
  globalThis.fetch = originalFetch
  globalThis.window = originalWindow
})

test('buildCedisMonthlySalesDomain filters sale orders by month and CEDIS warehouse', () => {
  assert.deepEqual(
    buildCedisMonthlySalesDomain({
      startMonth: '2026-06-01',
      endMonth: '2026-07-01',
      warehouseId: 89,
      companyId: 34,
    }),
    [
      ['state', 'in', ['sale', 'done']],
      ['date_order', '>=', '2026-06-01 00:00:00'],
      ['date_order', '<', '2026-07-01 00:00:00'],
      ['warehouse_id', '=', 89],
      ['company_id', '=', 34],
    ],
  )
})

test('sumSaleOrderTotals adds all valid monthly sale totals', () => {
  assert.equal(sumSaleOrderTotals([
    { amount_total: 120.5 },
    { amount_total: '379.50' },
    { amount_total: null },
  ]), 500)
})

test('resolveMonthlySalesTarget uses 1,800,000 as June target when Odoo has no target', () => {
  assert.equal(resolveMonthlySalesTarget([], '2026-06-07'), 1800000)
  assert.equal(resolveMonthlySalesTarget([{ sales_target: 0 }], '2026-06-07'), 1800000)
})

test('getDayOverview uses monthly CEDIS sales total instead of stale target actuals', async () => {
  setSession()

  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    const model = payload?.params?.model

    if (url === '/odoo-api/get_records_sorted' && model === 'hr.employee') {
      return jsonResponse({
        result: {
          response: [
            { id: 10, name: 'Ruta 10', x_analytic_account_id: [820, 'CEDIS Iguala'] },
            { id: 11, name: 'Ruta 11', x_analytic_account_id: [820, 'CEDIS Iguala'] },
          ],
        },
      })
    }

    if (url === '/odoo-api/get_records_sorted' && model === 'gf.route.plan') {
      return jsonResponse({ result: { response: [] } })
    }

    if (url === '/odoo-api/get_records_sorted' && model === 'hr.employee.monthly.target') {
      return jsonResponse({
        result: {
          response: [
            { id: 1, employee_id: [10, 'Ruta 10'], sales_target: 1000, actual_sales: 10 },
            { id: 2, employee_id: [11, 'Ruta 11'], sales_target: 2000, actual_sales: 20 },
          ],
        },
      })
    }

    if (url === '/odoo-api/get_records_sorted' && model === 'sale.order') {
      return jsonResponse({
        result: {
          response: [
            { id: 100, amount_total: 1500 },
            { id: 101, amount_total: 2500 },
          ],
        },
      })
    }

    throw new Error(`Unexpected request ${url}`)
  }

  const overview = await getDayOverview('2026-06-07')

  assert.equal(overview.total_sales_target, 3000)
  assert.equal(overview.total_sales_actual, 4000)
})
