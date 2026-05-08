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

test('harvest with mermada bars creates production scrap and sends only good bars to PT', async () => {
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
        return createJsonResponse(200, { result: { success: true, id: 77 } })
      }
      if (params.model === 'stock.move' && params.method === 'create') {
        return createJsonResponse(200, { result: { success: true, id: 501 } })
      }
      if (params.model === 'stock.move' && params.method === 'function') {
        return createJsonResponse(200, { result: { success: true, done: true } })
      }
    }

    if (url === '/odoo-api/api/production/pack') {
      return createJsonResponse(200, { ok: true, data: { id: 91 } })
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
    scrap_reason_id: 2,
  })

  const scrapCall = calls.find((call) => call.payload?.params?.model === 'gf.production.scrap')
  assert.ok(scrapCall)
  assert.equal(scrapCall.payload.params.dict.shift_id, 55)
  assert.equal(scrapCall.payload.params.dict.reason_id, 2)
  assert.equal(scrapCall.payload.params.dict.line_id, 1)
  assert.equal(scrapCall.payload.params.dict.machine_id, 9)
  assert.equal(scrapCall.payload.params.dict.operator_id, 730)
  assert.equal(scrapCall.payload.params.dict.kg, 100)
  assert.equal(scrapCall.payload.params.dict.scrap_phase, 'production')
  assert.match(scrapCall.payload.params.dict.notes, /2 barras mermadas/)
  assert.match(scrapCall.payload.params.dict.notes, /6 barras buenas/)

  const scrapMoveCreate = calls.find((call) =>
    call.payload?.params?.model === 'stock.move'
    && call.payload?.params?.method === 'create'
  )
  assert.ok(scrapMoveCreate)
  assert.equal(scrapMoveCreate.payload.params.dict.product_id, 900)
  assert.equal(scrapMoveCreate.payload.params.dict.product_uom_qty, 2)
  assert.equal(scrapMoveCreate.payload.params.dict.quantity, 2)
  assert.equal(scrapMoveCreate.payload.params.dict.location_id, 1519)
  assert.equal(scrapMoveCreate.payload.params.dict.location_dest_id, 1173)
  assert.equal(scrapMoveCreate.payload.params.dict.company_id, 35)
  assert.match(scrapMoveCreate.payload.params.dict.origin, /MERMA BARRA A1/)

  const scrapMoveDone = calls.find((call) =>
    call.payload?.params?.model === 'stock.move'
    && call.payload?.params?.method === 'function'
  )
  assert.ok(scrapMoveDone)
  assert.deepEqual(scrapMoveDone.payload.params.ids, [501])
  assert.equal(scrapMoveDone.payload.params.function, '_action_done')

  const packCall = calls.find((call) => call.url === '/odoo-api/api/production/pack')
  assert.ok(packCall)
  const packPayload = JSON.parse(packCall.options.body)
  assert.equal(packPayload.qty_bags, 6)
  assert.equal(packPayload.slot_id, 33)
  assert.equal(packPayload.machine_id, 9)

  assert.equal(result.ok, true)
  assert.equal(result.scrap.ok, true)
  assert.equal(result.scrap_inventory_move.ok, true)
  assert.equal(result.pt_reception.ok, true)
})
