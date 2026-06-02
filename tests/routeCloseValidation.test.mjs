import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateCierre } from '../src/modules/ruta/routeCloseValidation.js'

const validCorte = () => ({ valid: true, errors: [], warnings: [] })

test('validateCierre allows closing when route kilometers are missing', () => {
  const result = validateCierre(
    { id: 293 },
    { kmSalida: null, kmLlegada: null },
    { corteDone: true, liquidacionDone: true },
    { source: 'reconciliation', lines: [] },
    validCorte,
  )

  assert.equal(result.valid, true)
  assert.equal(result.kmRecorridos, 0)
  assert.deepEqual(result.errors, [])
})

test('validateCierre rejects invalid kilometers only when both are captured', () => {
  const result = validateCierre(
    { id: 293 },
    { kmSalida: 45120, kmLlegada: 45000 },
    { corteDone: true, liquidacionDone: true },
    { source: 'reconciliation', lines: [] },
    validCorte,
  )

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, ['KM llegada debe ser mayor que KM salida'])
})
