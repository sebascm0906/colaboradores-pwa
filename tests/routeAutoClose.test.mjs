import assert from 'node:assert/strict'
import { test } from 'node:test'

import { autoCloseRouteAfterLiquidacion } from '../src/modules/ruta/routeAutoClose.js'

test('autoCloseRouteAfterLiquidacion closes the route with persisted kilometers after liquidacion succeeds', async () => {
  const calls = []
  const result = await autoCloseRouteAfterLiquidacion({
    plan: { id: 501, state: 'in_progress', departure_km: 1200, arrival_km: 1248 },
    now: () => '2026-06-02T18:10:00.000Z',
    getKmData: (planId, plan) => {
      calls.push(['getKmData', planId, plan.id])
      return { kmSalida: plan.departure_km, kmLlegada: plan.arrival_km }
    },
    saveCierreState: (planId, state) => {
      calls.push(['saveCierreState', planId, state])
    },
    closeRouteWithValidation: async (planId, departureKm, arrivalKm) => {
      calls.push(['closeRouteWithValidation', planId, departureKm, arrivalKm])
      return {
        success: true,
        source: 'backend',
        state: 'closed',
        closure_time: '2026-06-02T18:11:00.000Z',
      }
    },
  })

  assert.equal(result.liquidacionSaved, true)
  assert.equal(result.closeAttempted, true)
  assert.equal(result.closeResult.success, true)
  assert.deepEqual(calls, [
    ['saveCierreState', 501, {
      liquidacionDone: true,
      liquidacionAt: '2026-06-02T18:10:00.000Z',
    }],
    ['getKmData', 501, 501],
    ['closeRouteWithValidation', 501, 1200, 1248],
    ['saveCierreState', 501, {
      closed: true,
      closedAt: '2026-06-02T18:11:00.000Z',
      autoClosedAfterLiquidacion: true,
    }],
  ])
})

test('autoCloseRouteAfterLiquidacion uses zero kilometers when none are captured', async () => {
  const closeCalls = []
  const result = await autoCloseRouteAfterLiquidacion({
    plan: { id: 502, state: 'in_progress' },
    now: () => '2026-06-02T18:20:00.000Z',
    getKmData: () => ({}),
    saveCierreState: () => {},
    closeRouteWithValidation: async (planId, departureKm, arrivalKm) => {
      closeCalls.push([planId, departureKm, arrivalKm])
      return { success: true, state: 'closed' }
    },
  })

  assert.equal(result.closeAttempted, true)
  assert.deepEqual(closeCalls, [[502, 0, 0]])
})

test('autoCloseRouteAfterLiquidacion ignores incomplete kilometer pairs', async () => {
  const closeCalls = []
  await autoCloseRouteAfterLiquidacion({
    plan: { id: 503, state: 'in_progress' },
    now: () => '2026-06-02T18:30:00.000Z',
    getKmData: () => ({ kmSalida: 1300 }),
    saveCierreState: () => {},
    closeRouteWithValidation: async (planId, departureKm, arrivalKm) => {
      closeCalls.push([planId, departureKm, arrivalKm])
      return { success: true, state: 'closed' }
    },
  })

  assert.deepEqual(closeCalls, [[503, 0, 0]])
})
