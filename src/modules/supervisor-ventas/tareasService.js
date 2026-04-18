// ─── Tareas del Supervisor — backend real ────────────────────────────────────
// Endpoints: /pwa-supv/tasks (GET), /tasks/create, /tasks/update, /tasks/complete
// La normalización task_id→id y name→title se hace aquí para no tocar la UI.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from '../../lib/api'

export const IS_STUB = false

export const TASK_STATES = {
  pending:     { label: 'Pendiente',  color: '#f59e0b' },
  in_progress: { label: 'En curso',   color: '#2B8FE0' },
  done:        { label: 'Completada', color: '#22c55e' },
  cancelled:   { label: 'Cancelada',  color: '#94a3b8' },
}

export const TASK_PRIORITIES = {
  low:    { label: 'Baja',  color: '#94a3b8' },
  medium: { label: 'Media', color: '#f59e0b' },
  high:   { label: 'Alta',  color: '#ef4444' },
}

/** Normaliza la respuesta del backend al shape que espera la UI. */
function normalizeTask(t) {
  if (!t) return t
  return {
    ...t,
    id:         t.task_id    ?? t.id,
    title:      t.name       ?? t.title ?? '',
    created_at: t.create_date ?? t.created_at ?? null,
  }
}

/** Lista tareas filtradas. Acepta assignee_id, state, priority. */
export async function listTasks(filter = {}) {
  const qs = new URLSearchParams()
  if (filter.assignee_id) qs.set('assignee_id', String(filter.assignee_id))
  if (filter.state)       qs.set('state',       filter.state)
  if (filter.priority)    qs.set('priority',    filter.priority)
  if (filter.limit)       qs.set('limit',       String(filter.limit))

  const result = await api('GET', `/pwa-supv/tasks${qs.toString() ? `?${qs}` : ''}`)
  const payload = result?.data ?? result ?? {}
  const tasks = Array.isArray(payload.tasks) ? payload.tasks
              : Array.isArray(payload)        ? payload
              : []
  return tasks.map(normalizeTask)
}

/** Crea una tarea. Requiere title, assignee_id. */
export async function createTask({ title, assignee_id, assignee_name, description, priority = 'medium', due_date, partner_id }) {
  if (!title || !assignee_id) {
    throw new Error('Título y vendedor asignado son obligatorios')
  }
  const result = await api('POST', '/pwa-supv/tasks/create', {
    title,
    assignee_id: Number(assignee_id),
    description: description || undefined,
    priority,
    due_date:    due_date    || undefined,
    partner_id:  partner_id  || undefined,
  })
  const data = result?.data ?? result
  return normalizeTask(data)
}

/** Actualiza estado/prioridad/notas. patch: {state, priority, due_date, description} */
export async function updateTask(task_id, patch) {
  const result = await api('POST', '/pwa-supv/tasks/update', {
    task_id: Number(task_id),
    patch,
  })
  const data = result?.data ?? result
  return normalizeTask(data)
}

/** Marca como completada con notas. */
export async function completeTask(task_id, completion_notes = '') {
  const result = await api('POST', '/pwa-supv/tasks/complete', {
    task_id:          Number(task_id),
    completion_notes: String(completion_notes).trim(),
  })
  const data = result?.data ?? result
  return normalizeTask(data)
}

/** Cancela una tarea (soft via update). */
export async function cancelTask(task_id, reason = '') {
  return updateTask(task_id, {
    state:            'cancelled',
    completion_notes: String(reason).trim(),
  })
}

/** Flag para que la UI muestre banner "modo stub". */
export function isStubMode() {
  return IS_STUB
}
