import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMaintenanceRequests, createMaintenanceRequest } from './api'

const PRIORITIES = [
  { value: 0, label: 'Normal', color: TOKENS.colors.textMuted },
  { value: 1, label: 'Importante', color: TOKENS.colors.warning },
  { value: 2, label: 'Muy Importante', color: '#f97316' },
  { value: 3, label: 'Urgente', color: TOKENS.colors.error },
]

const TYPES = [
  { value: 'corrective', label: 'Correctivo' },
  { value: 'preventive', label: 'Preventivo' },
]

export default function ScreenMantenimiento() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ subject: '', type: '', priority: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const r = await getMaintenanceRequests()
      setRequests(r || [])
    } catch { setRequests([]) }
    finally { setLoading(false) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!formData.subject || !formData.type || formData.priority === '') return
    setSubmitting(true)
    try {
      await createMaintenanceRequest({
        subject: formData.subject,
        maintenance_type: formData.type,
        priority: Number(formData.priority),
        description: formData.description,
      })
      setMsg({ type: 'success', text: 'Solicitud creada' })
      setShowForm(false)
      setFormData({ subject: '', type: '', priority: '', description: '' })
      await loadData()
    } catch (err) { setMsg({ type: 'error', text: err.message || 'Error al crear solicitud' }) }
    finally { setSubmitting(false) }
  }

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t) } }, [msg])

  function getPriorityInfo(val) {
    return PRIORITIES.find(p => p.value === val) || PRIORITIES[0]
  }

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
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Mantenimiento</span>
          </div>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{requests.length} solicitudes</span>
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
        ) : (
          <>
            {/* Nueva solicitud */}
            {!showForm ? (
              <button onClick={() => setShowForm(true)} style={{
                width: '100%', padding: '12px', borderRadius: TOKENS.radius.md, marginBottom: 16,
                background: 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                color: 'white', fontSize: 14, fontWeight: 600,
              }}>
                + Nueva Solicitud
              </button>
            ) : (
              <form onSubmit={handleCreate} style={{
                padding: 16, borderRadius: TOKENS.radius.xl, marginBottom: 16,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.borderBlue}`,
              }}>
                <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 12px' }}>Nueva Solicitud</p>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Asunto</label>
                <input type="text" value={formData.subject} onChange={e => setFormData(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Describir brevemente..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10, outline: 'none' }} />

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Tipo</label>
                <select value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                  <option value="">Seleccionar...</option>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Prioridad</label>
                <select value={formData.priority} onChange={e => setFormData(p => ({ ...p, priority: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                  <option value="">Seleccionar...</option>
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Descripcion</label>
                <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={3}
                  placeholder="Detalles de la solicitud..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 12 }} />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setShowForm(false); setFormData({ subject: '', type: '', priority: '', description: '' }) }}
                    style={{ flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={submitting || !formData.subject || !formData.type || formData.priority === ''}
                    style={{
                      flex: 2, padding: '10px', borderRadius: TOKENS.radius.sm, fontSize: 13, fontWeight: 600, color: 'white',
                      background: (!formData.subject || !formData.type || formData.priority === '') ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                      border: `1px solid ${(!formData.subject || !formData.type || formData.priority === '') ? TOKENS.colors.border : 'transparent'}`,
                      opacity: submitting ? 0.6 : 1,
                    }}>
                    {submitting ? 'Creando...' : 'Crear Solicitud'}
                  </button>
                </div>
              </form>
            )}

            {/* Lista */}
            {requests.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {requests.map(r => {
                  const pri = getPriorityInfo(r.priority)
                  return (
                    <div key={r.id} style={{
                      padding: 14, borderRadius: TOKENS.radius.xl,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                      boxShadow: TOKENS.shadow.soft,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{r.subject || r.name || 'Solicitud'}</p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                            {r.maintenance_type === 'corrective' ? 'Correctivo' : r.maintenance_type === 'preventive' ? 'Preventivo' : r.maintenance_type || ''}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: `${pri.color}14`, border: `1px solid ${pri.color}30` }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: pri.color }}>{pri.label}</span>
                          </div>
                        </div>
                      </div>
                      {r.stage && (
                        <div style={{
                          display: 'inline-block', padding: '3px 8px', borderRadius: TOKENS.radius.sm,
                          background: 'rgba(255,255,255,0.04)', border: `1px solid ${TOKENS.colors.border}`,
                          marginTop: 4,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.colors.textMuted }}>{r.stage}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ marginTop: 20, padding: 24, borderRadius: TOKENS.radius.xl, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
                <p style={{ ...typo.title, color: TOKENS.colors.success }}>Sin solicitudes</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>No hay solicitudes de mantenimiento.</p>
              </div>
            )}
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
