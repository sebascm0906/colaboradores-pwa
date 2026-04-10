// barraService.js — Operador de Barra Service Layer
// Wraps Barra-specific endpoints confirmed in Odoo production:
//   /api/ice/slot/harvest  → Sebastián's controller (DEPLOYED)
//   /api/ice/tank/incident → Sebastián's controller (DEPLOYED)
//   gf.production.machine  → x_salt_level, x_salt_level_updated_at, x_brine_temp_current
//   x_ice.brine.slot       → x_salt_level_at_extraction, x_operator_id, x_brine_temp_at_extraction
//
// Rolito-shared functions (shift, cycles, packing, downtime, scrap, close)
// live in rolitoService.js — both roles import from there.

import {
  harvestSlot,
  createTankIncident,
  getMachineSalt,
} from './api'

// ── Constants ────────────────────────────────────────────────────────────────

export const MACHINE_ID_BARRA = 1  // Tank 1 = barras

export const INCIDENT_TYPES = [
  { id: 'salt_low',      label: 'Nivel de sal bajo',       icon: '\u26A0' },
  { id: 'temp_high',     label: 'Temperatura alta',        icon: '\uD83C\uDF21' },
  { id: 'leak',          label: 'Fuga de salmuera',        icon: '\uD83D\uDCA7' },
  { id: 'mechanical',    label: 'Falla mecanica',          icon: '\u2699' },
  { id: 'other',         label: 'Otro',                    icon: '\u2753' },
]

// ── Harvest ─────────────────────────────────────────────────────────────────

/**
 * Harvest a brine slot — calls POST /api/ice/slot/harvest
 * @param {number} slotId — x_ice.brine.slot id
 * @param {number} qty — kg harvested
 * @param {string} lotName — lot identifier
 * @param {number} [temperature] — brine temp at extraction
 */
export async function harvest(slotId, qty, lotName, temperature = 0) {
  return harvestSlot({
    slot_id: slotId,
    qty: parseFloat(qty) || 0,
    lot_name: lotName || '',
    temperature: parseFloat(temperature) || 0,
  })
}

// ── Tank Incident ───────────────────────────────────────────────────────────

/**
 * Report a tank incident — calls POST /api/ice/tank/incident
 * @param {number} machineId — gf.production.machine id
 * @param {string} incidentType — one of INCIDENT_TYPES[].id
 * @param {string} description — free text
 */
export async function reportIncident(machineId, incidentType, description = '') {
  return createTankIncident({
    machine_id: machineId || MACHINE_ID_BARRA,
    incident_type: incidentType,
    description: description || '',
  })
}

// ── Salt Level ──────────────────────────────────────────────────────────────

/**
 * Get current salt level and brine temp from the machine.
 * @param {number} [machineId] — defaults to MACHINE_ID_BARRA
 * @returns {{ salt_level, salt_level_updated_at, brine_temp, name }}
 */
export async function getSaltLevel(machineId) {
  return getMachineSalt(machineId || MACHINE_ID_BARRA)
}
