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
    api_key: 'stale-api-key',
    gf_employee_token: 'employee-token-test',
    employee_id: 699,
    role: 'gerente_sucursal',
    company_id: 34,
    warehouse_id: 89,
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

test('pos catalog loads from model reads without requiring the strict admin endpoint', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, options, payload })

    if (url === '/odoo-api/get_records_sorted' && payload?.params?.model === 'stock.warehouse') {
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 89,
            company_id: [34, 'GLACIEM'],
            lot_stock_id: [1519, 'CIGU/Existencias'],
          }],
        },
      })
    }
    if (url === '/odoo-api/get_records_sorted' && payload?.params?.model === 'product.pricelist') {
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 105,
            name: 'Mostrador Iguala',
            display_name: 'Mostrador Iguala',
          }],
        },
      })
    }
    if (url === '/odoo-api/get_records_sorted' && payload?.params?.model === 'product.product') {
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 901,
            display_name: 'Bolsa hielo 5 kg',
            list_price: 85,
            barcode: '750000000001',
            weight: 5,
            sale_ok: true,
            available_in_pos: true,
          }],
        },
      })
    }
    if (url === '/odoo-api/get_records_sorted' && payload?.params?.model === 'stock.quant') {
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 701,
            product_id: [901, 'Bolsa hielo 5 kg'],
            quantity: 10,
            reserved_quantity: 2,
          }],
        },
      })
    }
    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  const catalog = await api('GET', '/pwa-admin/pos-products?warehouse_id=89&company_id=34')

  assert.equal(calls.some((call) => call.url === '/odoo-api/pwa-admin/pos-products'), false)
  assert.equal(calls.some((call) => call.payload?.params?.model === 'product.pricelist.item'), false)
  const productCall = calls.find((call) => call.payload?.params?.model === 'product.product')
  assert.deepEqual(productCall.payload.params.fields, ['id', 'display_name', 'name', 'list_price', 'lst_price', 'barcode', 'weight', 'sale_ok', 'available_in_pos'])
  assert.deepEqual(
    calls.map((call) => call.payload?.params?.model).filter(Boolean),
    ['stock.warehouse', 'product.pricelist', 'product.product', 'stock.quant'],
  )
  assert.deepEqual(catalog, {
    ok: true,
    message: 'OK',
    data: {
      company_id: 34,
      warehouse_id: 89,
      pricelist_id: 105,
      pricelist_name: 'Mostrador Iguala',
      products: [{
        id: 901,
        name: 'Bolsa hielo 5 kg',
        price: 85,
        price_unit: 85,
        stock: 8,
        barcode: '750000000001',
        weight: 5,
        sale_ok: true,
        available_in_pos: true,
      }],
    },
  })
})

test('pos catalog reads pricelists with domains accepted by get_records_sorted', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, payload })

    if (url !== '/odoo-api/get_records_sorted') {
      return createJsonResponse(500, { error: `Unexpected ${url}` })
    }

    const params = payload?.params || {}
    assert.equal(params.domain.includes('|'), false, `${params.model} used an OR domain`)

    if (params.model === 'stock.warehouse') {
      return createJsonResponse(200, {
        result: { response: [{ id: 89, company_id: [34, 'GLACIEM'], lot_stock_id: [1519, 'CIGU/Existencias'] }] },
      })
    }
    if (params.model === 'product.pricelist') {
      return createJsonResponse(200, {
        result: { response: [{ id: 105, name: 'Mostrador Iguala', display_name: 'Mostrador Iguala' }] },
      })
    }
    if (params.model === 'product.product') {
      return createJsonResponse(200, { result: { response: [] } })
    }
    return createJsonResponse(200, { result: { response: [] } })
  }

  await api('GET', '/pwa-admin/pos-products?warehouse_id=89&company_id=34')

  const pricelistCall = calls.find((call) => call.payload?.params?.model === 'product.pricelist')
  assert.deepEqual(pricelistCall.payload.params.domain, [['company_id', '=', 34]])
})

test('pos customer search splits text search into safe simple domains', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, payload })

    if (url !== '/odoo-api/get_records_sorted') {
      return createJsonResponse(500, { error: `Unexpected ${url}` })
    }

    const params = payload?.params || {}
    assert.equal(params.model, 'res.partner')
    assert.equal(params.domain.includes('|'), false, 'customer search used an OR domain')
    assert.equal(
      params.domain.some((term) => Array.isArray(term) && term[0] === 'display_name'),
      false,
      'customer search used display_name in the domain',
    )

    const hasNameSearch = params.domain.some((term) => (
      Array.isArray(term) && term[0] === 'name' && term[1] === 'ilike' && term[2] === 'pala'
    ))
    return createJsonResponse(200, {
      result: {
        response: hasNameSearch
          ? [{ id: 44, name: 'Palapa Centro', customer_rank: 1, property_product_pricelist: [105, 'Mostrador'] }]
          : [],
      },
    })
  }

  const result = await api('GET', '/pwa-admin/customers?q=pala&company_id=34')

  assert.equal(calls.length > 1, true)
  assert.deepEqual(result, {
    ok: true,
    message: 'OK',
    data: [{
      id: 44,
      name: 'Palapa Centro',
      email: '',
      phone: '',
      mobile: '',
      vat: '',
      ref: '',
      is_company: false,
      pricelist_id: 105,
      pricelist_name: 'Mostrador',
    }],
  })
})
