// ─── logScreenError — Trazabilidad unificada de errores silenciosos ──────────
// Usado por pantallas V2 para:
//   1. Imprimir un console.warn con prefijo del screen (fácil filtrar en DevTools)
//   2. Devolver un mensaje legible para mostrar al usuario (setError/banner)
//
// Uso típico dentro de un catch:
//
//   try { ... }
//   catch (e) {
//     logScreenError('ScreenControlRuta', 'loadData', e)
//   }
//
// Para un catch que además quiere fijar estado visible:
//
//   catch (e) {
//     const msg = logScreenError('ScreenMerma', 'getScrapReasons', e)
//     setError(msg)
//   }
//
// El prefijo `[GFSC]` ayuda a filtrar en logs de producción:
//   chrome://inspect → filter: "GFSC"
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Loguea un error silencioso con contexto y devuelve un mensaje amigable.
 * @param {string} screen   - Nombre de la pantalla o servicio (p.ej. 'ScreenMerma')
 * @param {string} action   - Acción que falló (p.ej. 'loadInventory')
 * @param {unknown} error   - El error capturado
 * @returns {string}        - Mensaje legible para mostrar al usuario
 */
export function logScreenError(screen, action, error) {
  const message = error?.message || String(error || 'Error desconocido')
  // eslint-disable-next-line no-console
  console.warn(`[GFSC][${screen}] ${action} failed:`, message, error)
  return message
}

/**
 * Wrapper defensivo — ejecuta un async op, loguea errores y devuelve fallback.
 * @template T
 * @param {string} screen
 * @param {string} action
 * @param {() => Promise<T>} fn
 * @param {T} fallback
 * @returns {Promise<T>}
 */
export async function safeCall(screen, action, fn, fallback) {
  try {
    return await fn()
  } catch (e) {
    logScreenError(screen, action, e)
    return fallback
  }
}
