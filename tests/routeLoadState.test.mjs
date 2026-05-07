import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLoadState } from '../src/modules/ruta/loadState.js'

test('buildLoadState keeps the initial load visible when a refill replaces load_picking_id', () => {
  const plan = { id: 95, load_picking_id: [11185, 'CIGU/INT/00035'] }
  const load = {
    id: 95,
    name: 'RPLAN/2026/00080',
    load_picking_id: 11185,
    load_sealed: true,
    load_pickings: [
      {
        picking_id: 11168,
        name: 'CIGU/OUT/02229',
        state: 'done',
        origin: 'RPLAN/2026/00080/LOAD',
        gf_route_load_kind: 'initial',
        gf_route_load_accepted: false,
      },
      {
        picking_id: 11185,
        name: 'CIGU/INT/00035',
        state: 'confirmed',
        origin: 'CARGA-MANUAL/2026-05-07',
        gf_route_load_kind: 'initial',
        gf_route_load_accepted: false,
      },
    ],
  }

  const { loadCards, pendingLoads } = buildLoadState(plan, load)

  assert.deepEqual(loadCards.map((card) => ({
    id: card.picking_id,
    kind: card.load_kind,
    isRefill: card.isRefill,
    accepted: card.accepted,
  })), [
    { id: 11168, kind: 'initial', isRefill: false, accepted: false },
    { id: 11185, kind: 'refill', isRefill: true, accepted: false },
  ])
  assert.deepEqual(pendingLoads.map((card) => card.picking_id), [11185])
})
