// ─── Notas de Coaching — backend real ────────────────────────────────────────
// Endpoints: /pwa-supv/notes (GET), /notes/create, /notes/delete
// Normalización al shape canónico que consume la UI:
//   note_id      → id
//   create_date  → created_at
//   body         → body  (el backend usa `body`, NO `content`)
//   (alias)      → content  [defensivo: cualquier UI legacy que lea .content también funciona]
// ─────────────────────────────────────────────────────────────────────────────
import { api } from '../../lib/api'

export const IS_STUB = false

/** Normaliza la respuesta del backend al shape que espera la UI.
 *  Garantiza que `body` siempre esté presente y expone `content` como alias. */
function normalizeNote(n) {
  if (!n) return n
  // Backend envía `body`. Aceptamos también `content` por si cambia en el futuro.
  const body = n.body ?? n.content ?? ''
  return {
    ...n,
    id:         n.note_id     ?? n.id,
    created_at: n.create_date ?? n.created_at ?? null,
    body,
    content:    body, // alias defensivo — UI puede leer cualquiera de los dos
  }
}

/** Lista notas de un sujeto (vendor/customer). */
export async function listNotes({ subject_type, subject_id }) {
  if (!subject_type || !subject_id) throw new Error('subject_type y subject_id son requeridos')
  const qs = new URLSearchParams({
    subject_type,
    subject_id: String(subject_id),
  })
  const result = await api('GET', `/pwa-supv/notes?${qs}`)
  const payload = result?.data ?? result ?? {}
  const notes = Array.isArray(payload.notes) ? payload.notes
              : Array.isArray(payload)        ? payload
              : []
  return notes.map(normalizeNote)
}

/** Crea una nota de coaching.
 *  subject_type='vendor'   → subject_id es hr.employee.id
 *  subject_type='customer' → subject_id es res.partner.id
 */
export async function createNote({ subject_type, subject_id, subject_name, body, author_id, author_name }) {
  if (!body || !body.trim()) throw new Error('El contenido de la nota es obligatorio')
  if (!subject_type || !subject_id) throw new Error('subject_type y subject_id son requeridos')

  const result = await api('POST', '/pwa-supv/notes/create', {
    body:         body.trim(),
    subject_type,
    subject_id:   Number(subject_id),
    author_id:    author_id || undefined,
  })
  const data = result?.data ?? result
  return normalizeNote(data)
}

/** Elimina una nota (soft delete en backend: active=False). */
export async function deleteNote(note_id) {
  const result = await api('POST', '/pwa-supv/notes/delete', {
    note_id: Number(note_id),
  })
  return result?.data ?? result ?? { ok: true }
}

export function isStubMode() {
  return IS_STUB
}
