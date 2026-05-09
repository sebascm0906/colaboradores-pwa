import test from 'node:test'
import assert from 'node:assert/strict'

import { getModulesForRole } from '../src/modules/registry.js'

test('operador_koldcup sees KOLDCUP module', () => {
  const modules = getModulesForRole('operador_koldcup')

  assert.ok(modules.some((module) => module.id === 'koldcup' && module.route === '/koldcup'))
})
