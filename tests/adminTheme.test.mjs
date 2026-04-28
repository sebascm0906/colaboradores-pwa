import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ADMIN_THEME_SCOPE_STYLE,
  getAdminThemeScopeStyle,
} from '../src/modules/admin/adminTheme.js'

test('admin theme scope uses the light inversion filter', () => {
  assert.deepEqual(ADMIN_THEME_SCOPE_STYLE, {
    minHeight: '100dvh',
    background: '#05070a',
    filter: 'invert(1) hue-rotate(180deg)',
    isolation: 'isolate',
  })
})

test('getAdminThemeScopeStyle merges overrides last', () => {
  assert.deepEqual(
    getAdminThemeScopeStyle({ paddingBottom: '24px', background: '#111111' }),
    {
      minHeight: '100dvh',
      background: '#111111',
      filter: 'invert(1) hue-rotate(180deg)',
      isolation: 'isolate',
      paddingBottom: '24px',
    },
  )
})
