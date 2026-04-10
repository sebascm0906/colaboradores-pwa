// ScreenMiRuta.jsx — V2 Hub Guiado Jefe de Ruta
// Flujo de 6 estaciones con semaforo de pasos.
// Concepto: App de DISCIPLINA OPERATIVA, no de ventas.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getRouteDaySummary,
  calculateFlowState,
  getProgressPct,
  getTargetProgress,
  getKmData,
  getCierreState,
  PLAN_STATES,
  fmtNum,
  fmtPct,
} from './routeControlService'

export default function ScreenMiRuta() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [target, setTarget] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [checklistDone, setChecklistDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const summary = await getRouteDaySummary(session?.employee_id)
      setPlan(summary.plan)
      setTarget(summary.target)
      setIncidents(summary.incidents)
      setChecklistDone(summary.checklistDone || false)
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar datos')
    }
    setLoading(false)
  }

  // Merge backend plan fields with localStorage cache
  const planId = plan?.id
  const kmData = planId ? getKmData(planId, plan) : {}
  const cierreState = planId ? getCierreState(planId, plan) : {}
  const bridgeData = {
    checklistDone,
    kmSalida: kmData.kmSalida,
    corteDone: cierreState.corteDone || false,
    liquidacionDone: cierreState.liquidacionDone || false,
  }

  const flowState = plan ? calculateFlowState(plan, bridgeData) : null
  const progressPct = getProgressPct(plan)
  const targetProgress = getTargetProgress(target)
  const planState = PLAN_STATES[plan?.state] || PLAN_STATES.draft

  // Quick actions that are always available
  const QUICK_ACTIONS = [
    { id: 'checklist', label: 'Checklist', route: '/ruta/checklist', color: TOKENS.colors.warning,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { id: 'carga', label: 'Carga', route: '/ruta/carga', color: TOKENS.colors.blue2,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
    { id: 'incidencias', label: 'Incidencia', route: '/ruta/incidencias', color: TOKENS.colors.error,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
    { id: 'kpis', label: 'KPIs', route: '/ruta/kpis', color: TOKENS.colors.success,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  ]

  const STEP_COLORS = {
    done: '#22c55e',
    active: '#2B8FE0',
    pending: '#475569',
    blocked: '#334155',
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
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Mi Ruta</span>
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

        {error && (
          <div style={{ margin: '0 0 12px', padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ ...typo.caption, color: '#ef4444', margin: 0 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !plan ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F6A3;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Sin ruta asignada</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0 0' }}>No hay plan de ruta para hoy</p>
          </div>
        ) : (
          <>
            {/* Plan card */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>{plan.name || 'Ruta del dia'}</p>
                <span style={{
                  padding: '3px 10px', borderRadius: TOKENS.radius.pill, fontSize: 11, fontWeight: 700,
                  background: `${planState.color}18`, color: planState.color,
                  border: `1px solid ${planState.color}30`,
                }}>{planState.label}</span>
              </div>

              {/* Progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Paradas</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: TOKENS.colors.surface, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: progressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #15499B, #2B8FE0)',
                    width: `${progressPct}%`, transition: 'width 0.3s ease',
                  }} />
                </div>
                <span style={{ ...typo.caption, color: TOKENS.colors.text, fontWeight: 700 }}>
                  {plan.stops_done || 0}/{plan.stops_total || 0}
                </span>
              </div>

              {/* Mini KPIs */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, padding: '6px 8px', borderRadius: TOKENS.radius.md, background: 'rgba(255,255,255,0.04)' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>Venta</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: targetProgress.salesPct >= 80 ? '#22c55e' : targetProgress.salesPct >= 50 ? '#f59e0b' : '#ef4444' }}>
                    {fmtPct(targetProgress.salesPct)}
                  </p>
                </div>
                <div style={{ flex: 1, padding: '6px 8px', borderRadius: TOKENS.radius.md, background: 'rgba(255,255,255,0.04)' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>Cobranza</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: targetProgress.collectionPct >= 80 ? '#22c55e' : targetProgress.collectionPct >= 50 ? '#f59e0b' : '#ef4444' }}>
                    {fmtPct(targetProgress.collectionPct)}
                  </p>
                </div>
                <div style={{ flex: 1, padding: '6px 8px', borderRadius: TOKENS.radius.md, background: 'rgba(255,255,255,0.04)' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>Incidencias</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: incidents.length > 0 ? '#f59e0b' : TOKENS.colors.textMuted }}>
                    {incidents.length}
                  </p>
                </div>
                {kmData.kmSalida && (
                  <div style={{ flex: 1, padding: '6px 8px', borderRadius: TOKENS.radius.md, background: 'rgba(255,255,255,0.04)' }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>KM Salida</p>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TOKENS.colors.blue2 }}>
                      {fmtNum(kmData.kmSalida)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Flow Steps — Semaforo */}
            {flowState && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10, marginTop: 4 }}>FLUJO DEL DIA</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {flowState.steps.map((step, idx) => {
                    const isActive = step.status === 'active'
                    const isDone = step.status === 'done'
                    const isPending = step.status === 'pending'
                    const dotColor = STEP_COLORS[step.status]

                    return (
                      <button key={step.id}
                        onClick={() => {
                          if (isPending) return
                          navigate(step.route)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 14px', borderRadius: TOKENS.radius.lg,
                          background: isActive ? 'rgba(43,143,224,0.08)' : TOKENS.glass.panelSoft,
                          border: `1px solid ${isActive ? 'rgba(43,143,224,0.3)' : TOKENS.colors.border}`,
                          opacity: isPending ? 0.5 : 1,
                          width: '100%', textAlign: 'left',
                          ...(isActive ? { animation: 'pulse 2s ease-in-out infinite' } : {}),
                        }}
                      >
                        {/* Step number + dot */}
                        <div style={{
                          width: 28, height: 28, borderRadius: 14,
                          background: `${dotColor}20`,
                          border: `2px solid ${dotColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {isDone ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dotColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5"/>
                            </svg>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: dotColor }}>{idx + 1}</span>
                          )}
                        </div>

                        {/* Label + detail */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...typo.body, color: isPending ? TOKENS.colors.textMuted : TOKENS.colors.text, margin: 0, fontWeight: isActive ? 700 : 500 }}>
                            {step.label}
                          </p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 11 }}>
                            {step.detail}
                          </p>
                        </div>

                        {/* Arrow */}
                        {!isPending && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Quick Actions */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>ACCIONES RAPIDAS</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
              {QUICK_ACTIONS.map(a => (
                <button key={a.id} onClick={() => navigate(a.route)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '12px 8px', borderRadius: TOKENS.radius.lg,
                  background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: TOKENS.radius.md,
                    background: `${a.color}14`, border: `1px solid ${a.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color,
                  }}>{a.icon}</div>
                  <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontSize: 10, textAlign: 'center' }}>{a.label}</span>
                </button>
              ))}
            </div>

            {/* Info */}
            <div style={{
              padding: 10, borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontSize: 10 }}>
                Control operativo V2. Ejecucion de ruta (visitas, ventas, cobros) en Kold Field.
              </p>
            </div>

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}
