import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isFieldNotAllowedError,
  readWithOptionalFieldFallback,
} from '../src/modules/admin/requisitionReadFallback.js'

test('isFieldNotAllowedError detects nested field_not_allowed responses', () => {
  assert.equal(
    isFieldNotAllowedError({
      result: {
        ok: false,
        error: 'Campos no autorizados.',
        status: 403,
        data: { code: 'field_not_allowed' },
      },
    }),
    true,
  )
})

test('readWithOptionalFieldFallback strips optional groups until Odoo accepts the query', async () => {
  const calls = []
  const reader = async (_model, options) => {
    calls.push(options.fields)
    if (options.fields.includes('analytic_distribution')) {
      return {
        ok: false,
        error: 'Campos no autorizados.',
        status: 403,
        data: { code: 'field_not_allowed' },
      }
    }
    if (options.fields.includes('notes')) {
      return {
        ok: false,
        error: 'Campos no autorizados.',
        status: 403,
        data: { code: 'field_not_allowed' },
      }
    }
    return [{ id: 63, name: 'PO00063' }]
  }

  const response = await readWithOptionalFieldFallback(reader, 'purchase.order', {
    requiredFields: ['id', 'name'],
    optionalFieldGroups: [
      ['notes'],
      ['analytic_distribution'],
    ],
    domain: [['id', '=', 63]],
  })

  assert.deepEqual(calls, [
    ['id', 'name', 'notes', 'analytic_distribution'],
    ['id', 'name', 'notes'],
    ['id', 'name'],
  ])
  assert.deepEqual(response.fields, ['id', 'name'])
  assert.deepEqual(response.result, [{ id: 63, name: 'PO00063' }])
})

test('readWithOptionalFieldFallback preserves successful responses without retries', async () => {
  let callCount = 0
  const response = await readWithOptionalFieldFallback(async (_model, options) => {
    callCount += 1
    return { response: [{ id: 1, fields: options.fields }] }
  }, 'purchase.order', {
    requiredFields: ['id'],
    optionalFieldGroups: [['notes']],
  })

  assert.equal(callCount, 1)
  assert.deepEqual(response.fields, ['id', 'notes'])
})
