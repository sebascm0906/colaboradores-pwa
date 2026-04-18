// ─── notasService — notas de coaching por vendedor y por cliente ────────────
// STUB: localStorage temporal hasta que backend exponga endpoints.
//
// Endpoints esperados del backend (BACKEND_TODO.md):
//   GET  /pwa-supv/notes?subject_type=X&subject_id=Y   → list notas
//   POST /pwa-supv/notes/create  {subject_type, subject_id, body} → create
//   POST /pwa-supv/notes/delete  {note_id}             → soft delete
//
// subject_type: 'vendor' | 'customer'
// subject_id: res.partner.id (para customer) | hr.employee.id (para vendor)

const STORAGE_KEY = 'gf_supv_notes_stub'
const IS_STUB = true

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { notes: [] }
    return JSON.parse(raw)
  } catch { return { notes: [] } }
}

function writeStore(store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) } catch { /* noop */ }
}

/** Lista notas de un sujeto (vendor/customer). */
export async function listNotes({ subject_type, subject_id }) {
  if (!subject_type || !subject_id) throw new Error('subject_type y subject_id son requeridos')
  if (IS_STUB) {
    const store = readStore()
    return (store.notes || [])
      .filter(n => n.subject_type === subject_type && Number(n.subject_id) === Number(subject_id))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  }
  throw new Error('notasService.listNotes: backend no disponible')
}

/** Crea una nota. */
export async function createNote({ subject_type, subject_id, subject_name, body, author_id, author_name }) {
  if (!body || !body.trim()) throw new Error('El contenido de la nota es obligatorio')
  if (!subject_type || !subject_id) throw new Error('subject_type y subject_id son requeridos')
  if (IS_STUB) {
    const store = readStore()
    const note = {
      id: `stub-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      subject_type,
      subject_id: Number(subject_id),
      subject_name: subject_name || '',
      body: body.trim(),
      author_id: author_id || null,
      author_name: author_name || '',
      created_at: new Date().toISOString(),
      _stub: true,
    }
    store.notes = [...(store.notes || []), note]
    writeStore(store)
    return note
  }
  throw new Error('notasService.createNote: backend no disponible')
}

/** Elimina una nota (stub: hard delete; backend: soft). */
export async function deleteNote(note_id) {
  if (IS_STUB) {
    const store = readStore()
    store.notes = (store.notes || []).filter(n => n.id !== note_id)
    writeStore(store)
    return { ok: true }
  }
  throw new Error('notasService.deleteNote: backend no disponible')
}

export function isStubMode() {
  return IS_STUB
}
