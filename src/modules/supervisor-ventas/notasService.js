// ─── Notas de Coaching — backend real ────────────────────────────────────────
// Endpoints: /pwa-supv/notes (GET), /notes/create, /notes/delete
// Normalización note_id→id y create_date→created_at para no tocar la UI.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from '../../lib/api'

export const IS_STUB = false

/** Normaliza la respuesta del backend al shape que espera la UI. */
function normalizeNote(n) {
  if (!n) return n
  return {
    ...n,
    id:         n.note_id     ?? n.id,
    created_at: n.create_date ?? n.created_at ?? null,
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
