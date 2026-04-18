// ─── tareasService — gestión de tareas del supervisor a sus vendedores ──────
// Hoy el backend NO expone endpoints para esto. Este servicio es un adapter
// que lee/escribe en localStorage (marcado explícitamente como STUB).
//
// Cuando Sebastián habilite los endpoints reales, solo hay que reemplazar
// el cuerpo de cada función — la firma (params, retorno) permanece estable.
//
// Endpoints esperados del backend (BACKEND_TODO.md):
//   GET  /pwa-supv/tasks?assignee_id=X&state=Y        → list
//   POST /pwa-supv/tasks/create    {assignee_id, title, ...} → create
//   POST /pwa-supv/tasks/update    {task_id, patch}   → update
//   POST /pwa-supv/tasks/complete  {task_id, notes}   → mark done
//
// ⚠️ NO usar en producción sin backend. Los datos en localStorage no se
// sincronizan entre dispositivos ni quedan auditados.

const STORAGE_KEY = 'gf_supv_tasks_stub'
const IS_STUB = true

export const TASK_STATES = {
  pending: { label: 'Pendiente', color: '#f59e0b' },
  in_progress: { label: 'En curso', color: '#2B8FE0' },
  done: { label: 'Completada', color: '#22c55e' },
  cancelled: { label: 'Cancelada', color: '#94a3b8' },
}

export const TASK_PRIORITIES = {
  low: { label: 'Baja', color: '#94a3b8' },
  medium: { label: 'Media', color: '#f59e0b' },
  high: { label: 'Alta', color: '#ef4444' },
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { tasks: [] }
    return JSON.parse(raw)
  } catch {
    return { tasks: [] }
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch { /* quota exceeded */ }
}

/** Lista tareas filtradas. Acepta assignee_id, state, priority. */
export async function listTasks(filter = {}) {
  if (IS_STUB) {
    const store = readStore()
    let out = store.tasks || []
    if (filter.assignee_id) out = out.filter(t => t.assignee_id === filter.assignee_id)
    if (filter.state) out = out.filter(t => t.state === filter.state)
    if (filter.priority) out = out.filter(t => t.priority === filter.priority)
    out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    return out
  }
  // TODO(backend): return api('GET', `/pwa-supv/tasks?${toQuery(filter)}`)
  throw new Error('tareasService.listTasks: backend no disponible')
}

/** Crea una tarea. Requiere title, assignee_id. */
export async function createTask({ title, assignee_id, assignee_name, description, priority = 'medium', due_date }) {
  if (!title || !assignee_id) {
    throw new Error('Título y vendedor asignado son obligatorios')
  }
  if (IS_STUB) {
    const store = readStore()
    const task = {
      id: `stub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: String(title).trim(),
      description: description ? String(description).trim() : '',
      assignee_id: Number(assignee_id),
      assignee_name: assignee_name || '',
      priority,
      state: 'pending',
      due_date: due_date || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      completion_notes: '',
      _stub: true,
    }
    store.tasks = [...(store.tasks || []), task]
    writeStore(store)
    return task
  }
  // TODO(backend): return api('POST', '/pwa-supv/tasks/create', {...})
  throw new Error('tareasService.createTask: backend no disponible')
}

/** Actualiza estado/prioridad/notas. */
export async function updateTask(task_id, patch) {
  if (IS_STUB) {
    const store = readStore()
    const idx = (store.tasks || []).findIndex(t => t.id === task_id)
    if (idx < 0) throw new Error('Tarea no encontrada')
    store.tasks[idx] = {
      ...store.tasks[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    }
    writeStore(store)
    return store.tasks[idx]
  }
  throw new Error('tareasService.updateTask: backend no disponible')
}

/** Marca como completada con notas. */
export async function completeTask(task_id, completion_notes = '') {
  return updateTask(task_id, {
    state: 'done',
    completed_at: new Date().toISOString(),
    completion_notes: String(completion_notes).trim(),
  })
}

/** Elimina tarea (soft cancel en stub). Backend hará soft-delete. */
export async function cancelTask(task_id, reason = '') {
  return updateTask(task_id, {
    state: 'cancelled',
    completion_notes: String(reason).trim(),
  })
}

/** Flag para que la UI muestre banner "modo stub". */
export function isStubMode() {
  return IS_STUB
}
