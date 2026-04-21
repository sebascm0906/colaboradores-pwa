import test from 'node:test'
import assert from 'node:assert/strict'

import { getMiTurnoActions } from '../src/modules/produccion/miTurnoActions.js'

test('getMiTurnoActions removes transformacion and empaque for operador barra', () => {
  const actions = getMiTurnoActions({
    isBarras: true,
    readySlotsCount: 3,
  })

  assert.deepEqual(
    actions.map((action) => action.id),
    ['tanque', 'incidencia', 'checklist', 'corte', 'cierre'],
  )
})

test('getMiTurnoActions keeps empaque and ciclo for non-barra roles', () => {
  const actions = getMiTurnoActions({
    isBarras: false,
    readySlotsCount: 0,
  })

  assert.deepEqual(
    actions.map((action) => action.id),
    ['empaque', 'ciclo', 'incidencia', 'checklist', 'corte', 'cierre'],
  )
})
