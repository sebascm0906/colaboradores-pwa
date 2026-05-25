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
    if (url === '/odoo-api/get_records_sorted' && payload?.params?.model === 'product.pricelist.item') {
      return createJsonResponse(200, { result: { response: [] } })
    }
    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  const catalog = await api('GET', '/pwa-admin/pos-products?warehouse_id=89&company_id=34')

  assert.equal(calls.some((call) => call.url === '/odoo-api/pwa-admin/pos-products'), false)
  const productCall = calls.find((call) => call.payload?.params?.model === 'product.product')
  assert.deepEqual(productCall.payload.params.fields, [
    'id',
    'display_name',
    'name',
    'list_price',
    'lst_price',
    'barcode',
    'weight',
    'sale_ok',
    'available_in_pos',
    'categ_id',
    'product_tmpl_id',
  ])
  assert.deepEqual(
    calls.map((call) => call.payload?.params?.model).filter(Boolean),
    ['stock.warehouse', 'product.pricelist', 'product.product', 'stock.quant', 'product.pricelist.item'],
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

test('pos catalog applies fixed prices from the selected customer pricelist', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, payload })

    if (url !== '/odoo-api/get_records_sorted') {
      return createJsonResponse(500, { error: `Unexpected ${url}` })
    }

    const params = payload?.params || {}
    if (params.model === 'stock.warehouse') {
      return createJsonResponse(200, {
        result: { response: [{ id: 89, company_id: [34, 'GLACIEM'], lot_stock_id: [1519, 'CIGU/Existencias'] }] },
      })
    }
    if (params.model === 'res.partner') {
      return createJsonResponse(200, {
        result: { response: [{ id: 61100, property_product_pricelist: [81, 'Especial cliente'] }] },
      })
    }
    if (params.model === 'product.pricelist') {
      return createJsonResponse(200, {
        result: { response: [{ id: 81, name: 'Especial cliente', display_name: 'Especial cliente' }] },
      })
    }
    if (params.model === 'product.product') {
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 901,
            display_name: 'Bolsa hielo 5 kg',
            product_tmpl_id: [501, 'Bolsa hielo 5 kg'],
            categ_id: [77, 'Bolsa'],
            list_price: 85,
            barcode: '750000000001',
            weight: 5,
            sale_ok: true,
            available_in_pos: true,
          }],
        },
      })
    }
    if (params.model === 'stock.quant') {
      return createJsonResponse(200, { result: { response: [] } })
    }
    if (params.model === 'product.pricelist.item') {
      assert.deepEqual(params.domain, [['pricelist_id', '=', 81]])
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 7001,
            pricelist_id: [81, 'Especial cliente'],
            applied_on: '1_product',
            product_tmpl_id: [501, 'Bolsa hielo 5 kg'],
            min_quantity: 1,
            compute_price: 'fixed',
            fixed_price: 70,
          }],
        },
      })
    }
    return createJsonResponse(500, { error: `Unexpected model ${params.model}` })
  }

  const catalog = await api('GET', '/pwa-admin/pos-products?warehouse_id=89&company_id=34&partner_id=61100')

  assert.equal(calls.some((call) => call.payload?.params?.model === 'product.pricelist.item'), true)
  assert.equal(catalog.data.pricelist_id, 81)
  assert.equal(catalog.data.pricelist_name, 'Especial cliente')
  assert.equal(catalog.data.products[0].price, 70)
  assert.equal(catalog.data.products[0].price_unit, 70)
})

test('pos catalog prefers customer pricelist_id over property_product_pricelist', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, payload })

    if (url !== '/odoo-api/get_records_sorted') {
      return createJsonResponse(500, { error: `Unexpected ${url}` })
    }

    const params = payload?.params || {}
    if (params.model === 'stock.warehouse') {
      return createJsonResponse(200, {
        result: { response: [{ id: 89, company_id: [34, 'GLACIEM'], lot_stock_id: [1519, 'CIGU/Existencias'] }] },
      })
    }
    if (params.model === 'res.partner') {
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 51183,
            property_product_pricelist: [1, 'Predeterminado (MXN)'],
            pricelist_id: [92, 'IGUALA LEYVAS (MXN)'],
          }],
        },
      })
    }
    if (params.model === 'product.pricelist') {
      return createJsonResponse(200, {
        result: { response: [{ id: 92, name: 'IGUALA LEYVAS (MXN)', display_name: 'IGUALA LEYVAS (MXN)' }] },
      })
    }
    if (params.model === 'product.product') {
      return createJsonResponse(200, { result: { response: [] } })
    }
    if (params.model === 'stock.quant') {
      return createJsonResponse(200, { result: { response: [] } })
    }
    if (params.model === 'product.pricelist.item') {
      assert.deepEqual(params.domain, [['pricelist_id', '=', 92]])
      return createJsonResponse(200, { result: { response: [] } })
    }
    return createJsonResponse(500, { error: `Unexpected model ${params.model}` })
  }

  const catalog = await api('GET', '/pwa-admin/pos-products?warehouse_id=89&company_id=34&partner_id=51183')

  assert.equal(catalog.data.pricelist_id, 92)
  assert.equal(catalog.data.pricelist_name, 'IGUALA LEYVAS (MXN)')
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
    if (params.model === 'account.analytic.account') {
      return createJsonResponse(200, {
        result: { response: [{ id: 201, name: '[IGU] Iguala', code: 'IGU' }] },
      })
    }

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

test('pos customer search filters customers to the Iguala analytic unit', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, payload })

    if (url !== '/odoo-api/get_records_sorted') {
      return createJsonResponse(500, { error: `Unexpected ${url}` })
    }

    const params = payload?.params || {}
    if (params.model === 'account.analytic.account') {
      return createJsonResponse(200, {
        result: { response: [{ id: 201, name: '[IGU] Iguala', code: 'IGU' }] },
      })
    }

    assert.equal(params.model, 'res.partner')
    assert.equal(
      params.domain.some((term) => (
        Array.isArray(term) && term[0] === 'x_analytic_un_id' && term[1] === '=' && term[2] === 201
      )),
      true,
      'customer search did not include the Iguala analytic unit filter',
    )

    const hasNameSearch = params.domain.some((term) => (
      Array.isArray(term) && term[0] === 'name' && term[1] === 'ilike' && term[2] === 'wing'
    ))
    return createJsonResponse(200, {
      result: {
        response: hasNameSearch
          ? [{ id: 44, name: 'Wing Cliente', x_analytic_un_id: [201, '[IGU] Iguala'] }]
          : [],
      },
    })
  }

  const result = await api('GET', '/pwa-admin/customers?q=wing&company_id=34')

  assert.equal(
    calls.some((call) => call.payload?.params?.model === 'account.analytic.account'),
    true,
  )
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].id, 44)
})

test('pos customer search includes new contacts without customer_rank', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, payload })

    if (url !== '/odoo-api/get_records_sorted') {
      return createJsonResponse(500, { error: `Unexpected ${url}` })
    }

    const params = payload?.params || {}
    if (params.model === 'account.analytic.account') {
      return createJsonResponse(200, {
        result: { response: [{ id: 201, name: '[IGU] Iguala', code: 'IGU' }] },
      })
    }

    assert.equal(params.model, 'res.partner')
    assert.equal(
      params.domain.some((term) => Array.isArray(term) && term[0] === 'customer_rank'),
      false,
      'customer search should not require customer_rank',
    )

    const hasNameSearch = params.domain.some((term) => (
      Array.isArray(term) && term[0] === 'name' && term[1] === 'ilike' && term[2] === 'nuevo'
    ))
    return createJsonResponse(200, {
      result: {
        response: hasNameSearch
          ? [{ id: 61100, name: 'Contacto Nuevo', customer_rank: 0, x_analytic_un_id: [201, '[IGU] Iguala'] }]
          : [],
      },
    })
  }

  const result = await api('GET', '/pwa-admin/customers?q=nuevo&company_id=34')

  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].id, 61100)
})

test('pos customer search includes phone, mobile, email, vat and ref fields', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, payload })

    if (url !== '/odoo-api/get_records_sorted') {
      return createJsonResponse(500, { error: `Unexpected ${url}` })
    }

    const params = payload?.params || {}
    if (params.model === 'account.analytic.account') {
      return createJsonResponse(200, {
        result: { response: [{ id: 201, name: '[IGU] Iguala', code: 'IGU' }] },
      })
    }

    return createJsonResponse(200, { result: { response: [] } })
  }

  await api('GET', '/pwa-admin/customers?q=6110&company_id=34')

  const searchedFields = new Set()
  for (const call of calls) {
    const domain = call.payload?.params?.domain || []
    for (const term of domain) {
      if (Array.isArray(term) && term[1] === 'ilike' && term[2] === '6110') {
        searchedFields.add(term[0])
      }
    }
  }

  assert.deepEqual(
    [...searchedFields].sort(),
    ['email', 'mobile', 'name', 'phone', 'ref', 'vat'],
  )
})

test('pos customer search can find a customer by exact Odoo id', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, payload })

    if (url !== '/odoo-api/get_records_sorted') {
      return createJsonResponse(500, { error: `Unexpected ${url}` })
    }

    const params = payload?.params || {}
    if (params.model === 'account.analytic.account') {
      return createJsonResponse(200, {
        result: { response: [{ id: 201, name: '[IGU] Iguala', code: 'IGU' }] },
      })
    }

    assert.equal(params.model, 'res.partner')
    assert.equal(params.domain.includes('|'), false, 'customer id search used an OR domain')

    const isExactIdSearch = params.domain.some((term) => (
      Array.isArray(term) && term[0] === 'id' && term[1] === '=' && term[2] === 61100
    ))
    return createJsonResponse(200, {
      result: {
        response: isExactIdSearch
          ? [{ id: 61100, name: 'Cliente ID 61100', property_product_pricelist: [81, 'Lista cliente'] }]
          : [],
      },
    })
  }

  const result = await api('GET', '/pwa-admin/customers?q=ID:%2061100&company_id=34')

  assert.equal(
    calls.some((call) => call.payload?.params?.domain?.some((term) => (
      Array.isArray(term) && term[0] === 'id' && term[1] === '=' && term[2] === 61100
    ))),
    true,
  )
  assert.deepEqual(result, {
    ok: true,
    message: 'OK',
    data: [{
      id: 61100,
      name: 'Cliente ID 61100',
      email: '',
      phone: '',
      mobile: '',
      vat: '',
      ref: '',
      is_company: false,
      pricelist_id: 81,
      pricelist_name: 'Lista cliente',
    }],
  })
})

test('today sales delegates employee scope to the Odoo backend endpoint', async () => {
  setSession({
    employee_id: 700,
    name: 'Angélica Jaimes',
    role: 'gerente_sucursal',
    company_id: 34,
    warehouse_id: 89,
  })

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, options, payload })

    if (url === '/odoo-api/pwa-admin/today-sales?warehouse_id=89&company_id=34') {
      return createJsonResponse(200, {
        ok: true,
        message: 'OK',
        data: {
          count: 1,
          items: [{
            id: 9001,
            name: 'S0001',
            customer: 'Cliente Iguala',
            total: 120,
            state: 'sale',
            date_order: '2026-05-22 09:30:00',
            warehouse_id: 89,
          }],
        },
      })
    }

    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  const result = await api('GET', '/pwa-admin/today-sales?warehouse_id=89&company_id=34')

  const call = calls.find((entry) => entry.url.startsWith('/odoo-api/pwa-admin/today-sales'))
  assert.ok(call, 'today sales did not call the Odoo backend endpoint')
  assert.equal(call.options.headers['Api-Key'], 'stale-api-key')
  assert.equal(call.options.headers['X-GF-Employee-Token'], 'employee-token-test')
  assert.equal(
    calls.some((entry) => entry.payload?.params?.model === 'sale.order'),
    false,
    'today sales should not read sale.order through the generic endpoint',
  )
  assert.equal(result.data.items.length, 1)
  assert.equal(result.data.items[0].id, 9001)
})
