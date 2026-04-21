#!/usr/bin/env node
// scripts/voice/deploy_workflows.mjs
//
// Despliega W120, W121, W122 a n8n.grupofrio.mx via REST API. Idempotente.
// NO activa los workflows (deja active: false). Activacion es manual en UI.
//
// Env requeridos: N8N_API_KEY
// Env opcionales: N8N_BASE_URL (default https://n8n.grupofrio.mx)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.N8N_BASE_URL || 'https://n8n.grupofrio.mx'
const API_KEY = process.env.N8N_API_KEY
if (!API_KEY) { console.error('FALTA N8N_API_KEY en env'); process.exit(1) }

const headers = {
  'Content-Type': 'application/json',
  'X-N8N-API-KEY': API_KEY,
  Accept: 'application/json',
}

const WORKFLOWS = [
  { code: 'W120', file: 'workflows/OPS_W120_voice_intake_v2.json' },
  { code: 'W121', file: 'workflows/OPS_W121_voice_catalog_sync_v1.json' },
  { code: 'W122', file: 'workflows/OPS_W122_voice_feedback_v1.json' },
]

async function listWorkflows() {
  const res = await fetch(`${BASE}/api/v1/workflows?limit=250`, { headers })
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.data || []
}

// n8n API create exige shape especifico: name, nodes, connections, settings.
// Rechaza: active, tags, id, versionId, meta, pinData, staticData, triggerCount.
function cleanForCreate(wf) {
  return {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
  }
}

// Update permite el mismo shape; n8n mantiene active:false si no se pasa activate.
function cleanForUpdate(wf) {
  return cleanForCreate(wf)
}

async function createWorkflow(payload) {
  const res = await fetch(`${BASE}/api/v1/workflows`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`create ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function updateWorkflow(id, payload) {
  const res = await fetch(`${BASE}/api/v1/workflows/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`update ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function deployOne(code, file) {
  const raw = fs.readFileSync(path.join(__dirname, file), 'utf-8')
  const wf = JSON.parse(raw)
  const all = await listWorkflows()
  const existing = all.find(w => w.name === wf.name)
  if (existing) {
    console.log(`[${code}] UPDATE id=${existing.id} name="${wf.name}"`)
    const r = await updateWorkflow(existing.id, cleanForUpdate(wf))
    return { code, id: r.id, name: r.name, action: 'updated', active: r.active === true }
  } else {
    console.log(`[${code}] CREATE name="${wf.name}"`)
    const r = await createWorkflow(cleanForCreate(wf))
    return { code, id: r.id, name: r.name, action: 'created', active: r.active === true }
  }
}

const results = []
for (const wf of WORKFLOWS) {
  try {
    const r = await deployOne(wf.code, wf.file)
    results.push(r)
    console.log(`  -> id=${r.id} action=${r.action} active=${r.active}`)
  } catch (e) {
    console.error(`  [${wf.code}] FALLO: ${e.message}`)
    results.push({ code: wf.code, error: e.message })
  }
}

console.log()
console.log('═══════════════════════════════════════════════════════════')
console.log('Deploy summary:')
for (const r of results) {
  if (r.error) {
    console.log(`  [${r.code}] ERROR: ${r.error.slice(0, 120)}`)
  } else {
    console.log(`  [${r.code}] id=${r.id}  "${r.name}"  ${r.action}  active=${r.active}`)
  }
}
console.log('═══════════════════════════════════════════════════════════')
console.log()
console.log('CAVEAT CRITICO (doc v4 §6.6):')
console.log('  W120 y W122 tienen webhook trigger. El API de n8n NO re-registra')
console.log('  webhook paths al update. Yamil debe hacer toggle manual OFF->ON')
console.log('  en la UI para que /webhook/voice-intake y /webhook/voice-feedback')
console.log('  esten realmente activos.')
console.log('  W121 es schedule trigger: toggle normal en UI basta.')

const hasError = results.some(r => r.error)
process.exit(hasError ? 1 : 0)
