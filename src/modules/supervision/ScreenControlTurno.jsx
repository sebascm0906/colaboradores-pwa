import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift, createShift } from './api'
import { loadShiftReadiness } from '../shared/shiftReadiness'
import { closeShiftServerSide } from '../shared/supervisorAuth'
import {
  loadIncidents, registerIncident, markIncidentResolved,
  INCIDENT_TYPES, INCIDENT_SEVERITIES, INCIDENT_STATES,
  getOpenIncidents, getIncidentTypeLabel,
} from '../shared/incidentService'

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
  const [closeReadiness, setCloseReadiness] = useState(null)
  const [loadingReadiness, setLoadingReadiness] = useState(false)
  // Incidentes
  const [incidents, setIncidents] = useState([])
  const [showIncidentForm, setShowIncidentForm] = useState(false)
  const [incidentForm, setIncidentForm] = useState({ name: '', description: '', incident_type: 'production', severity: 'low' })
  const [incidentSubmitting, setIncidentSubmitting] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift()
      setShift(s)
      if (s?.id) {
        loadIncidents(s.id).then(setIncidents)
      }
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

  async function loadCloseReadiness() {
    if (!shift?.id) return null
    setLoadingReadiness(true)
    try {
      const { readiness } = await loadShiftReadiness(shift.id)
      setCloseReadiness(readiness)
      return readiness
    } catch (e) {
      const err = { canClose: false, blockers: ['Error consultando estado de cierre'], warnings: [] }
      setCloseReadiness(err)
      return err
    } finally {
      setLoadingReadiness(false)
    }
  }

  async function handleRequestClose() {
    setConfirmClose(true)
    await loadCloseReadiness()
  }

  async function handleClose() {
    // Re-validar en backend antes de cerrar
    const readiness = await loadCloseReadiness()
    if (readiness && !readiness.canClose) {
      setMsg({ type: 'error', text: readiness.blockers?.[0] || 'No se puede cerrar: hay bloqueos pendientes' })
      return
    }
    setSubmitting(true)
    try {
      const result = await closeShiftServerSide({ shift_id: shift.id })
      if (!result.ok) {
        throw new Error(result.error || 'Error cerrando turno')
      }
      setMsg({ type: 'success', text: 'Turno cerrado correctamente' })
      setConfirmClose(false)
      setCloseReadiness(null)
      await loadData()
    } catch (err) { setMsg({ type: 'error', text: err.message || 'Error al cerrar turno' }) }
    finally { setSubmitting(false) }
  }

  const openIncidents = useMemo(() => getOpenIncidents(incidents), [incidents])

  async function handleCreateIncident() {
    if (!incidentForm.name.trim() || !shift?.id) return
    setIncidentSubmitting(true)
    try {
      const res = await registerIncident({ shift_id: shift.id, ...incidentForm })
      if (res.ok) {
        setMsg({ type: 'success', text: 'Incidencia registrada' })
        setShowIncidentForm(false)
        setIncidentForm({ name: '', description: '', incident_type: 'production', severity: 'low' })
        loadIncidents(shift.id).then(setIncidents)
      } else {
        setMsg({ type: 'error', text: res.error || 'Error al registrar' })
      }
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setIncidentSubmitting(false) }
  }

  async function handleResolveIncident(id) {
    setIncidentSubmitting(true)
    try {
      const res = await markIncidentResolved(id)
      if (res.ok) {
        setMsg({ type: 'success', text: 'Incidencia resuelta' })
        loadIncidents(shift.id).then(setIncidents)
      } else {
        setMsg({ type: 'error', text: res.error })
      }
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setIncidentSubmitting(false) }
  }

  useEffect(() => {
    if (msg) {
      const duration = msg.type === 'error' ? 6000 : 3500
      const t = setTimeout(() => setMsg(null), duration)
      return () => clearTimeout(t)
    }
  }, [msg])

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
                {(() => {
                  const isInProgress = shift.state === 'in_progress'
                  const isDraft = shift.state === 'draft'
                  const label = isInProgress ? 'EN CURSO' : isDraft ? 'BORRADOR' : (shift.state || '').toUpperCase() || 'CERRADO'
                  const color = isInProgress ? TOKENS.colors.success : isDraft ? TOKENS.colors.warning : TOKENS.colors.textMuted
                  const bg = isInProgress ? 'rgba(34,197,94,0.12)' : isDraft ? 'rgba(245,158,11,0.12)' : 'rgba(148,163,184,0.12)'
                  const br = isInProgress ? 'rgba(34,197,94,0.25)' : isDraft ? 'rgba(245,158,11,0.3)' : 'rgba(148,163,184,0.3)'
                  return (
                    <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: bg, border: `1px solid ${br}` }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
                    </div>
                  )
                })()}
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
                  <p style={{ ...typo.body, color: TOKENS.colors.success, fontWeight: 700, margin: 0 }}>
                    {{ draft: 'Borrador', in_progress: 'En curso', closed: 'Cerrado', cancelled: 'Cancelado' }[shift.state] || shift.state || '—'}
                  </p>
                </div>
              </div>

              {!confirmClose ? (
                <button onClick={handleRequestClose} style={{
                  width: '100%', padding: '12px', borderRadius: TOKENS.radius.sm,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                  color: TOKENS.colors.error, fontSize: 14, fontWeight: 600,
                }}>
                  Cerrar Turno
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Estado de readiness */}
                  {loadingReadiness ? (
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, textAlign: 'center' }}>
                      Verificando condiciones de cierre...
                    </p>
                  ) : closeReadiness ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Bloqueos */}
                      {closeReadiness.blockers.length > 0 && (
                        <div style={{
                          padding: 10, borderRadius: TOKENS.radius.md,
                          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                        }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0, marginBottom: 6, fontWeight: 700 }}>
                            BLOQUEOS ({closeReadiness.blockers.length})
                          </p>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {closeReadiness.blockers.map((b, i) => (
                              <li key={i} style={{ ...typo.caption, color: TOKENS.colors.error, marginBottom: 2 }}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {/* Warnings */}
                      {closeReadiness.warnings.length > 0 && (
                        <div style={{
                          padding: 10, borderRadius: TOKENS.radius.md,
                          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                        }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0, marginBottom: 6, fontWeight: 700 }}>
                            ADVERTENCIAS ({closeReadiness.warnings.length})
                          </p>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {closeReadiness.warnings.map((w, i) => (
                              <li key={i} style={{ ...typo.caption, color: TOKENS.colors.warning, marginBottom: 2 }}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {closeReadiness.canClose && (
                        <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: 0, textAlign: 'center', fontWeight: 700 }}>
                          ✓ Todas las condiciones cumplidas — puede cerrar
                        </p>
                      )}
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setConfirmClose(false); setCloseReadiness(null) }}
                      style={{ flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600 }}>
                      Cancelar
                    </button>
                    <button
                      onClick={handleClose}
                      disabled={submitting || loadingReadiness || !closeReadiness || !closeReadiness.canClose}
                      style={{
                        flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm,
                        background: (closeReadiness && closeReadiness.canClose)
                          ? 'rgba(239,68,68,0.15)' : TOKENS.colors.surface,
                        border: `1px solid ${(closeReadiness && closeReadiness.canClose) ? 'rgba(239,68,68,0.3)' : TOKENS.colors.border}`,
                        color: (closeReadiness && closeReadiness.canClose) ? TOKENS.colors.error : TOKENS.colors.textLow,
                        fontSize: 13, fontWeight: 600,
                        opacity: submitting ? 0.6 : 1,
                      }}>
                      {submitting ? 'Cerrando...' : 'Confirmar Cierre'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Incidentes del turno ─────────────────────────────────── */}
            <div style={{
              marginTop: 12, padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>
                  INCIDENCIAS DEL TURNO
                  {openIncidents.length > 0 && (
                    <span style={{ marginLeft: 6, color: TOKENS.colors.error, fontWeight: 700 }}>
                      ({openIncidents.length} abierta{openIncidents.length > 1 ? 's' : ''})
                    </span>
                  )}
                </p>
                <button onClick={() => setShowIncidentForm(f => !f)} style={{
                  padding: '4px 10px', borderRadius: TOKENS.radius.pill, fontSize: 11, fontWeight: 600,
                  background: showIncidentForm ? 'rgba(148,163,184,0.12)' : 'rgba(43,143,224,0.12)',
                  border: `1px solid ${showIncidentForm ? 'rgba(148,163,184,0.3)' : 'rgba(43,143,224,0.3)'}`,
                  color: showIncidentForm ? TOKENS.colors.textMuted : TOKENS.colors.blue2,
                }}>
                  {showIncidentForm ? 'Cancelar' : '+ Registrar'}
                </button>
              </div>

              {/* Formulario crear incidencia */}
              {showIncidentForm && (
                <div style={{
                  padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 10,
                  background: 'rgba(43,143,224,0.06)', border: '1px solid rgba(43,143,224,0.2)',
                }}>
                  <input type="text" placeholder="Titulo breve de la incidencia"
                    value={incidentForm.name}
                    onChange={e => setIncidentForm(p => ({ ...p, name: e.target.value }))}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: TOKENS.radius.sm, marginBottom: 8,
                      background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                      color: 'white', fontSize: 13, fontFamily: 'inherit',
                    }} />
                  <textarea placeholder="Descripcion (opcional)"
                    value={incidentForm.description} rows={2}
                    onChange={e => setIncidentForm(p => ({ ...p, description: e.target.value }))}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: TOKENS.radius.sm, marginBottom: 8,
                      background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                      color: 'white', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
                    }} />
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <select value={incidentForm.incident_type}
                      onChange={e => setIncidentForm(p => ({ ...p, incident_type: e.target.value }))}
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                        color: 'white', fontSize: 12, fontFamily: 'inherit',
                      }}>
                      {INCIDENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <select value={incidentForm.severity}
                      onChange={e => setIncidentForm(p => ({ ...p, severity: e.target.value }))}
                      style={{
                        flex: 1, padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                        color: 'white', fontSize: 12, fontFamily: 'inherit',
                      }}>
                      {INCIDENT_SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <button onClick={handleCreateIncident}
                    disabled={incidentSubmitting || !incidentForm.name.trim()}
                    style={{
                      width: '100%', padding: '8px', borderRadius: TOKENS.radius.sm, fontSize: 13, fontWeight: 600,
                      background: !incidentForm.name.trim() ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                      border: `1px solid ${!incidentForm.name.trim() ? TOKENS.colors.border : 'transparent'}`,
                      color: 'white', opacity: incidentSubmitting ? 0.6 : 1,
                    }}>
                    {incidentSubmitting ? 'Registrando...' : 'Registrar incidencia'}
                  </button>
                </div>
              )}

              {/* Lista de incidencias */}
              {incidents.length === 0 ? (
                <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0, textAlign: 'center', padding: '8px 0' }}>
                  Sin incidencias registradas
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {incidents.map(inc => {
                    const stateInfo = INCIDENT_STATES[inc.state] || INCIDENT_STATES.open
                    const sevInfo = INCIDENT_SEVERITIES.find(s => s.value === inc.severity) || INCIDENT_SEVERITIES[0]
                    return (
                      <div key={inc.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                        background: stateInfo.bg, border: `1px solid ${stateInfo.color}33`,
                      }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: sevInfo.color,
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>
                            {inc.name}
                          </p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 11 }}>
                            {getIncidentTypeLabel(inc.incident_type)} &middot; {stateInfo.label}
                          </p>
                        </div>
                        {inc.state === 'open' && (
                          <button onClick={() => handleResolveIncident(inc.id)}
                            disabled={incidentSubmitting}
                            style={{
                              padding: '4px 8px', borderRadius: TOKENS.radius.sm, fontSize: 11, fontWeight: 600,
                              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
                              color: TOKENS.colors.success, flexShrink: 0,
                            }}>
                            Resolver
                          </button>
                        )}
                      </div>
                    )
                  })}
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

              {/* Planta auto-asignada (solo Iguala) */}
              <div style={{
                padding: '10px 12px', borderRadius: TOKENS.radius.sm, marginBottom: 16,
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${TOKENS.colors.border}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Planta</span>
                <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600 }}>Planta Iguala</span>
              </div>

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
