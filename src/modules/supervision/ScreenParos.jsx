import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift, getDowntimes, getDowntimeCategories, createDowntime, closeDowntime } from './api'
import { logScreenError } from '../shared/logScreenError'

const LINES = [
  { id: 1, name: 'Iguala - Barras' },
  { id: 2, name: 'Iguala - Rolito' },
]

export default function ScreenParos() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [shift, setShift] = useState(null)
  const [downtimes, setDowntimes] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ category_id: '', line_id: '', reason: '' })
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift()
      setShift(s)
      if (s?.id) {
        const [d, cats] = await Promise.all([
          getDowntimes(s.id).catch((e) => { logScreenError('ScreenParos', 'getDowntimes', e); return [] }),
          getDowntimeCategories().catch((e) => { logScreenError('ScreenParos', 'getDowntimeCategories', e); return [] }),
        ])
        setDowntimes(d || [])
        setCategories(cats || [])
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
    setSubmitting(true)
    try {
      await createDowntime({ shift_id: shift.id, category_id: Number(formData.category_id), line_id: Number(formData.line_id), reason: formData.reason })
      setMsg({ type: 'success', text: 'Paro registrado' })
      setShowForm(false)
      setFormData({ category_id: '', line_id: '', reason: '' })
      await loadData()
    } catch (e) { setMsg({ type: 'error', text: e.message || 'Error al crear paro' }) }
    finally { setSubmitting(false) }
  }

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t) } }, [msg])

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
          <button onClick={() => navigate('/supervision')} style={{
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
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un turno primero desde Control de Turno.</p>
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
                  {LINES.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Motivo</label>
                <textarea value={formData.reason} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={3}
                  placeholder="Descripcion del paro..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 12 }} />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setShowForm(false); setFormData({ category_id: '', line_id: '', reason: '' }) }}
                    style={{ flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={submitting || !formData.category_id || !formData.line_id}
                    style={{
                      flex: 2, padding: '10px', borderRadius: TOKENS.radius.sm, fontSize: 13, fontWeight: 600, color: 'white',
                      background: (!formData.category_id || !formData.line_id) ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                      border: `1px solid ${(!formData.category_id || !formData.line_id) ? TOKENS.colors.border : 'transparent'}`,
                      opacity: submitting ? 0.6 : 1,
                    }}>
                    {submitting ? 'Registrando...' : 'Registrar Paro'}
                  </button>
                </div>
              </form>
            )}

            {/* Lista paros abiertos */}
            {openDt.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>PAROS ACTIVOS</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {openDt.map(d => (
                    <div key={d.id} style={{
                      padding: 14, borderRadius: TOKENS.radius.xl,
                      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                      boxShadow: TOKENS.shadow.soft,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{d.category || d.name || 'Paro'}</p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                            {d.line_name || ''} {d.minutes ? `\u00B7 ${d.minutes}min` : ''}
                          </p>
                        </div>
                        <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.error }}>ACTIVO</span>
                        </div>
                      </div>
                      {d.reason && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 10px' }}>{d.reason}</p>}
                      <button onClick={() => handleClose(d.id)} disabled={processing === d.id}
                        style={{
                          width: '100%', padding: '10px', borderRadius: TOKENS.radius.sm,
                          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                          color: TOKENS.colors.error, fontSize: 13, fontWeight: 600,
                          opacity: processing === d.id ? 0.6 : 1,
                        }}>
                        {processing === d.id ? 'Cerrando...' : 'Cerrar Paro'}
                      </button>
                    </div>
                  ))}
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
