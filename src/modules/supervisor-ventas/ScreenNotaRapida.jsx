// ─── ScreenNotaRapida — Piloto voz: captura pura sin sujeto ─────────────────
// Flujo: VoiceInputButton -> transcript en textarea editable -> Guardar ->
// persiste en gf.supv.note con subject_type='vendor' + subject_id=self (hack
// aprobado) -> se lista abajo. Cero catalogos, cero clasificacion.
//
// No toca /equipo/notas (ScreenNotasCliente) — es una ruta nueva dedicada
// al piloto. Cuando Sebastian agregue subject_type='quick' al enum, migramos.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { useToast } from '../../components/Toast'
import { ScreenShell, EmptyState } from '../entregas/components'
import VoiceInputButton from '../shared/voice/VoiceInputButton'
import { sendVoiceFeedback } from '../shared/voice/voiceFeedback'
import { api } from '../../lib/api'

const RECENT_LIMIT = 10

export default function ScreenNotaRapida() {
  const { session } = useSession()
  const toast = useToast()
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [transcript, setTranscript] = useState('')
  const [saving, setSaving] = useState(false)
  const [recent, setRecent] = useState([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  // trace_id del ultimo dictado; null = nota fue escrita manualmente
  const [voiceTraceId, setVoiceTraceId] = useState(null)

  const selfId = Number(session?.employee_id || 0)
  const companyId = Number(session?.company_id || 0)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const loadRecent = useCallback(async () => {
    if (!selfId) return
    setLoadingRecent(true)
    try {
      const qs = new URLSearchParams({
        subject_type: 'vendor',
        subject_id: String(selfId),
      })
      const res = await api('GET', `/pwa-supv/notes?${qs}`)
      const notes = res?.data?.notes || res?.notes || []
      // Orden desc por create_date; backend deberia ya venir ordenado, aseguramos.
      notes.sort((a, b) => String(b.create_date || '').localeCompare(String(a.create_date || '')))
      setRecent(notes.slice(0, RECENT_LIMIT))
    } catch (e) {
      if (e.message !== 'no_session') toast.error('No se pudieron cargar las notas recientes')
    } finally {
      setLoadingRecent(false)
    }
  }, [selfId, toast])

  useEffect(() => { loadRecent() }, [loadRecent])

  function handleVoiceResult(envelope) {
    // Piloto: ignoramos el parsing estructurado, solo tomamos el transcript.
    // El context_id 'form_brine_reading' es el mas neutro disponible.
    const text = envelope?.meta?.transcript || envelope?.data?.transcript || ''
    if (text && text.trim()) {
      setTranscript(prev => prev ? `${prev} ${text.trim()}` : text.trim())
    }
    if (envelope?.trace_id) setVoiceTraceId(envelope.trace_id)
  }

  function handleVoiceError(code, message, envelope) {
    // Caso VALIDATION_FAILED: el parser estructurado del context_id fallo
    // (esperado — form_brine_reading espera numeros, nosotros dictamos texto),
    // pero el STT si transcribio. Rescatamos el transcript para el textarea.
    const rescued = envelope?.meta?.transcript || envelope?.data?.transcript || ''
    if (rescued && rescued.trim()) {
      setTranscript(prev => prev ? `${prev} ${rescued.trim()}` : rescued.trim())
      if (envelope?.trace_id) setVoiceTraceId(envelope.trace_id)
      return
    }
    toast.error(message || 'No se pudo procesar el audio')
  }

  async function handleSave() {
    const body = transcript.trim()
    if (body.length < 3) return
    if (!selfId || !companyId) {
      toast.error('Sesion invalida, recarga la app')
      return
    }
    setSaving(true)
    const source = voiceTraceId ? 'voice' : 'manual'
    try {
      await api('POST', '/pwa-supv/notes/create', {
        body,
        // Hack aprobado: supervisor se autoasigna como sujeto hasta que
        // el modelo acepte subject_type='quick'. Vendor+self mantiene
        // integridad referencial sin romper el dominio actual.
        subject_type: 'vendor',
        subject_id: selfId,
        author_id: selfId,
      })

      // Instrumentacion piloto: un console log por nota + W122 si vino de voz.
      // Cero persistencia extra en Odoo, cero cambios de backend.
      console.log('[VOICE_NOTE]', JSON.stringify({
        timestamp: new Date().toISOString(),
        user_id: selfId,
        source,
        text_length: body.length,
      }))
      if (voiceTraceId) {
        sendVoiceFeedback({
          trace_id: voiceTraceId,
          ai_output: {},
          final_output: { body },
          metadata: {
            context_id: 'quick_note',
            user_id: selfId,
            plaza_id: session?.plaza_id || null,
          },
        })
      }

      toast.success('Nota guardada')
      setTranscript('')
      setVoiceTraceId(null)
      await loadRecent()
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar la nota')
    } finally {
      setSaving(false)
    }
  }

  function handleRegrabar() {
    setTranscript('')
    setVoiceTraceId(null)
  }

  const canSubmit = transcript.trim().length >= 3 && !saving

  return (
    <ScreenShell title="Nota rapida" backTo="/equipo">

      {/* Voice input */}
      <div style={{ marginTop: 6 }}>
        <VoiceInputButton
          context_id="form_brine_reading"
          label="Manten presionado para dictar (max ~10 segundos)"
          metadata={{
            user_id: selfId || null,
            plaza_id: session?.plaza_id || null,
            canal: 'pwa_colaboradores',
          }}
          disabled={saving}
          onResult={handleVoiceResult}
          onError={handleVoiceError}
        />
      </div>

      {/* Textarea editable */}
      <div style={{ marginTop: 14 }}>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          maxLength={1000}
          placeholder="Lo que dictes aparece aqui. Puedes editarlo antes de guardar."
          rows={4}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface,
            border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.text,
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ ...typo.caption, color: TOKENS.colors.textLow }}>
            {transcript.length}/1000
          </span>
        </div>
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button
          onClick={handleRegrabar}
          disabled={saving || !transcript}
          style={{
            flex: 1,
            padding: '12px 0',
            borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface,
            border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.textMuted,
            fontSize: 14,
            fontWeight: 600,
            opacity: (saving || !transcript) ? 0.5 : 1,
            cursor: (saving || !transcript) ? 'not-allowed' : 'pointer',
          }}
        >
          Regrabar
        </button>
        <button
          onClick={handleSave}
          disabled={!canSubmit}
          style={{
            flex: 2,
            padding: '12px 0',
            borderRadius: TOKENS.radius.md,
            background: canSubmit
              ? `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`
              : TOKENS.colors.surface,
            border: canSubmit ? 'none' : `1px solid ${TOKENS.colors.border}`,
            color: '#FFFFFF',
            fontSize: 14,
            fontWeight: 700,
            opacity: saving ? 0.7 : 1,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      {/* Notas recientes */}
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 28, marginBottom: 10 }}>
        NOTAS RECIENTES
      </p>

      {loadingRecent ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{
            width: 24, height: 24,
            border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`,
            borderRadius: '50%',
            animation: 'entregasShellSpin 0.8s linear infinite',
          }} />
        </div>
      ) : recent.length === 0 ? (
        <EmptyState
          icon="🎤"
          title="Sin notas aun"
          subtitle="Dicta tu primera nota arriba. Apareceran aqui."
          typo={typo}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recent.map((n) => (
            <NoteCard key={n.note_id || n.id} note={n} typo={typo} />
          ))}
        </div>
      )}

      <div style={{ height: 24 }} />
    </ScreenShell>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function NoteCard({ note, typo }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surface,
      border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {note.body || ''}
      </p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '6px 0 0' }}>
        {formatRelativeTime(note.create_date)}
      </p>
    </div>
  )
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function formatRelativeTime(isoOrOdoo) {
  if (!isoOrOdoo) return ''
  try {
    // Odoo format: "2026-04-23 22:40:41" (UTC, sin Z)
    const raw = String(isoOrOdoo).replace(' ', 'T')
    const asUtc = raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`
    const t = new Date(asUtc).getTime()
    if (isNaN(t)) return ''
    const diffMin = Math.floor((Date.now() - t) / 60000)
    if (diffMin < 1) return 'hace segundos'
    if (diffMin < 60) return `hace ${diffMin} min`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `hace ${diffHr} h`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 7) return `hace ${diffDay} d`
    return new Date(asUtc).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  } catch {
    return ''
  }
}
