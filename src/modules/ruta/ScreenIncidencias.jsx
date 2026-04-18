import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { createIncident, getMyIncidents } from './api'
import { logScreenError } from '../shared/logScreenError'

const INCIDENT_TYPES = [
  { key: 'operacion', label: 'Operación' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'cobranza', label: 'Cobranza' },
  { key: 'vehiculo', label: 'Vehículo' },
]

const SEVERITIES = [
  { key: 'baja', label: 'Baja', color: TOKENS.colors.success },
  { key: 'media', label: 'Media', color: TOKENS.colors.warning },
  { key: 'alta', label: 'Alta', color: TOKENS.colors.error },
]

export default function ScreenIncidencias() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [incidents, setIncidents] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [incidentType, setIncidentType] = useState('')
  const [severity, setSeverity] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { loadIncidents() }, [])

  async function loadIncidents() {
    setLoading(true)
    try {
      const data = await getMyIncidents(session?.employee_id).catch((e) => {
        logScreenError('ScreenIncidencias', 'getMyIncidents', e)
        return []
      })
      setIncidents(data || [])
    } catch (e) { logScreenError('ScreenIncidencias', 'loadIncidents', e) }
    finally { setLoading(false) }
  }

  async function handleSubmit() {
    if (!incidentType || !severity || !description.trim()) return
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      // company_id viene del contexto de sesión; el backend usa el de la empresa
      // del usuario autenticado si no se envía explícito. No hardcodear 34.
      await createIncident({
        incident_type: incidentType,
        severity,
        name: description.trim(),
      })
      setSuccess('Incidencia reportada')
      setIncidentType('')
      setSeverity('')
      setDescription('')
      await loadIncidents()
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      logScreenError('ScreenIncidencias', 'createIncident', e)
      setError('No se pudo reportar la incidencia')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = incidentType && severity && description.trim()

  const TYPE_LABELS = Object.fromEntries(INCIDENT_TYPES.map(t => [t.key, t.label]))
  const SEV_META = Object.fromEntries(SEVERITIES.map(s => [s.key, s]))

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; } @keyframes spin { to { transform: rotate(360deg); } } textarea { font-family: 'DM Sans', sans-serif; }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/ruta')} style={{ width: 38, height: 38, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Incidencias</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Form card */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
              boxShadow: TOKENS.shadow.soft, marginBottom: 20,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 0, marginBottom: 12 }}>NUEVA INCIDENCIA</p>

              {/* Incident type pills */}
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 8px' }}>Tipo</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {INCIDENT_TYPES.map(t => (
                  <button key={t.key} onClick={() => setIncidentType(t.key)} style={{
                    padding: '6px 14px', borderRadius: TOKENS.radius.pill,
                    fontSize: 12, fontWeight: 600,
                    background: incidentType === t.key ? `${TOKENS.colors.blue2}22` : TOKENS.colors.surface,
                    border: `1px solid ${incidentType === t.key ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                    color: incidentType === t.key ? TOKENS.colors.blue2 : TOKENS.colors.textMuted,
                    transition: `all ${TOKENS.motion.fast}`,
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Severity pills */}
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 8px' }}>Severidad</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {SEVERITIES.map(s => (
                  <button key={s.key} onClick={() => setSeverity(s.key)} style={{
                    flex: 1, padding: '8px', borderRadius: TOKENS.radius.sm,
                    fontSize: 12, fontWeight: 600,
                    background: severity === s.key ? `${s.color}18` : TOKENS.colors.surface,
                    border: `1px solid ${severity === s.key ? `${s.color}40` : TOKENS.colors.border}`,
                    color: severity === s.key ? s.color : TOKENS.colors.textMuted,
                    transition: `all ${TOKENS.motion.fast}`,
                  }}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Description */}
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 8px' }}>Descripción</p>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe la incidencia..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                  color: 'white', fontSize: 13, outline: 'none', resize: 'vertical',
                  marginBottom: 16,
                }}
              />

              {/* Messages */}
              {error && <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '0 0 12px', textAlign: 'center' }}>{error}</p>}
              {success && <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: '0 0 12px', textAlign: 'center' }}>{success}</p>}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                style={{
                  width: '100%', padding: '12px',
                  borderRadius: TOKENS.radius.lg,
                  background: canSubmit ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                  color: canSubmit ? 'white' : TOKENS.colors.textLow,
                  fontSize: 14, fontWeight: 600,
                  opacity: submitting ? 0.6 : 1,
                  boxShadow: canSubmit ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                  transition: `opacity ${TOKENS.motion.fast}`,
                }}
              >
                {submitting ? 'Enviando...' : 'Reportar Incidencia'}
              </button>
            </div>

            {/* Today's incidents list */}
            {incidents.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 12 }}>INCIDENCIAS DE HOY</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {incidents.map((inc, i) => (
                    <div key={inc.id || i} style={{
                      padding: '12px 16px', borderRadius: TOKENS.radius.lg,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        {/* Type badge */}
                        <span style={{
                          padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                          fontSize: 10, fontWeight: 700,
                          background: `${TOKENS.colors.blue2}18`,
                          color: TOKENS.colors.blue2,
                          border: `1px solid ${TOKENS.colors.blue2}30`,
                        }}>
                          {TYPE_LABELS[inc.incident_type] || inc.incident_type}
                        </span>
                        {/* Severity badge */}
                        <span style={{
                          padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                          fontSize: 10, fontWeight: 700,
                          background: `${SEV_META[inc.severity]?.color || TOKENS.colors.textMuted}18`,
                          color: SEV_META[inc.severity]?.color || TOKENS.colors.textMuted,
                          border: `1px solid ${SEV_META[inc.severity]?.color || TOKENS.colors.textMuted}30`,
                        }}>
                          {SEV_META[inc.severity]?.label || inc.severity}
                        </span>
                      </div>
                      <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>
                        {inc.name || inc.description}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}
