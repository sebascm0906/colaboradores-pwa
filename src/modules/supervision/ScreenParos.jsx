import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift, getDowntimes, getDowntimeCategories, createDowntime, closeDowntime } from './api'
import { resolveSupervisionWarehouseId } from './shiftContext'
import { loadMachines } from '../shared/machineService'
import { loadLines } from '../shared/lineService'
import { logScreenError } from '../shared/logScreenError'
import VoiceInputButton from '../shared/voice/VoiceInputButton'
import { sendVoiceFeedback } from '../shared/voice/voiceFeedback'

// Fallback estatico de lineas si el endpoint no responde.
// Eliminar cuando /api/production/lines sea estable.
const FALLBACK_LINES = [
  { id: 1, name: 'Iguala - Barras', type: '', plant: null },
  { id: 2, name: 'Iguala - Rolito', type: '', plant: null },
]

const INITIAL_FORM = {
  category_id: '',
  line_id: '',
  machine_id: '',
  responsible: '',
  reason: '',
  comment: '',
}

export default function ScreenParos() {
  const { session } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const backTo = location.state?.backTo || '/supervision'
  const supervisionWarehouseId = resolveSupervisionWarehouseId(session)
  const [shift, setShift] = useState(null)
  const [downtimes, setDowntimes] = useState([])
  const [categories, setCategories] = useState([])
  const [machines, setMachines] = useState([])
  const [lines, setLines] = useState(FALLBACK_LINES)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState(() => ({
    ...INITIAL_FORM,
    responsible: session?.employee_name || session?.name || '',
  }))
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)
  // Voice context (PoC supervisor piloto 2): ultimo envelope W120 para feedback a W122.
  const [voiceContext, setVoiceContext] = useState(null) // {trace_id, ai_output} | null
  const [voiceNote, setVoiceNote] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift(supervisionWarehouseId)
      setShift(s)
      if (s?.id) {
        const [d, cats, machs, lns] = await Promise.all([
          getDowntimes(s.id).catch((e) => { logScreenError('ScreenParos', 'getDowntimes', e); return [] }),
          getDowntimeCategories().catch((e) => { logScreenError('ScreenParos', 'getDowntimeCategories', e); return [] }),
          loadMachines(),
          loadLines(),
        ])
        setDowntimes(d || [])
        setCategories(cats || [])
        if (Array.isArray(machs) && machs.length > 0) setMachines(machs)
        if (Array.isArray(lns) && lns.length > 0) setLines(lns)
      }
    } catch (e) { logScreenError('ScreenParos', 'loadData', e) }
    finally { setLoading(false) }
  }

  async function handleClose(id) {
    setProcessing(id)
    try {
      await closeDowntime(id)
      setMsg({ type: 'success', text: 'Paro cerrado correctamente' })
      await loadData()
    } catch (e) { setMsg({ type: 'error', text: e.message || 'Error al cerrar paro' }) }
    finally { setProcessing(null) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!formData.category_id || !formData.line_id) return
    // Motivo obligatorio (min 5 caracteres)
    if (!formData.reason || formData.reason.trim().length < 5) {
      setMsg({ type: 'error', text: 'Motivo obligatorio (minimo 5 caracteres)' })
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        shift_id: shift.id,
        category_id: Number(formData.category_id),
        line_id: Number(formData.line_id),
        reason: formData.reason.trim(),
      }
      // Fase 4: responsible_id y comment ya existen en gf.production.downtime
      if (formData.machine_id) payload.machine_id = Number(formData.machine_id)
      if (formData.responsible) payload.responsible = formData.responsible.trim()
      if (formData.comment) payload.comment = formData.comment.trim()

      await createDowntime(payload)

      // Voice feedback fire-and-forget: diff AI vs humano -> W122.
      if (voiceContext?.trace_id) {
        sendVoiceFeedback({
          trace_id: voiceContext.trace_id,
          ai_output: voiceContext.ai_output || {},
          final_output: {
            category_id: payload.category_id,
            machine_id: payload.machine_id || null,
            reason: payload.reason,
            comment: payload.comment || '',
          },
          metadata: {
            context_id: 'form_supervisor_paro',
            plaza_id: session?.plaza_id || null,
            user_id: session?.employee_id || null,
          },
        })
      }

      setMsg({ type: 'success', text: 'Paro registrado' })
      setShowForm(false)
      setFormData({
        ...INITIAL_FORM,
        responsible: session?.employee_name || session?.name || '',
      })
      setVoiceContext(null)
      setVoiceNote('')
      await loadData()
    } catch (e) { setMsg({ type: 'error', text: e.message || 'Error al crear paro' }) }
    finally { setSubmitting(false) }
  }

  // Metadata enviada a W120 (context_id=form_supervisor_paro).
  // Categorias son pocas y estables. Machines puede tener muchas — topamos a 40.
  const voiceMetadata = useMemo(() => ({
    plaza_id: session?.plaza_id || null,
    user_id: session?.employee_id || null,
    canal: 'pwa_colaboradores',
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    machines: machines.slice(0, 40).map((m) => ({ id: m.id, name: m.name, type: m.type || '' })),
  }), [session?.plaza_id, session?.employee_id, categories, machines])

  function handleVoiceResult(envelope) {
    const d = envelope?.data || {}
    setMsg(null)

    // category_id: si el LLM devuelve un id valido contra el catalogo, lo hidrata.
    if (d.category_id != null) {
      const cid = Number(d.category_id)
      if (categories.some((c) => Number(c.id) === cid)) {
        setFormData((prev) => ({ ...prev, category_id: String(cid) }))
      }
    }

    // machine_id (opcional)
    if (d.machine_id != null) {
      const mid = Number(d.machine_id)
      if (machines.some((m) => Number(m.id) === mid)) {
        setFormData((prev) => ({ ...prev, machine_id: String(mid) }))
      }
    }

    // reason: texto corto
    if (typeof d.reason === 'string' && d.reason.trim()) {
      setFormData((prev) => ({ ...prev, reason: d.reason.trim() }))
    }

    // comment: texto libre
    if (typeof d.comment === 'string' && d.comment.trim()) {
      setFormData((prev) => ({ ...prev, comment: d.comment.trim() }))
    }

    setVoiceContext({ trace_id: envelope.trace_id, ai_output: d })

    const confidence = envelope?.meta?.stt_confidence
    const transcript = envelope?.meta?.transcript
    const confirmationText = envelope?.meta?.confirmation_text
    const bits = []
    if (confirmationText) bits.push(confirmationText)
    else if (transcript) bits.push(`"${transcript}"`)
    if (typeof confidence === 'number') bits.push(`confianza ${(confidence * 100).toFixed(0)}%`)
    if (d.category_id != null && !categories.some((c) => Number(c.id) === Number(d.category_id))) {
      bits.push(`categoria "${d.category_name || d.category_id}" sin match — selecciona manual`)
    }
    if (d.machine_id != null && !machines.some((m) => Number(m.id) === Number(d.machine_id))) {
      bits.push(`maquina "${d.machine_name || d.machine_id}" sin match — selecciona manual`)
    }
    if (d.category_id == null && typeof d.category_name === 'string' && d.category_name.trim()) {
      bits.push(`IA propone categoria "${d.category_name}" — selecciona manual`)
    }
    if (d.machine_id == null && typeof d.machine_name === 'string' && d.machine_name.trim()) {
      bits.push(`IA propone maquina "${d.machine_name}" — selecciona manual`)
    }
    setVoiceNote(bits.length ? `IA: ${bits.join(' · ')}` : 'IA proceso la voz — revisa y confirma')
  }

  function handleVoiceError(error_code, err_msg) {
    setMsg({ type: 'error', text: `${error_code}: ${err_msg}` })
    setVoiceNote('')
  }

  useEffect(() => {
    if (msg) {
      const duration = msg.type === 'error' ? 6000 : 3500
      const t = setTimeout(() => setMsg(null), duration)
      return () => clearTimeout(t)
    }
  }, [msg])

  // Tick cada 30s para refrescar el "tiempo transcurrido" de paros activos
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const openDt = downtimes.filter(d => d.state === 'open')
  const closedDt = downtimes.filter(d => d.state !== 'open')

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate(backTo)} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Paros de Linea</span>
          </div>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{openDt.length} activos</span>
        </div>

        {/* Msg */}
        {msg && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: TOKENS.radius.md,
            background: msg.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <span style={{ ...typo.caption, color: msg.type === 'success' ? TOKENS.colors.success : TOKENS.colors.error }}>{msg.text}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !shift ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.warning }}>Sin turno activo</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un turno para poder registrar paros.</p>
            <button onClick={() => navigate('/supervision/turno')} style={{
              marginTop: 14, padding: '10px 20px', borderRadius: TOKENS.radius.sm,
              background: 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
              color: 'white', fontSize: 13, fontWeight: 600,
            }}>Ir a Control de Turno</button>
          </div>
        ) : (
          <>
            {/* Nuevo paro */}
            {!showForm ? (
              <button onClick={() => setShowForm(true)} style={{
                width: '100%', padding: '12px', borderRadius: TOKENS.radius.md, marginBottom: 16,
                background: 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                color: 'white', fontSize: 14, fontWeight: 600,
              }}>
                + Nuevo Paro
              </button>
            ) : (
              <form onSubmit={handleCreate} style={{
                padding: 16, borderRadius: TOKENS.radius.xl, marginBottom: 16,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.borderBlue}`,
              }}>
                <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 12px' }}>Nuevo Paro</p>

                {/* Voice input (PoC form_supervisor_paro) — hidrata categoria, maquina, motivo y comentario */}
                <div style={{ marginBottom: 14 }}>
                  <VoiceInputButton
                    context_id="form_supervisor_paro"
                    label="Manten presionado para dictar el paro"
                    metadata={voiceMetadata}
                    disabled={submitting}
                    onResult={handleVoiceResult}
                    onError={handleVoiceError}
                  />
                  {voiceNote && (
                    <div style={{
                      marginTop: 8, padding: '8px 12px', borderRadius: TOKENS.radius.md,
                      background: TOKENS.colors.warningSoft, border: '1px solid rgba(245,158,11,0.25)',
                    }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0 }}>{voiceNote}</p>
                    </div>
                  )}
                </div>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Categoria</label>
                <select value={formData.category_id} onChange={e => setFormData(p => ({ ...p, category_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                  <option value="">Seleccionar...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Linea</label>
                <select value={formData.line_id} onChange={e => setFormData(p => ({ ...p, line_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                  <option value="">Seleccionar...</option>
                  {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Maquina (opcional)</label>
                <select value={formData.machine_id} onChange={e => setFormData(p => ({ ...p, machine_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                  <option value="">Sin especificar</option>
                  {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Responsable</label>
                <input type="text" value={formData.responsible}
                  onChange={e => setFormData(p => ({ ...p, responsible: e.target.value }))}
                  placeholder="Quien reporta"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }} />

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
                  Motivo <span style={{ color: TOKENS.colors.error }}>*</span>
                </label>
                <textarea value={formData.reason} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={3}
                  placeholder="Descripcion del paro..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }} />

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Comentario adicional (opcional)</label>
                <textarea value={formData.comment} onChange={e => setFormData(p => ({ ...p, comment: e.target.value }))} rows={2}
                  placeholder="Detalles, acciones tomadas..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 12 }} />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setShowForm(false); setFormData({ ...INITIAL_FORM, responsible: session?.employee_name || session?.name || '' }); setVoiceContext(null); setVoiceNote('') }}
                    style={{ flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600 }}>
                    Cancelar
                  </button>
                  {(() => {
                    const canSubmit = formData.category_id && formData.line_id && formData.reason.trim().length >= 5
                    return (
                      <button type="submit" disabled={submitting || !canSubmit}
                        style={{
                          flex: 2, padding: '10px', borderRadius: TOKENS.radius.sm, fontSize: 13, fontWeight: 600, color: 'white',
                          background: !canSubmit ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                          border: `1px solid ${!canSubmit ? TOKENS.colors.border : 'transparent'}`,
                          opacity: submitting ? 0.6 : 1,
                        }}>
                        {submitting ? 'Registrando...' : 'Registrar Paro'}
                      </button>
                    )
                  })()}
                </div>
              </form>
            )}

            {/* Lista paros abiertos */}
            {openDt.length > 0 && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8,
                }}>
                  <p style={{ ...typo.overline, color: TOKENS.colors.error, margin: 0, fontWeight: 800 }}>
                    PAROS ACTIVOS
                  </p>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: TOKENS.colors.error,
                    padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                  }}>{openDt.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {openDt.map(d => {
                    const elapsed = getElapsedMinutes(d, nowTick)
                    return (
                    <div key={d.id} style={{
                      padding: 14, borderRadius: TOKENS.radius.xl,
                      background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.35)',
                      boxShadow: TOKENS.shadow.soft,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{d.category || d.name || 'Paro'}</p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                            {d.line_name || ''}
                            {elapsed != null ? ` \u00B7 ${formatMinutes(elapsed)}` : (d.minutes ? ` \u00B7 ${d.minutes}min` : '')}
                          </p>
                        </div>
                        <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.error }}>ACTIVO</span>
                        </div>
                      </div>
                      {d.reason && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 10px' }}>{d.reason}</p>}
                      <button onClick={() => handleClose(d.id)} disabled={processing === d.id}
                        style={{
                          width: '100%', padding: '12px', borderRadius: TOKENS.radius.sm,
                          background: 'linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.28) 100%)',
                          border: '1px solid rgba(239,68,68,0.5)',
                          color: TOKENS.colors.error, fontSize: 14, fontWeight: 700,
                          opacity: processing === d.id ? 0.6 : 1,
                        }}>
                        {processing === d.id ? 'Cerrando...' : 'CERRAR PARO'}
                      </button>
                    </div>
                  )})}
                </div>
              </>
            )}

            {/* Lista paros cerrados */}
            {closedDt.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>PAROS CERRADOS</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {closedDt.map(d => (
                    <div key={d.id} style={{
                      padding: 14, borderRadius: TOKENS.radius.xl,
                      background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)',
                      boxShadow: TOKENS.shadow.soft,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{d.category || d.name || 'Paro'}</p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                            {d.line_name || ''} {d.minutes ? `\u00B7 ${d.minutes}min` : ''}
                          </p>
                        </div>
                        <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.success }}>CERRADO</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {downtimes.length === 0 && (
              <div style={{ marginTop: 20, padding: 24, borderRadius: TOKENS.radius.xl, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
                <p style={{ ...typo.title, color: TOKENS.colors.success }}>Sin paros</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>No hay paros registrados en este turno.</p>
              </div>
            )}
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

// ── Helpers UX ────────────────────────────────────────────────────────────
// Calcula minutos transcurridos desde que el paro esta abierto.
// Soporta varios campos posibles del backend (start_time, started_at, create_date).
function getElapsedMinutes(downtime, nowMs) {
  const raw = downtime?.start_time || downtime?.started_at || downtime?.create_date
  if (!raw) return null
  const t = new Date(raw).getTime()
  if (isNaN(t)) return null
  return Math.max(0, Math.floor((nowMs - t) / 60000))
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}min`
}
