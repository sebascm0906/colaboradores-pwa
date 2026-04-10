// ScreenControlRuta.jsx — V2 Monitor de progreso durante el dia
// Muestra paradas, progreso, alertas, link a Kold Field.
// NO duplica Kold Field — solo muestra status.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getMyTarget, getMyIncidents } from './api'
import { logScreenError } from '../shared/logScreenError'
import {
  getProgressPct,
  getTargetProgress,
  PLAN_STATES,
  STOP_RESULTS,
  fmtNum,
  fmtPct,
  fmtMoney,
} from './routeControlService'

export default function ScreenControlRuta() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [target, setTarget] = useState(null)
  const [incidents, setIncidents] = useState([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [p, t, inc] = await Promise.allSettled([
        getMyRoutePlan(session?.employee_id),
        getMyTarget(session?.employee_id),
        getMyIncidents(session?.employee_id),
      ])
      if (p.status === 'rejected') logScreenError('ScreenControlRuta', 'getMyRoutePlan', p.reason)
      if (t.status === 'rejected') logScreenError('ScreenControlRuta', 'getMyTarget', t.reason)
      if (inc.status === 'rejected') logScreenError('ScreenControlRuta', 'getMyIncidents', inc.reason)
      setPlan(p.status === 'fulfilled' ? p.value : null)
      setTarget(t.status === 'fulfilled' ? t.value : null)
      setIncidents(inc.status === 'fulfilled' && Array.isArray(inc.value) ? inc.value : [])
    } catch (e) { logScreenError('ScreenControlRuta', 'loadData', e) }
    setLoading(false)
  }

  const progressPct = getProgressPct(plan)
  const stopsDone = plan?.stops_done || 0
  const stopsTotal = plan?.stops_total || 0
  const targetProgress = getTargetProgress(target)

  // Parse stops from plan if available
  const stops = plan?.stop_ids || plan?.stops || []

  // Time tracking
  const departureTime = plan?.departure_time_real
  const now = new Date()
  const hoursOnRoute = departureTime
    ? Math.round((now - new Date(departureTime)) / (1000 * 60 * 60) * 10) / 10
    : null

  // Alerts
  const alerts = []
  if (stopsTotal > 0 && stopsDone === 0 && hoursOnRoute && hoursOnRoute > 1) {
    alerts.push({ type: 'warning', msg: `Llevas ${hoursOnRoute}h sin completar paradas` })
  }
  if (stopsTotal > 0 && stopsDone < stopsTotal * 0.5 && hoursOnRoute && hoursOnRoute > 4) {
    alerts.push({ type: 'danger', msg: `Menos del 50% de paradas en ${hoursOnRoute}h` })
  }
  if (incidents.length > 0) {
    alerts.push({ type: 'info', msg: `${incidents.length} incidencia${incidents.length > 1 ? 's' : ''} reportada${incidents.length > 1 ? 's' : ''}` })
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/ruta')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Control de Ruta</span>
          <button onClick={loadData} style={{
            marginLeft: 'auto', width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !plan ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin ruta activa</p>
          </div>
        ) : (
          <>
            {/* Big progress */}
            <div style={{
              padding: 20, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              textAlign: 'center', marginBottom: 16,
            }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 4px' }}>PROGRESO DE PARADAS</p>
              <p style={{ margin: 0, fontSize: 48, fontWeight: 700, color: progressPct === 100 ? '#22c55e' : '#2B8FE0', letterSpacing: '-0.03em' }}>
                {fmtPct(progressPct)}
              </p>
              <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: '4px 0 12px' }}>
                {stopsDone} de {stopsTotal} paradas completadas
              </p>
              {/* Progress bar */}
              <div style={{ height: 8, borderRadius: 4, background: TOKENS.colors.surface, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: progressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #15499B, #2B8FE0)',
                  width: `${progressPct}%`, transition: 'width 0.4s ease',
                }} />
              </div>
              {hoursOnRoute && (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0 0' }}>
                  {hoursOnRoute}h en ruta
                </p>
              )}
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{
                    padding: '10px 12px', borderRadius: TOKENS.radius.md,
                    background: a.type === 'danger' ? 'rgba(239,68,68,0.08)' : a.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(43,143,224,0.08)',
                    border: `1px solid ${a.type === 'danger' ? 'rgba(239,68,68,0.25)' : a.type === 'warning' ? 'rgba(245,158,11,0.25)' : 'rgba(43,143,224,0.25)'}`,
                  }}>
                    <p style={{ ...typo.caption, margin: 0, fontWeight: 600,
                      color: a.type === 'danger' ? '#ef4444' : a.type === 'warning' ? '#f59e0b' : '#2B8FE0',
                    }}>{a.msg}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Target KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}` }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 4 }}>Venta vs Meta</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: targetProgress.salesPct >= 80 ? '#22c55e' : '#f59e0b' }}>
                  {fmtPct(targetProgress.salesPct)}
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0', fontSize: 10 }}>
                  {fmtMoney(targetProgress.salesActual)} / {fmtMoney(targetProgress.salesTarget)}
                </p>
              </div>
              <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}` }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 4 }}>Cobranza vs Meta</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: targetProgress.collectionPct >= 80 ? '#22c55e' : '#f59e0b' }}>
                  {fmtPct(targetProgress.collectionPct)}
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0', fontSize: 10 }}>
                  {fmtMoney(targetProgress.collectionActual)} / {fmtMoney(targetProgress.collectionTarget)}
                </p>
              </div>
            </div>

            {/* Kold Field link */}
            <div style={{
              padding: 14, borderRadius: TOKENS.radius.lg,
              background: 'rgba(43,143,224,0.06)', border: '1px solid rgba(43,143,224,0.2)',
              marginBottom: 16, textAlign: 'center',
            }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px' }}>
                Visitas, ventas y cobros se ejecutan en:
              </p>
              <p style={{ ...typo.title, color: '#2B8FE0', margin: 0, fontSize: 16 }}>
                Kold Field
              </p>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0', fontSize: 10 }}>
                Los datos se sincronizan automaticamente con esta app
              </p>
            </div>

            {/* Incidencias summary */}
            {incidents.length > 0 && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.lg,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>Incidencias del dia</p>
                  <span style={{
                    padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                    fontSize: 11, fontWeight: 700, color: '#ef4444',
                  }}>{incidents.length}</span>
                </div>
                {incidents.slice(0, 3).map((inc, i) => (
                  <div key={i} style={{
                    padding: '6px 0', borderTop: i > 0 ? `1px solid ${TOKENS.colors.border}` : 'none',
                  }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0 }}>
                      {inc.incident_type || inc.type || 'Incidencia'} — {inc.severity || 'media'}
                    </p>
                  </div>
                ))}
                {incidents.length > 3 && (
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    y {incidents.length - 3} mas...
                  </p>
                )}
              </div>
            )}

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}
