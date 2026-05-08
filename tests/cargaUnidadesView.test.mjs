import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getCedisDispatchLabel,
  getVanDispatchSourceLabel,
  getVanUnitLabel,
} from '../src/modules/entregas/cargaUnidadesView.js'

test('carga unidades separates CEDIS dispatch source from mobile unit destination', () => {
  const van = {
    employee_name: 'Orlando Esteban Arévalo',
    mobile_location_id: 1488,
    mobile_location_name: 'U0301/Existencias',
    cedis_location_id: 1330,
    cedis_location_name: 'CGDL/Existencias',
  }

  assert.equal(getCedisDispatchLabel([van]), 'CGDL/Existencias')
  assert.equal(getVanDispatchSourceLabel(van), 'CGDL/Existencias')
  assert.equal(getVanUnitLabel(van), 'U0301/Existencias')
})
