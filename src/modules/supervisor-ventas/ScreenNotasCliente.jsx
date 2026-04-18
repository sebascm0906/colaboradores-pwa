// ─── ScreenNotasCliente — notas de coaching por vendedor o cliente ─────────
// Selector de sujeto (vendedor o cliente), crear/ver/eliminar notas.
//
// ⚠️ STUB MODE: los datos viven en localStorage hasta que backend exponga
// /pwa-supv/notes/*. Se muestra banner informativo al usuario.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { useToast } from '../../components/Toast'
import { Loader, EmptyState } from '../../components/Loader'
import AuthBanner from '../../components/AuthBanner'
import { getTeam } from './api'
import {
  listNotes,
  createNote,
  deleteNote,
  isStubMode,
} from './notasService'

export default function ScreenNotasCliente() {
  const { session } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [team, setTeam] = useState([])
  const [subjectType, setSubjectType] = useState('vendor') // 'vendor' | 'customer'
  const [selectedId, setSelectedId] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    async function loadTeam() {
      try {
        const t = await getTeam()
        setTeam(Array.isArray(t) ? t : [])
      } catch { /* noop */ }
    }
    loadTeam()
  }, [])

  useEffect(() => {
    if (!selectedId) { setNotes([]); return }
    loadNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, subjectType])

  async function loadNotes() {
    setLoading(true)
    try {
      const data = await listNotes({ subject_type: subjectType, subject_id: selectedId })
      setNotes(data || [])
    } catch (e) {
      toast.error('Error al cargar notas')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    const body = newNote.trim()
    if (body.length < 5) {
      toast.error('La nota debe tener al menos 5 caracteres')
      return
    }
    setSubmitting(true)
    try {
      await createNote({
        subject_type: subjectType,
        subject_id: Number(selectedId),
        subject_name: selectedName,
        body,
        author_id: session?.employee_id || null,
        author_name: session?.name || '',
      })
      toast.success('Nota agregada')
      setNewNote('')
      await loadNotes()
    } catch (e) {
      toast.error(e.message || 'Error al crear nota')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(noteId) {
    if (!confirm('¿Eliminar esta nota?')) return
    try {
      await deleteNote(noteId)
      toast.success('Nota eliminada')
      await loadNotes()
    } catch (e) { toast.error('Error al eliminar') }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text, fontSize: 13, outline: 'none',
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
      `}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/equipo')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft, flex: 1 }}>Notas de coaching</span>
        </div>

        {/* Stub banner */}
        {isStubMode() && (
          <div style={{ marginBottom: 14 }}>
            <AuthBanner
              level="info"
              title="Módulo en modo temporal"
              reason="Las notas se almacenan en este dispositivo mientras se despliega el backend."
              details="No se sincronizan entre dispositivos. Pronto se migrarán automáticamente."
            />
          </div>
        )}

        {/* Subject type toggle */}
        <div style={{
          display: 'inline-flex', gap: 4, padding: 4, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
          marginBottom: 12,
        }}>
          {[
            { id: 'vendor', label: 'Por vendedor' },
            { id: 'customer', label: 'Por cliente' },
          ].map(t => {
            const active = subjectType === t.id
            return (
              <button
                key={t.id}
                onClick={() => {
                  setSubjectType(t.id)
                  setSelectedId(''); setSelectedName(''); setNotes([])
                }}
                style={{
                  padding: '8px 16px', borderRadius: TOKENS.radius.sm,
                  background: active ? `${TOKENS.colors.blue2}22` : 'transparent',
                  border: `1px solid ${active ? TOKENS.colors.blue2 : 'transparent'}`,
                  fontSize: 12, fontWeight: 700,
                  color: active ? TOKENS.colors.text : TOKENS.colors.textMuted,
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Subject selector */}
        {subjectType === 'vendor' ? (
          <select
            value={selectedId}
            onChange={e => {
              const id = e.target.value
              const v = team.find(x => String(x.id) === id)
              setSelectedId(id)
              setSelectedName(v?.name || '')
            }}
            style={{ ...inputStyle, marginBottom: 12 }}
          >
            <option value="">Selecciona un vendedor…</option>
            {team.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              type="number"
              placeholder="ID del cliente (res.partner.id)"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              onBlur={e => setSelectedName(e.target.value ? `Cliente #${e.target.value}` : '')}
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <p style={{ fontSize: 11, color: TOKENS.colors.textLow, margin: '0 0 12px' }}>
              Busca al cliente en el CRM y copia su ID. Pronto se integrará un buscador.
            </p>
          </>
        )}

        {/* Add note */}
        {selectedId && (
          <div style={{
            padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 12,
            background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: TOKENS.colors.textLow, margin: '0 0 8px' }}>
              NUEVA NOTA SOBRE {selectedName.toUpperCase() || '—'}
            </p>
            <textarea
              rows={3}
              placeholder="Escribe una nota de coaching, observación, siguiente paso…"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }}
              maxLength={1000}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: TOKENS.colors.textLow }}>
                {newNote.length}/1000
              </span>
              <button
                onClick={handleAdd}
                disabled={submitting || newNote.trim().length < 5}
                style={{
                  padding: '8px 18px', borderRadius: TOKENS.radius.md,
                  background: newNote.trim().length >= 5
                    ? `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`
                    : TOKENS.colors.surface,
                  color: 'white', fontSize: 12, fontWeight: 700,
                  opacity: (submitting || newNote.trim().length < 5) ? 0.5 : 1,
                  cursor: (submitting || newNote.trim().length < 5) ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Guardando…' : 'Guardar nota'}
              </button>
            </div>
          </div>
        )}

        {/* Lista de notas */}
        {!selectedId ? (
          <EmptyState
            icon="✎"
            title="Selecciona un sujeto"
            subtitle={subjectType === 'vendor' ? 'Elige un vendedor para ver sus notas' : 'Ingresa un cliente para ver sus notas'}
          />
        ) : loading ? (
          <Loader label="Cargando notas…" />
        ) : notes.length === 0 ? (
          <EmptyState icon="📝" title="Sin notas" subtitle="Agrega la primera nota arriba" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.map(n => (
              <NoteCard key={n.id} note={n} typo={typo} onDelete={() => handleDelete(n.id)} />
            ))}
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

function NoteCard({ note, typo, onDelete }) {
  const date = note.created_at ? new Date(note.created_at).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : ''
  return (
    <div style={{
      padding: 12, borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0 }}>
          {note.author_name || 'Autor desconocido'} · {date}
        </p>
        <button
          onClick={onDelete}
          title="Eliminar"
          style={{ color: TOKENS.colors.textLow, fontSize: 14, padding: 0, cursor: 'pointer' }}
        >×</button>
      </div>
      <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {note.body}
      </p>
    </div>
  )
}
