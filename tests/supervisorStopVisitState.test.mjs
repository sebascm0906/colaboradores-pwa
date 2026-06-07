import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deriveStopVisitState,
  isStopVisited,
  isStopUnvisited,
  isStopWithSale,
} from '../src/modules/supervisor-ventas/stopVisitState.js'

test('deriveStopVisitState treats check-in without sales as visited', () => {
  const state = deriveStopVisitState({
    result_status: '',
    has_checkin: true,
    sales_count: 0,
  })

  assert.equal(state.key, 'visited')
  assert.equal(isStopVisited({ result_status: '', has_checkin: true, sales_count: 0 }), true)
  assert.equal(isStopUnvisited({ result_status: '', has_checkin: true, sales_count: 0 }), false)
  assert.equal(isStopWithSale({ result_status: '', has_checkin: true, sales_count: 0 }), false)
})

test('deriveStopVisitState treats check-in with sales as visited with sale', () => {
  const stop = { result_status: 'pending', has_checkin: true, sales_count: 2 }
  const state = deriveStopVisitState(stop)

  assert.equal(state.key, 'sale')
  assert.equal(isStopVisited(stop), true)
  assert.equal(isStopWithSale(stop), true)
})

test('deriveStopVisitState keeps explicit not visited states as unvisited', () => {
  const stop = { result_status: 'not_visited', has_checkin: false, sales_count: 0 }
  const state = deriveStopVisitState(stop)

  assert.equal(state.key, 'unvisited')
  assert.equal(isStopVisited(stop), false)
  assert.equal(isStopUnvisited(stop), true)
})

test('deriveStopVisitState treats untouched pending stops as unvisited', () => {
  const stop = { result_status: 'pending', has_checkin: false, sales_count: 0 }
  const state = deriveStopVisitState(stop)

  assert.equal(state.key, 'unvisited')
  assert.equal(isStopVisited(stop), false)
  assert.equal(isStopUnvisited(stop), true)
})
