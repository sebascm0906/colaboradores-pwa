import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getMyTarget, getMyIncidents } from './api'

export default function ScreenMiRuta() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [target, setTarget] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [p, t] = await Promise.all([
          getMyRoutePlan(session?.employee_id).catch(() => null),
          getMyTarget(session?.employee_id).catch(() => null),
        ])
        setPlan(p)
        setTarget(t)
      } catch (e) { if (e.message !== 'no_session') setError('Error al cargar datos') }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const stopsDone = plan?.stops_done ?? 0
  const stopsTotal = plan?.stops_total ?? 0
  const stopsProgress = stopsTotal > 0 ? (stopsDone / stopsTotal) * 100 : 0

  const STATE_COLORS = {
    draft: TOKENS.colors.textMuted,
    in_progress: TOKENS.colors.blue2,
    done: TOKENS.colors.success,
  }

  const STATE_LABELS = {
    draft: 'Borrador',
    in_progress: 'En progreso',
    done: 'Completada',
  }

  const ACTIONS = [
    {
      id: 'checklist', label: 'Checklist Unidad', desc: 'Inspección del vehículo',
      route: '/ruta/checklist', color: TOKENS.colors.warning,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    },
    {
      id: 'carga', label: 'Aceptar Carga', desc: 'Confirmar carga asignada',
      route: '/ruta/carga', color: TOKENS.colors.blue2,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    },
    {
      id: 'incidencias', label: 'Incidencias', desc: 'Reportar problemas',
      route: '/ruta/incidencias', color: TOKENS.colors.error,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    },
    {
      id: 'kpis', label: 'KPIs y Metas', desc: 'Resultados del mes',
      route: '/ruta/kpis', color: TOKENS.colors.success,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    },
    {
      id: 'conciliacion', label: 'Conciliación', desc: 'Cierre de ruta',
      route: '/ruta/conciliacion', color: TOKENS.colors.blue3,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/></svg>,
    },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/')} style={{ width: 38, height: 38, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Mi Ruta</span>
        </div>

        {error && (
          <div style={{ margin: '12px 0', padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ ...typo.caption, color: '#ef4444', margin: 0 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Route plan card */}
            {plan ? (
              <div style={{
                padding: '16px', borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                boxShadow: TOKENS.shadow.soft, marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>{plan.name || 'Ruta del día'}</p>
                  <span style={{
                    padding: '3px 10px', borderRadius: TOKENS.radius.pill,
                    fontSize: 11, fontWeight: 700,
                    background: `${STATE_COLORS[plan.state] || TOKENS.colors.textMuted}18`,
                    color: STATE_COLORS[plan.state] || TOKENS.colors.textMuted,
                    border: `1px solid ${STATE_COLORS[plan.state] || TOKENS.colors.textMuted}30`,
                  }}>
                    {STATE_LABELS[plan.state] || plan.state}
                  </span>
                </div>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 12px' }}>
                  {plan.date || new Date().toLocaleDateString('es-MX')}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ ...typo.body, color: TOKENS.colors.textSoft }}>Paradas:</span>
                  <span style={{ ...typo.title, color: TOKENS.colors.text }}>{stopsDone}/{stopsTotal}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: TOKENS.colors.surface, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: stopsProgress === 100 ? TOKENS.colors.success : 'linear-gradient(90deg, #15499B, #2B8FE0)',
                    width: `${stopsProgress}%`,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            ) : (
              <div style={{
                padding: 20, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                textAlign: 'center', marginBottom: 20,
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin ruta asignada hoy</p>
              </div>
            )}

            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 16, marginBottom: 12 }}>OPERACIONES</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACTIONS.map(a => (
                <button key={a.id} onClick={() => navigate(a.route)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: TOKENS.radius.lg,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, boxShadow: TOKENS.shadow.soft,
                  width: '100%', textAlign: 'left', position: 'relative',
                }}>
                  <div style={{ width: 42, height: 42, borderRadius: TOKENS.radius.md, background: `${a.color}14`, border: `1px solid ${a.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color, flexShrink: 0 }}>{a.icon}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{a.label}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{a.desc}</p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
            </div>
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}
