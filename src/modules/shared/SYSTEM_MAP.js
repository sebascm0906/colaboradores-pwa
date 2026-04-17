// SYSTEM_MAP.js — Estado final del sistema PWA Produccion
// Consolidacion Fase 11
// Referencia interna para desarrolladores. NO se importa en runtime.
//
// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCCION — Endpoints canonicos (Odoo controllers via odooHttp)
// ═══════════════════════════════════════════════════════════════════════════════
//
// │ Endpoint                                │ Contrato                         │
// │ GET  /api/production/machines           │ ?plant_id → [{ id,name,type,plant,line }] │
// │ GET  /api/production/lines              │ ?plant_id → [{ id,name,type,plant }]      │
// │ POST /api/production/shift/close-check  │ { shift_id } → readiness        │
// │ POST /api/production/shift/close        │ { shift_id } → close            │
// │ POST /api/production/validate-pin       │ { pin, employee_id }            │
// │ POST /api/production/shift/bag-reconciliation │ { shift_id, bags_received, bags_remaining } │
// │ POST /api/production/pt/reconcile       │ { shift_id, manual? } → { system, differences, incidents, consistent } │
//
// ═══════════════════════════════════════════════════════════════════════════════
// INCIDENTES — BFF-generado (pendiente migrar a controller Odoo)
// ═══════════════════════════════════════════════════════════════════════════════
//
// │ GET  /api/production/incidents          │ ?shift_id → [{ id,name,state,... }] │
// │ POST /api/production/incidents          │ { shift_id, name, incident_type, severity } │
// │ POST /api/production/incidents/resolve  │ { incident_id } → { state: 'resolved' } │
//
// Selection values NO confirmados con backend:
//   incident_type: production, quality, inventory, equipment, safety, other
//   severity: low, medium, high
//   state: open, resolved
//
// ═══════════════════════════════════════════════════════════════════════════════
// BFF LEGACY — /pwa-prod/* y /pwa-sup/* (operativos, sin reemplazo REST)
// ═══════════════════════════════════════════════════════════════════════════════
//
// /pwa-prod/shift-summary, /pwa-prod/checklist-*, /pwa-prod/evaporator-*,
// /pwa-prod/transformation-*, /pwa-prod/downtime-*, /pwa-prod/scrap-*,
// /pwa-prod/packing-create, /pwa-prod/slot-*, /pwa-prod/tanks, etc.
//
// /pwa-sup/dashboard, /pwa-sup/shifts, /pwa-sup/shift-create,
// /pwa-sup/downtimes, /pwa-sup/downtime-create, /pwa-sup/downtime-close,
// /pwa-sup/scraps, /pwa-sup/energy, /pwa-sup/maintenance, etc.
//
// Eliminado: /pwa-prod/bag-reconciliation (migrado a canonico Fase 11)
//
// ═══════════════════════════════════════════════════════════════════════════════
// LOGISTICA — Scope separado, NO integrado en produccion
// ═══════════════════════════════════════════════════════════════════════════════
//
// Handover: localStorage puro.
//   - /api/production/handover → NO EXISTE
//   - Endpoints de logistica (/gf/logistics/api/.../shift_handover/) existen
//     pero su integracion es scope de una fase separada.
//   - handoverLocalStore.js + handoverService.js quedan intactos.
//
// ═══════════════════════════════════════════════════════════════════════════════
// SERVICIOS SHARED
// ═══════════════════════════════════════════════════════════════════════════════
//
// productionAPI.js      → Capa unica. 7 endpoints canonicos + incidentes BFF.
// machineService.js     → Odoo controller + normalizer + fallback.
// lineService.js        → Odoo controller + fallback.
// incidentService.js    → BFF-generado. Selection values con safeSelectionValue().
// reconciliationPT.js   → Backend real. localStorage solo como cache.
// supervisorAuth.js     → PIN, cierre, PT reconcile. Todo backend-first.
// shiftReadiness.js     → Backend readiness + snapshot KPIs para dashboard.
// handoverService.js    → LOGISTICA. localStorage puro. Scope separado.
// handoverLocalStore.js → LOGISTICA. localStorage puro. Scope separado.
//
// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACKS ACTIVOS (encapsulados y documentados)
// ═══════════════════════════════════════════════════════════════════════════════
//
// 1. machineService.js — FALLBACK_MACHINES (8 maquinas).
//    Encapsulado en loadMachines(). Solo si endpoint falla.
//
// 2. lineService.js — FALLBACK_LINES (2 lineas).
//    Encapsulado en loadLines(). Solo si endpoint falla.
//
// 3. normalizeMachine() — acepta shape canonico y legacy.
//    Defensivo para transicion de deploy. Eliminar cuando canonico al 100%.
//
// ═══════════════════════════════════════════════════════════════════════════════
// DEUDA TECNICA RESTANTE
// ═══════════════════════════════════════════════════════════════════════════════
//
// 1. api.js — fallback de action_close_shift usa string parsing.
//    Eliminar cuando action_close_shift este en 100% de instancias.
//
// 2. Selection values de incidentes no confirmados con Odoo.
//    safeSelectionValue() mitiga el riesgo.
//
// 3. ScreenCicloRolito.jsx:153 — TODO de verificacion de PIN.
//
