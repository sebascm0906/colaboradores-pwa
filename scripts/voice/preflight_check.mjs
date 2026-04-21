#!/usr/bin/env node
// scripts/voice/preflight_check.mjs
//
// Preflight real para Voice-to-Form PoC. Usa la arquitectura verdadera:
//   - n8n self-hosted (docker container "n8n" en /opt/kold-n8n)
//   - Variables viven en el .env del container, NO en n8n /api/v1/variables
//     (403 Enterprise-gated confirmado 2026-04-21)
//   - Acceso: SSH root@89.116.49.193 (~/.ssh/id_ed25519) + docker inspect
//   - Odoo XMLRPC con authenticate dinamico: common.authenticate(db, user, pwd) -> uid
//
// Chequeos:
//   1. N8N_API_KEY presente en env (para scripts de deploy posteriores)
//   2. SSH al VPS funciona
//   3. Container "n8n" corriendo
//   4. Env vars criticas presentes (SIN exponer valores, solo len + first4):
//        CRITICAS PRESENTES  : ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD, OPENAI_API_SECRET
//        BLOQUEANTES FALTAN  : DEEPGRAM_API_KEY, N8N_VOICE_TOKEN
//   5. Odoo authenticate dinamico con credenciales locales (mismo user que server)
//      + search_count sobre kold.voice.catalog -> Voice Admin
//
// Output: resumen + lista de vars faltantes para reporte al humano.

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import xmlrpc from 'xmlrpc'

const VPS_USER = 'root'
const VPS_HOST = '89.116.49.193'
const VPS_KEY  = process.env.HOME
  ? `${process.env.HOME}/.ssh/id_ed25519`
  : 'C:/Users/Finanzas/.ssh/id_ed25519'
const CONTAINER = 'n8n'

// Vars presentes esperadas en el .env del server:
const EXPECTED_PRESENT = ['ODOO_URL', 'ODOO_DB', 'ODOO_USER', 'ODOO_PASSWORD', 'OPENAI_API_SECRET']
// Vars que el PoC necesita y a la fecha del preflight NO existen:
const EXPECTED_MISSING = ['DEEPGRAM_API_KEY', 'N8N_VOICE_TOKEN']
// Nombres alternativos a rechazar (legacy doc v4):
const LEGACY_FORBIDDEN = ['OPENAI_API_KEY', 'ODOO_UID']

const BASE = process.env.N8N_BASE_URL || 'https://n8n.grupofrio.mx'
const API_KEY = process.env.N8N_API_KEY

function pad(s, n) { return String(s).padEnd(n) }
function ok(msg)   { console.log('[OK]   ' + msg) }
function info(msg) { console.log('[..]   ' + msg) }
function warn(msg) { console.log('[WARN] ' + msg) }
function fail(msg) { console.error('[X]    ' + msg); process.exitCode = 1 }

console.log('═══════════════════════════════════════════════════════════')
console.log('Voice-to-Form PoC — Preflight (real server model)')
console.log('═══════════════════════════════════════════════════════════')

// --- 1. N8N_API_KEY ---
if (!API_KEY) fail('FALTA N8N_API_KEY en env (requerido por deploy_workflows.mjs posteriormente)')
else ok(`N8N_API_KEY presente (base=${BASE})`)

// --- 2. SSH + container ---
function sshExec(cmd) {
  // Usa OpenSSH de Windows si existe, fallback a 'ssh' del PATH
  const sshBin = process.platform === 'win32' && existsSync('C:/Windows/System32/OpenSSH/ssh.exe')
    ? 'C:/Windows/System32/OpenSSH/ssh.exe'
    : 'ssh'
  const res = spawnSync(sshBin, [
    '-i', VPS_KEY,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=15',
    '-o', 'BatchMode=yes',
    `${VPS_USER}@${VPS_HOST}`,
    cmd,
  ], { encoding: 'utf-8' })
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' }
}

info(`SSH a ${VPS_USER}@${VPS_HOST} (key=${VPS_KEY})...`)
const sshTest = sshExec('echo SSH_OK && docker ps --format "{{.Names}}" | grep -E "^n8n$" || echo CONTAINER_MISSING')
if (sshTest.status !== 0) {
  fail(`SSH fallo. stderr: ${sshTest.stderr.slice(0, 200)}`)
  console.log('\n═══════════════ PREFLIGHT ABORTADO ═══════════════')
  process.exit(1)
}
const sshOut = sshTest.stdout.trim()
if (!sshOut.includes('SSH_OK')) {
  fail(`SSH responde inesperado: ${sshOut.slice(0, 200)}`)
} else ok('SSH conecta al VPS')

if (sshOut.includes('CONTAINER_MISSING') || !sshOut.includes('\nn8n')) {
  // Detecta si la segunda linea es literalmente "n8n"
  const lines = sshOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (!lines.includes('n8n')) fail(`Container "${CONTAINER}" NO corriendo`)
  else ok(`Container "${CONTAINER}" corriendo`)
} else {
  ok(`Container "${CONTAINER}" corriendo`)
}

// --- 3. Env vars del container ---
info(`Inspeccionando env vars del container "${CONTAINER}" (sin exponer valores)...`)
const awkCheck = EXPECTED_PRESENT.concat(EXPECTED_MISSING, LEGACY_FORBIDDEN)
  .map(k => `^${k}=`).join('|')
const inspectCmd = `docker inspect ${CONTAINER} --format '{{range .Config.Env}}{{println .}}{{end}}' ` +
  `| awk -F= '/${awkCheck}/ { v=$2; k=$1; len=length(v); first4=(len>=4)?substr(v,1,4):v; print k":len="len":first4="first4 }'`
const inspectRes = sshExec(inspectCmd)
if (inspectRes.status !== 0) fail(`docker inspect fallo: ${inspectRes.stderr.slice(0, 200)}`)

const rows = {}
for (const line of inspectRes.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
  const [key, lenPart, first4Part] = line.split(':')
  rows[key] = {
    len: Number((lenPart || 'len=0').split('=')[1] || 0),
    first4: (first4Part || 'first4=').split('=')[1] || '',
  }
}

console.log()
console.log('--- Presencia de variables criticas ---')
let missingCritical = []
for (const k of EXPECTED_PRESENT) {
  const r = rows[k]
  if (r && r.len > 0) {
    console.log(`  [OK]   ${pad(k, 22)} len=${pad(r.len, 3)} first4="${r.first4}"`)
  } else {
    console.log(`  [X]    ${pad(k, 22)} MISSING`)
    missingCritical.push(k)
    process.exitCode = 1
  }
}

console.log()
console.log('--- Bloqueantes pendientes (esperados NO presentes) ---')
let blockersMissing = []
for (const k of EXPECTED_MISSING) {
  const r = rows[k]
  if (r && r.len > 0) {
    console.log(`  [OK!]  ${pad(k, 22)} len=${r.len} first4="${r.first4}"  (ya presente — imprevisto)`)
  } else {
    console.log(`  [~]    ${pad(k, 22)} PENDIENTE — se agregara justo antes del deploy`)
    blockersMissing.push(k)
  }
}

console.log()
console.log('--- Legacy forbidden (no deben aparecer en los workflows) ---')
for (const k of LEGACY_FORBIDDEN) {
  const r = rows[k]
  if (r && r.len > 0) {
    console.log(`  [WARN] ${pad(k, 22)} PRESENT (informativo) — workflows NO deben usarla`)
  } else {
    console.log(`  [OK]   ${pad(k, 22)} ausente (correcto)`)
  }
}

// --- 4. Odoo authenticate dinamico + Voice Admin ---
console.log()
console.log('--- Odoo: authenticate dinamico + Voice Admin ---')

// Leemos las credenciales LOCALES (mismo user que el server: direccion@grupofrio.mx)
// para probar el patron que usaran los workflows, SIN exponer valores del server.
const localEnvPath = `${process.cwd().replace(/colaboradores-pwa.*$/, '')}sebastian-tradicional/.env.local`
let ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD
if (existsSync(localEnvPath)) {
  const raw = readFileSync(localEnvPath, 'utf-8')
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('#') || !line.includes('=')) continue
    const [k, ...rest] = line.split('=')
    const v = rest.join('=').trim().replace(/^["']|["']$/g, '')
    if (k.trim() === 'ODOO_URL') ODOO_URL = v
    else if (k.trim() === 'ODOO_DB') ODOO_DB = v
    else if (k.trim() === 'ODOO_SERVICE_USER') ODOO_USER = v
    else if (k.trim() === 'ODOO_SERVICE_PASSWORD') ODOO_PASSWORD = v
  }
}

if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_PASSWORD) {
  warn('No se pudieron leer creds locales de sebastian-tradicional/.env.local')
  warn('  -> salto el check de Voice Admin; verificar manualmente cuando el token este listo')
} else {
  // Validar que el user local matchea signature del server (first4 + last4)
  const serverUser = rows['ODOO_USER']
  if (serverUser && serverUser.first4) {
    const localFirst4 = ODOO_USER.slice(0, 4)
    const localLen = ODOO_USER.length
    if (serverUser.first4 === localFirst4 && serverUser.len === localLen) {
      ok(`ODOO_USER del server matches local (len=${localLen}, first4="${localFirst4}")`)
    } else {
      warn(`ODOO_USER difiere: server len=${serverUser.len}/first4="${serverUser.first4}" vs local len=${localLen}/first4="${localFirst4}"`)
      warn('  -> el check de Voice Admin NO refleja al user real del server')
    }
  }

  // Paso 1: common.authenticate (patron que usaran los workflows)
  const common = xmlrpc.createSecureClient({ url: `${ODOO_URL.replace(/\/+$/, '')}/xmlrpc/2/common` })
  function rpc(client, method, params) {
    return new Promise((resolve, reject) => {
      client.methodCall(method, params, (err, r) => err ? reject(err) : resolve(r))
    })
  }
  try {
    info('Probando common.authenticate(db, user, password)...')
    const uid = await rpc(common, 'authenticate', [ODOO_DB, ODOO_USER, ODOO_PASSWORD, {}])
    if (!uid) throw new Error('authenticate devolvio falsy — credenciales invalidas')
    ok(`authenticate OK -> uid=${uid} (patron dinamico verificado)`)

    // Paso 2: search_count sobre kold.voice.catalog
    const obj = xmlrpc.createSecureClient({ url: `${ODOO_URL.replace(/\/+$/, '')}/xmlrpc/2/object` })
    const count = await rpc(obj, 'execute_kw', [ODOO_DB, uid, ODOO_PASSWORD, 'kold.voice.catalog', 'search_count', [[]]])
    ok(`kold.voice.catalog.search_count=${count} -> Voice Admin confirmado`)
  } catch (e) {
    const msg = String(e?.message || e)
    if (msg.includes('AccessError') || msg.includes('no tiene los derechos')) {
      fail('Usuario NO tiene Voice Admin. Pedirle a Sebastian asignar gf_voice_intake.group_voice_admin.')
    } else {
      fail(`Odoo RPC fallo: ${msg}`)
    }
  }
}

// --- 5. Resumen ---
console.log()
console.log('═══════════════════════════════════════════════════════════')
if ((process.exitCode || 0) === 0 && missingCritical.length === 0) {
  console.log('PREFLIGHT: VERDE en vars criticas y Odoo.')
} else if (missingCritical.length > 0) {
  console.log(`PREFLIGHT: ROJO — faltan vars criticas: ${missingCritical.join(', ')}`)
} else {
  console.log('PREFLIGHT: amarillo — ver checks arriba.')
}
console.log()
console.log('Bloqueantes del deploy (no son error — es el estado esperado pre-deploy):')
if (blockersMissing.length === 0) console.log('  (ninguno)')
else for (const k of blockersMissing) {
  const where =
    k === 'DEEPGRAM_API_KEY' ? 'OPS_W120_voice_intake (Deepgram STT HTTP call)'
    : k === 'N8N_VOICE_TOKEN' ? 'OPS_W120/W122 auth_check del webhook + frontend Bearer'
    : 'desconocido'
  console.log(`  - ${pad(k, 22)} usada en: ${where}`)
}
console.log()
console.log('Naming real del server (usar esto en los workflows):')
console.log('  OPENAI_API_SECRET   (NO OPENAI_API_KEY)')
console.log('  ODOO_USER           (NO ODOO_UID — se obtiene via common.authenticate)')
console.log('  ODOO_PASSWORD')
console.log('  ODOO_DB')
console.log('  ODOO_URL')
console.log('═══════════════════════════════════════════════════════════')
