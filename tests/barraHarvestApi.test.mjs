import test from 'node:test'
import assert from 'node:assert/strict'

import { api } from '../src/lib/api.js'

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

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload)
    },
    async json() {
      return payload
    },
  }
}

function setSession(session = {}) {
  globalThis.localStorage.setItem('gf_session', JSON.stringify({
    session_token: 'token-test',
    employee_id: 730,
    company_id: 35,
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

test('harvest with mermada bars delegates scrap to bar endpoint and sends only good bars to PT', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, options, payload })

    if (url === '/odoo-api/api/create_update') {
      const params = payload.params || {}
      if (params.model === 'x_ice.brine.slot' && params.method === 'function') {
        return createJsonResponse(200, {
          result: {
            success: true,
            product_id: 900,
            product_name: 'MP Barra Grande',
          },
        })
      }
      if (params.model === 'x_ice.brine.slot' && params.method === 'update') {
        return createJsonResponse(200, { result: { success: true } })
      }
      if (params.model === 'gf.production.scrap' && params.method === 'create') {
        return createJsonResponse(200, { result: { error: 'gf.production.scrap should not be called directly' } })
      }
      if (params.model === 'stock.move') {
        return createJsonResponse(200, { result: { error: 'Modelo no autorizado.' } })
      }
    }

    if (url === '/odoo-api/api/production/bar-harvest-scrap') {
      return createJsonResponse(200, {
        ok: true,
        message: 'Merma de barra registrada',
        data: {
          scrap_id: 77,
          move_id: 501,
          move_state: 'done',
          reason_id: 2,
          qty_bars: 2,
          location_id: 1519,
          location_dest_id: 1173,
        },
      })
    }

    if (url === '/odoo-api/api/production/pack') {
      return createJsonResponse(200, { ok: true, data: { packing_entry_id: 91 } })
    }

    if (url === '/odoo-api/api/pt_reception/confirm') {
      return createJsonResponse(200, {
        ok: true,
        data: {
          processed_count: 1,
          entries: [{ packing_entry_id: 91, posted: true, pt_received: true }],
          posting_id: 601,
        },
      })
    }

    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  const result = await api('POST', '/pwa-prod/harvest-with-pt-reception', {
    slot_id: 33,
    shift_id: 55,
    temperature: -10.5,
    slot: { id: 33, name: 'A1', product_id: 900, product_name: 'MP Barra Grande' },
    tank: { id: 9, display_name: 'Tanque 3 Iguala', line_id: 1, bars_per_basket: 8, kg_per_bar: 50 },
    line_type: 'barra',
    product_id: 900,
    source_product_id: 900,
    qty_reported: 6,
    scrap_bars: 2,
  })

  const scrapCall = calls.find((call) => call.url === '/odoo-api/api/production/bar-harvest-scrap')
  assert.ok(scrapCall)
  assert.equal(scrapCall.payload.shift_id, 55)
  assert.equal(scrapCall.payload.reason_id, undefined)
  assert.equal(scrapCall.payload.line_id, 1)
  assert.equal(scrapCall.payload.machine_id, 9)
  assert.equal(scrapCall.payload.operator_id, 730)
  assert.equal(scrapCall.payload.product_id, 900)
  assert.equal(scrapCall.payload.qty_bars, 2)
  assert.equal(scrapCall.payload.kg, 100)
  assert.equal(scrapCall.payload.location_id, 1519)
  assert.equal(scrapCall.payload.location_dest_id, 1173)
  assert.match(scrapCall.payload.notes, /2 barras mermadas/)
  assert.match(scrapCall.payload.notes, /6 barras buenas/)

  const directScrapCalls = calls.filter((call) => call.payload?.params?.model === 'gf.production.scrap')
  assert.equal(directScrapCalls.length, 0)
  const directMoveCalls = calls.filter((call) => call.payload?.params?.model === 'stock.move')
  assert.equal(directMoveCalls.length, 0)

  const packCall = calls.find((call) => call.url === '/odoo-api/api/production/pack')
  assert.ok(packCall)
  const packPayload = JSON.parse(packCall.options.body)
  assert.equal(packPayload.qty_bags, 6)
  assert.equal(packPayload.slot_id, 33)
  assert.equal(packPayload.machine_id, 9)

  const receptionCall = calls.find((call) => call.url === '/odoo-api/api/pt_reception/confirm')
  assert.ok(receptionCall)
  assert.deepEqual(receptionCall.payload.packing_entry_ids, [91])
  assert.deepEqual(receptionCall.payload.received_lines, [{
    packing_entry_id: 91,
    received_qty: 6,
    notes: 'Cosecha barra A1 · Tanque 3 Iguala · 2 mermadas',
  }])

  assert.equal(result.ok, true)
  assert.equal(result.scrap.ok, true)
  assert.equal(result.scrap.data.scrap_id, 77)
  assert.equal(result.scrap_inventory_move.ok, true)
  assert.equal(result.scrap_inventory_move.data.move_id, 501)
  assert.equal(result.pt_reception.ok, true)
  assert.equal(result.pt_reception.data.reception.posting_id, 601)
})

test('harvest with pt reception reenters legacy harvested slots into freezing', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, options, payload })

    if (url === '/odoo-api/api/create_update') {
      const params = payload.params || {}
      if (params.model === 'x_ice.brine.slot' && params.method === 'function') {
        return createJsonResponse(200, {
          result: {
            success: true,
            product_id: 900,
            product_name: 'MP Barra Grande',
          },
        })
      }
      if (params.model === 'x_ice.brine.slot' && params.method === 'update') {
        return createJsonResponse(200, { result: { success: true } })
      }
    }

    if (url === '/odoo-api/get_records') {
      const params = payload.params || {}
      assert.equal(params.model, 'x_ice.brine.slot')
      assert.deepEqual(params.domain, [['id', '=', 33]])
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 33,
            x_state: 'harvested',
          }],
        },
      })
    }

    if (url === '/odoo-api/api/production/pack') {
      return createJsonResponse(200, { ok: true, data: { packing_entry_id: 91 } })
    }

    if (url === '/odoo-api/api/pt_reception/confirm') {
      return createJsonResponse(200, {
        ok: true,
        data: {
          processed_count: 1,
          entries: [{ packing_entry_id: 91, posted: true, pt_received: true }],
          posting_id: 601,
        },
      })
    }

    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  const result = await api('POST', '/pwa-prod/harvest-with-pt-reception', {
    slot_id: 33,
    shift_id: 55,
    temperature: -10.5,
    slot: { id: 33, name: 'A1', product_id: 900, product_name: 'MP Barra Grande' },
    tank: { id: 9, display_name: 'Tanque 3 Iguala', line_id: 1, bars_per_basket: 8, kg_per_bar: 50 },
    line_type: 'barra',
    product_id: 900,
    source_product_id: 900,
    qty_reported: 8,
  })

  const updateCalls = calls.filter((call) => {
    const params = call.payload?.params || {}
    return params.model === 'x_ice.brine.slot' && params.method === 'update'
  })
  const reentryCall = updateCalls.find((call) => call.payload.params.dict?.x_state === 'freezing')
  assert.ok(reentryCall)
  assert.equal(reentryCall.payload.params.ids[0], 33)
  assert.equal(reentryCall.payload.params.dict.x_ready_since, false)
  assert.match(reentryCall.payload.params.dict.x_freeze_start, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  assert.equal(result.ok, true)
})
