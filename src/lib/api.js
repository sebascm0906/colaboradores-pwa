// ─── API Helper Central — Bypass-safe ────────────────────────────────────────
// Todas las llamadas a n8n pasan por aquí.
// Si la sesión es bypass (_bypass=true), NO dispara gf:session-expired en 401.
// En bypass, los endpoints fallarán (no hay JWT real) pero la sesión se mantiene
// para poder navegar la UI sin ser sacado al login.

const N8N_BASE = '/api-n8n'

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem('gf_session') || '{}')
  } catch {
    return {}
  }
}

function getToken() {
  return getSession().session_token || ''
}

function isBypass() {
  return getSession()._bypass === true
}

function expireSession() {
  if (!isBypass()) {
    window.dispatchEvent(new Event('gf:session-expired'))
  }
}

/**
 * Llamada genérica a n8n.
 * @param {string} method - GET, POST, PATCH, etc.
 * @param {string} path - Ruta del webhook (e.g. /pwa-ruta/my-plan)
 * @param {object} [body] - Body para POST/PATCH
 * @returns {Promise<any>} - Datos de respuesta (desenvuelve json.data si existe)
 * @throws {Error} - 'no_session' si no hay token, 'bypass_no_api' si es bypass,
 *                    o mensaje del servidor
 */
export async function api(method, path, body) {
  const token = getToken()
  if (!token) {
    expireSession()
    throw new Error('no_session')
  }

  // En bypass, las llamadas a API fallarán con 401 porque el token es fake.
  // Lanzamos un error controlado sin matar la sesión para que la UI maneje
  // el estado vacío en lugar de redirigir al login.
  if (isBypass()) {
    throw new Error('bypass_no_api')
  }

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(`${N8N_BASE}${path}`, opts)

  if (!res.ok) {
    if (res.status === 401) {
      expireSession()
      throw new Error('no_session')
    }
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `http_${res.status}`)
  }

  const json = await res.json()
  // n8n responde { success, data } — desenvuelve para que los screens reciban el dato directo
  return json.data !== undefined ? json.data : json
}

/**
 * Shorthand para GET sin body
 */
export function apiGet(path) {
  return api('GET', path)
}

/**
 * Shorthand para POST
 */
export function apiPost(path, body) {
  return api('POST', path, body)
}

/**
 * Shorthand para PATCH
 */
export function apiPatch(path, body) {
  return api('PATCH', path, body)
}
