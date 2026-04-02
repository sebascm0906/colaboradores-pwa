import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift, createShift, closeShift } from './api'

const SHIFT_CODES = [
  { value: 1, label: 'Dia' },
  { value: 2, label: 'Noche' },
]

export default function ScreenControlTurno() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)
  const [formData, setFormData] = useState({ shift_code: '', warehouse_id: 76 })
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift()
      setShift(s)
    } catch { setShift(null) }
    finally { setLoading(false) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!formData.shift_code) return
    setSubmitting(true)
    try {
      await createShift({ shift_code: Number(formData.shift_code), warehouse_id: Number(formData.warehouse_id) })
      setMsg({ type: 'success', text: 'Turno abierto correctamente' })
      setFormData({ shift_code: '', warehouse_id: 76 })
      await loadData()
    } catch (err) { setMsg({ type: 'error', text: err.message || 'Error al abrir turno' }) }
    finally { setSubmitting(false) }
  }

  async function handleClose() {
    setSubmitting(true)
    try {
      await closeShift(shift.id)
      setMsg({ type: 'success', text: 'Turno cerrado correctamente' })
      setConfirmClose(false)
      await loadData()
    } catch (err) { setMsg({ type: 'error', text: err.message || 'Error al cerrar turno' }) }
    finally { setSubmitting(false) }
  }

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t) } }, [msg])

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
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Control de Turno</span>
          </div>
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
        ) : shift ? (
          /* Turno activo */
          <div>
            <div style={{
              padding: 20, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>TURNO ACTIVO</p>
                  <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>{shift.name || `Turno ${shift.shift_code}`}</p>
                </div>
                <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.success }}>EN CURSO</span>
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16,
                padding: 12, borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <div>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Codigo</p>
                  <p style={{ ...typo.body, color: TOKENS.colors.blue2, fontWeight: 700, margin: 0 }}>{shift.shift_code === 1 ? 'Dia' : shift.shift_code === 2 ? 'Noche' : shift.shift_code}</p>
                </div>
                <div>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Fecha</p>
                  <p style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 700, margin: 0 }}>{shift.date || '—'}</p>
                </div>
                <div>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Almacen</p>
                  <p style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 700, margin: 0 }}>{shift.warehouse_name || `ID ${shift.warehouse_id || 76}`}</p>
                </div>
                <div>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Estado</p>
                  <p style={{ ...typo.body, color: TOKENS.colors.success, fontWeight: 700, margin: 0 }}>{shift.state || 'in_progress'}</p>
                </div>
              </div>

              {!confirmClose ? (
                <button onClick={() => setConfirmClose(true)} style={{
                  width: '100%', padding: '12px', borderRadius: TOKENS.radius.sm,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                  color: TOKENS.colors.error, fontSize: 14, fontWeight: 600,
                }}>
                  Cerrar Turno
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0, textAlign: 'center' }}>
                    Esta seguro de cerrar el turno? Esta accion no se puede deshacer.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setConfirmClose(false)}
                      style={{ flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600 }}>
                      Cancelar
                    </button>
                    <button onClick={handleClose} disabled={submitting}
                      style={{
                        flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm,
                        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                        color: TOKENS.colors.error, fontSize: 13, fontWeight: 600,
                        opacity: submitting ? 0.6 : 1,
                      }}>
                      {submitting ? 'Cerrando...' : 'Confirmar Cierre'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Sin turno - formulario abrir */
          <div style={{
            padding: 20, borderRadius: TOKENS.radius.xl,
            background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
          }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F3ED;</div>
              <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Sin turno activo</p>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un nuevo turno para comenzar a registrar.</p>
            </div>

            <form onSubmit={handleCreate}>
              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Turno</label>
              <select value={formData.shift_code} onChange={e => setFormData(p => ({ ...p, shift_code: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                <option value="">Seleccionar...</option>
                {SHIFT_CODES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Almacen de planta</label>
              <select value={formData.warehouse_id} onChange={e => setFormData(p => ({ ...p, warehouse_id: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 16 }}>
                <option value="76">Planta Iguala</option>
              </select>

              <button type="submit" disabled={submitting || !formData.shift_code}
                style={{
                  width: '100%', padding: '12px', borderRadius: TOKENS.radius.sm, fontSize: 14, fontWeight: 600, color: 'white',
                  background: !formData.shift_code ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                  border: `1px solid ${!formData.shift_code ? TOKENS.colors.border : 'transparent'}`,
                  opacity: submitting ? 0.6 : 1,
                }}>
                {submitting ? 'Abriendo...' : 'Abrir Turno'}
              </button>
            </form>
          </div>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
