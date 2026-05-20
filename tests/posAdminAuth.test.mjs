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
    company_id: 35,
    warehouse_id: 76,
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
            id: 76,
            company_id: [35, 'Fabricacion Iguala'],
            lot_stock_id: [1519, 'PIGU/PT'],
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

  const catalog = await api('GET', '/pwa-admin/pos-products?warehouse_id=76&company_id=35')

  assert.equal(calls.some((call) => call.url === '/odoo-api/pwa-admin/pos-products'), false)
  assert.deepEqual(
    calls.map((call) => call.payload?.params?.model).filter(Boolean),
    ['stock.warehouse', 'product.pricelist', 'product.product', 'stock.quant'],
  )
  assert.deepEqual(catalog, {
    ok: true,
    message: 'OK',
    data: {
      company_id: 35,
      warehouse_id: 76,
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

test('pos default customer loads from model reads without requiring the strict admin endpoint', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, options, payload })
    assert.equal(url, '/odoo-api/get_records_sorted')
    assert.equal(payload?.params?.model, 'res.partner')
    return createJsonResponse(200, {
      result: {
        response: [{
          id: 44,
          name: 'VENTA PUBLICO IGUALA',
          email: '',
          phone: '',
          mobile: '',
          vat: '',
          ref: 'PUBLICO',
          is_company: false,
          property_product_pricelist: [105, 'Mostrador Iguala'],
        }],
      },
    })
  }

  const customer = await api('GET', '/pwa-admin/default-customer?company_id=35')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/get_records_sorted')
  assert.deepEqual(customer, {
    ok: true,
    message: 'OK',
    data: {
      id: 44,
      name: 'VENTA PUBLICO IGUALA',
      email: '',
      phone: '',
      mobile: '',
      vat: '',
      ref: 'PUBLICO',
      is_company: false,
      pricelist_id: 105,
      pricelist_name: 'Mostrador Iguala',
    },
  })
})

test('pos customer search loads from model reads without requiring the strict admin endpoint', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, options, payload })
    assert.equal(url, '/odoo-api/get_records_sorted')
    assert.equal(payload?.params?.model, 'res.partner')
    return createJsonResponse(200, {
      result: {
        response: [{
          id: 45,
          name: 'Cliente Mostrador',
          email: 'cliente@example.com',
          phone: '7330000000',
          mobile: '',
          vat: 'XAXX010101000',
          ref: 'C45',
          is_company: false,
          property_product_pricelist: [106, 'Cliente especial'],
        }],
      },
    })
  }

  const customers = await api('GET', '/pwa-admin/customers?company_id=35&q=cliente')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/get_records_sorted')
  assert.deepEqual(customers, {
    ok: true,
    message: 'OK',
    data: [{
      id: 45,
      name: 'Cliente Mostrador',
      email: 'cliente@example.com',
      phone: '7330000000',
      mobile: '',
      vat: 'XAXX010101000',
      ref: 'C45',
      is_company: false,
      pricelist_id: 106,
      pricelist_name: 'Cliente especial',
    }],
  })
})
