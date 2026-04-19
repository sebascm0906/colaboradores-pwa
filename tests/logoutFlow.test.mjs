import test from 'node:test'
import assert from 'node:assert/strict'

import { runLogout } from '../src/lib/logout.js'

test('runLogout clears session and navigates after remote logout succeeds', async () => {
  const calls = []

  await runLogout({
    remoteLogout: async () => { calls.push('remote') },
    clearSession: () => { calls.push('clear') },
    navigateToLogin: () => { calls.push('navigate') },
  })

  assert.deepEqual(calls, ['remote', 'clear', 'navigate'])
})

test('runLogout still clears session and navigates when remote logout fails', async () => {
  const calls = []

  await runLogout({
    remoteLogout: async () => {
      calls.push('remote')
      throw new Error('network')
    },
    clearSession: () => { calls.push('clear') },
    navigateToLogin: () => { calls.push('navigate') },
  })

  assert.deepEqual(calls, ['remote', 'clear', 'navigate'])
})

test('runLogout works without remote logout callback', async () => {
  const calls = []

  await runLogout({
    clearSession: () => { calls.push('clear') },
    navigateToLogin: () => { calls.push('navigate') },
  })

  assert.deepEqual(calls, ['clear', 'navigate'])
})
