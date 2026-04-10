import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getAlerts } from './api'
import { logScreenError } from '../shared/logScreenError'

const TYPE_COLORS = {
  pt_compute:  TOKENS.colors.blue2,
  pt_confirm:  TOKENS.colors.warning,
  pt_unlock:   TOKENS.colors.blue3,
  sync:        '#a78bfa',
  manual:      TOKENS.colors.textMuted,
}

const STATUS_STYLES = {
  success:   { bg: TOKENS.colors.successSoft, color: TOKENS.colors.success, label: 'OK' },
  failed:    { bg: TOKENS.colors.errorSoft,   color: TOKENS.colors.error,   label: 'ERROR' },
  new:       { bg: 'rgba(43,143,224,0.14)',    color: TOKENS.colors.blue2,   label: 'NUEVO' },
  duplicate: { bg: 'rgba(255,255,255,0.06)',   color: TOKENS.colors.textMuted, label: 'DUP' },
}

export default function ScreenAlertasGerente() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const a = await getAlerts()
      setAlerts(Array.isArray(a) ? a : [])
    } catch (e) {
      const msg = logScreenError('ScreenAlertasGerente', 'getAlerts', e)
      setError(msg)
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }

  const totalCount = alerts.length
  const failedCount = alerts.filter(a => a.status === 'failed').length
  const successCount = alerts.filter(a => a.status === 'success').length

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/gerente')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Alertas del Dia</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {error && (
              <div style={{
                marginTop: 8, padding: '10px 14px', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
                fontSize: 12, fontWeight: 600, color: TOKENS.colors.error,
              }}>
                No se pudieron cargar las alertas: {error}
              </div>
            )}
            {/* Summary bar */}
            <div style={{
              marginTop: 8, padding: 14, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
              display: 'flex', gap: 8, justifyContent: 'center',
            }}>
              <SummaryChip label="Total" value={totalCount} color={TOKENS.colors.blue2} />
              <SummaryChip label="Error" value={failedCount} color={TOKENS.colors.error} />
              <SummaryChip label="OK" value={successCount} color={TOKENS.colors.success} />
            </div>

            {alerts.length === 0 ? (
              <div style={{
                marginTop: 40, padding: 32, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                textAlign: 'center',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <p style={{ ...typo.title, color: TOKENS.colors.text }}>Sin alertas hoy</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>Todo opera con normalidad.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                {alerts.map((alert, i) => {
                  const st = STATUS_STYLES[alert.status] || STATUS_STYLES.new
                  const typeColor = TYPE_COLORS[alert.event_type] || TOKENS.colors.textMuted
                  return (
                    <div key={alert.id || i} style={{
                      padding: '14px 16px', borderRadius: TOKENS.radius.lg,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                      boxShadow: TOKENS.shadow.soft,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: TOKENS.radius.pill, fontSize: 10, fontWeight: 700,
                          background: `${typeColor}18`, color: typeColor, letterSpacing: '0.04em',
                        }}>{alert.event_type || 'event'}</span>
                        <span style={{
                          padding: '2px 8px', borderRadius: TOKENS.radius.pill, fontSize: 10, fontWeight: 700,
                          background: st.bg, color: st.color, letterSpacing: '0.04em',
                        }}>{st.label}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ ...typo.caption, color: TOKENS.colors.textLow, fontSize: 10 }}>
                          {alert.source || ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
                          {alert.sucursal || ''}
                        </span>
                        <span style={{ ...typo.caption, color: TOKENS.colors.textLow, fontSize: 10 }}>
                          {alert.date ? new Date(alert.date).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : ''}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function SummaryChip({ label, value, color }) {
  return (
    <div style={{ padding: '6px 14px', borderRadius: TOKENS.radius.sm, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center', minWidth: 64 }}>
      <p style={{ fontSize: 9, fontWeight: 600, color: TOKENS.colors.textMuted, margin: 0, letterSpacing: '0.1em' }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color, margin: 0, marginTop: 2, letterSpacing: '-0.02em' }}>{value}</p>
    </div>
  )
}
