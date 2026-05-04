// ─── clearLocalState — limpieza segura de estado operativo Grupo Frío ────────
// Mantiene una whitelist EXPLÍCITA de keys conocidas y un único prefijo
// permitido (gfsc.reconciliation.v1.<shiftId>) para no destruir preferencias
// no sensibles guardadas por otras partes del PWA o por librerías externas.
//
// Reglas no negociables:
//   - NUNCA usar localStorage.clear()
//   - NUNCA borrar todas las keys gf_* o gfsc.* indiscriminadamente
//   - Solo borrar las keys listadas abajo + el prefijo de reconciliación
//
// Si el guardia detecta nuevas keys sensibles, agregarlas a KNOWN_SENSITIVE_KEYS
// (no extender el conjunto de prefijos sin revisión).

const KNOWN_SENSITIVE_KEYS = [
  // Sesión/credenciales
  'gf_session',
  // Cache operacional Almacén PT
  'gf_pt_inventory_cache_v1',
  // Estado de ruta del Jefe de Ruta (KM, cierre, liquidación)
  'gf_ruta_km',
  'gf_ruta_cierre',
  'gf_ruta_liquidacion',
  // Estado compartido producción/PT
  'gfsc.handover.v1',
  'gfsc.operator_turn_close.v1',
  'gfsc.rolito_bag_return_declaration.v1',
]

// Prefijo único permitido. Las reconciliaciones se almacenan como
// gfsc.reconciliation.v1.<shiftId> y debemos limpiar todas al cerrar sesión.
const KNOWN_SENSITIVE_PREFIXES = [
  'gfsc.reconciliation.v1.',
]

/**
 * Borra el estado operativo conocido de Grupo Frío en localStorage.
 *
 * Ejecuta en logout manual, sesión expirada y sesión revocada. Nunca debe
 * borrar preferencias locales no sensibles (tema, impresoras, flags
 * visuales, onboarding) ni storage de librerías externas.
 *
 * Es defensivo: si localStorage no está disponible (modo privado), el error
 * se silencia y la función no lanza.
 */
export function clearGrupoFrioLocalState() {
  try {
    if (typeof localStorage === 'undefined') return

    // 1. Keys exactas conocidas
    KNOWN_SENSITIVE_KEYS.forEach((key) => {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    })

    // 2. Prefijos permitidos — recolectamos primero para no mutar el
    //    índice mientras iteramos.
    const toDelete = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      if (KNOWN_SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        toDelete.push(key)
      }
    }
    toDelete.forEach((key) => {
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    })
  } catch {
    // localStorage indisponible: ignoramos para no bloquear el logout.
  }
}
