import test from 'node:test'
import assert from 'node:assert/strict'

import { fmtTime } from '../src/modules/supervisor-ventas/supvService.js'

test('fmtTime handles non-string values without throwing', () => {
  assert.equal(fmtTime(9.5), '9.5')
  assert.equal(fmtTime(false), '--')
})
