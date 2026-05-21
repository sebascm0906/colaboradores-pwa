import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getShiftStartReadiness,
  hasStartEnergyReading,
} from '../src/modules/supervision/shiftStartReadiness.js'

test('hasStartEnergyReading returns true only when start reading has positive kwh', () => {
  assert.equal(hasStartEnergyReading([]), false)
  assert.equal(hasStartEnergyReading([{ reading_type: 'end', kwh_value: 100 }]), false)
  assert.equal(hasStartEnergyReading([{ reading_type: 'start', kwh_value: 0 }]), false)
  assert.equal(hasStartEnergyReading([{ reading_type: 'start', kwh_value: 120 }]), true)
})

test('getShiftStartReadiness blocks start when energy reading is missing', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [],
    tanks: [{ id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 }],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.energyReady, false)
  assert.equal(readiness.blockers.includes('Falta lectura inicial de energia'), true)
})

test('getShiftStartReadiness blocks start when any active tank lacks a valid reading', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [
      { id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 },
      { id: 2, salt_level: 0, salt_level_updated_at: null, min_salt_level_for_harvest: 65 },
    ],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.tankReadiness[1].ready, false)
})

test('getShiftStartReadiness allows start when draft shift has energy and all tanks ready', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [
      { id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 },
      { id: 2, salt_level: 68, salt_level_updated_at: '2026-04-20 06:30:00', min_salt_level_for_harvest: 65 },
    ],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, true)
  assert.equal(readiness.blockers.length, 0)
})

test('getShiftStartReadiness does not allow start when shift is already in progress', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'in_progress' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [{ id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 }],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
})

test('getShiftStartReadiness treats an empty active tank list as blocked', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.blockers.includes('No hay tanques activos disponibles para validar salmuera'), true)
})

// ── Vigencia por turno (fix bug medianoche Turno 2) ───────────────────────────

test('getShiftStartReadiness validates brine reading against shift.date (not calendar today)', () => {
  // Escenario: Turno 2 nocturno con shift.date=2026-05-18, lectura supervisor
  // a las 14:00 (date=2026-05-18). El reloj cruza medianoche y el operador
  // sigue trabajando: today=2026-05-19 pero el turno sigue siendo el del 18.
  // La lectura NO debe considerarse vencida.
  const readiness = getShiftStartReadiness({
    shift: { id: 99, state: 'draft', date: '2026-05-18' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [{
      id: 1,
      salt_level: 70,
      // Lectura a las 14:00 hora local de 2026-05-18 (en UTC eso es 20:00).
      salt_level_updated_at: '2026-05-18 20:00:00',
      min_salt_level_for_harvest: 65,
      display_name: 'Tanque 1',
    }],
    today: '2026-05-19', // ya cruzamos medianoche
  })

  assert.equal(readiness.canStart, true, 'el turno debe seguir abierto-able pese al cambio de día')
  assert.equal(readiness.tankReadiness[0].ready, true)
  assert.equal(readiness.tankReadiness[0].status, 'ok')
})

test('getShiftStartReadiness requires a fresh reading for a new shift on a new day', () => {
  // Escenario: nuevo Turno 1 al día siguiente. La lectura vieja
  // (de shift.date anterior) no aplica para este turno nuevo.
  const readiness = getShiftStartReadiness({
    shift: { id: 100, state: 'draft', date: '2026-05-19' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [{
      id: 1,
      salt_level: 70,
      salt_level_updated_at: '2026-05-18 20:00:00', // ayer
      min_salt_level_for_harvest: 65,
      display_name: 'Tanque 1',
    }],
    today: '2026-05-19',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.tankReadiness[0].ready, false)
  assert.equal(readiness.tankReadiness[0].status, 'stale')
  assert.ok(readiness.blockers.includes('Faltan lecturas de sal en tanques activos'))
})
