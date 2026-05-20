import test from 'node:test'
import assert from 'node:assert/strict'

import { handleExpiredSession } from '../src/lib/sessionExpiration.js'

test('handleExpiredSession clears local state, nulls session, and redirects to login', () => {
  const calls = []
  const location = {
    replace(path) {
      calls.push(['replace', path])
    },
  }

  handleExpiredSession({
    clearLocalState() {
      calls.push(['clear'])
    },
    setSession(value) {
      calls.push(['setSession', value])
    },
    location,
  })

  assert.deepEqual(calls, [
    ['clear'],
    ['setSession', null],
    ['replace', '/login'],
  ])
})
