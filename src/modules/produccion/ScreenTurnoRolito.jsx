// ScreenTurnoRolito.jsx — V2 Hub Principal Operador de Rolito
// Pantalla principal que muestra TODO lo que el operador necesita:
// - Ciclo en curso con countdown
// - KPIs del turno
// - Que sigue (next action)
// - Alertas de diagnostico
// - Acciones contextuales
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo, TURNO_LABELS } from '../../tokens'
import {
  getShiftOverview,
  getActiveCycle,
  getLastDumpedCycle,
  getCycleProgress,
  getNextAction,
  getCycleDiagnostics,
  CYCLE_STATES,
  EXPECTED_KG_PER_CYCLE,
} from './rolitoService'
import OpeningStateBanner from './OpeningStateBanner'
import {
  clearStaleOperatorTurnClosed,
  getOperatorCloseState,
  normalizeOperatorCloseRole,
} from '../shared/operatorTurnCloseStore'
import ScreenTurnoEntregado from './ScreenTurnoEntregado'

const SHIFT_STATES = {
  draft:       { label: 'Pendiente',   color: TOKENS.colors.textMuted },
  in_progress: { label: 'En curso',    color: TOKENS.colors.blue2 },
  closed:      { label: 'Cerrado',     color: TOKENS.colors.success },
  audited:     { label: 'Auditado',    color: TOKENS.colors.success },
}

export default function ScreenTurnoRolito() {
  const { session } = useSession()
  const navigate = useNavigate()
  const activeOperatorRole = normalizeOperatorCloseRole(session?.role) || 'operador_rolito'
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [data, setData] = useState({ shift: null, cycles: [], packing: [], checklist: null, kpis: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0) // Forces re-render for countdown
  const timerRef = useRef(null)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const loadData = useCallback(async () => {
    try {
      setError('')
      const result = await getShiftOverview()
      setData(result)
    } catch (e) {
      setError(e.message === 'no_session' ? 'Sesion expirada' : 'No se pudo cargar el turno')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!data.shift?.id) return
    clearStaleOperatorTurnClosed(data.shift, activeOperatorRole, data.shift)
  }, [data.shift, activeOperatorRole])

  // Countdown timer: tick every second when there's an active cycle
  useEffect(() => {
    const active = getActiveCycle(data.cycles)
    if (active) {
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [data.cycles])

  // Auto-refresh data every 30s
  useEffect(() => {
    const iv = setInterval(loadData, 30000)
    return () => clearInterval(iv)
  }, [loadData])

  const { shift, cycles, checklist, kpis, packing, bagMaterials } = data
  const activeCycle = getActiveCycle(cycles)
  const lastDumped = getLastDumpedCycle(cycles)
  const progress = getCycleProgress(activeCycle)
  const nextAction = getNextAction(shift, cycles, checklist, packing, bagMaterials)
  const diagnostics = getCycleDiagnostics(lastDumped) || getCycleDiagnostics(activeCycle)
  const stateInfo = SHIFT_STATES[shift?.state] || SHIFT_STATES.draft
  const totalBagsAvailable = (bagMaterials || []).reduce((sum, item) => sum + (Number(item.remaining) || 0), 0)
  const closeState = useMemo(() => (
    shift?.id ? getOperatorCloseState(shift, activeOperatorRole, shift) : null
  ), [shift, activeOperatorRole])

  if (!loading && !error && closeState?.effectively_closed) {
    return <ScreenTurnoEntregado shift={shift} role={activeOperatorRole} closeState={closeState} />
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Mi Turno — Rolito</span>
          <button onClick={loadData} style={{
            marginLeft: 'auto', width: 34, height: 34, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            marginTop: 20, padding: 16, borderRadius: TOKENS.radius.lg,
            background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
            color: TOKENS.colors.error, ...typo.body, textAlign: 'center',
          }}>
            {error}
            <button onClick={loadData} style={{ display: 'block', margin: '10px auto 0', color: TOKENS.colors.blue2, ...typo.caption, textDecoration: 'underline' }}>
              Reintentar
            </button>
          </div>
        )}

        {/* No shift */}
        {!loading && !error && !shift && (
          <div style={{
            marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl,
            background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F3ED;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.text, marginBottom: 6 }}>Sin turno activo</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>No hay turno asignado. Contacta a tu supervisor.</p>
          </div>
        )}

        {/* Active shift */}
        {!loading && !error && shift && (
          <>
            {/* Shift header card */}
            <div style={{
              marginTop: 4, padding: 14, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>TURNO ACTIVO</p>
                  <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>
                    Evaporador 1
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 2 }}>
                    {shift.date} &middot; {TURNO_LABELS[shift.shift_code] || `Turno ${shift.shift_code}`}
                  </p>
                </div>
                <div style={{
                  padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                  background: `${stateInfo.color}18`, border: `1px solid ${stateInfo.color}40`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: stateInfo.color }}>{stateInfo.label}</span>
                </div>
              </div>
            </div>

            {/* Opening State — qué recibe este turno del anterior */}
            <OpeningStateBanner shiftId={shift?.id} typo={typo} />

            {/* ── ALERTS (diagnostics) ─────────────────────────── */}
            {diagnostics && diagnostics.map((d, i) => (
              <div key={i} style={{
                marginTop: 10, padding: 12, borderRadius: TOKENS.radius.lg,
                background: d.level === 'critical' ? TOKENS.colors.errorSoft : TOKENS.colors.warningSoft,
                border: `1px solid ${d.level === 'critical' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>{d.level === 'critical' ? '\u26A0\uFE0F' : '\u26A0'}</span>
                <p style={{ ...typo.caption, color: d.level === 'critical' ? TOKENS.colors.error : TOKENS.colors.warning, margin: 0, fontWeight: 600 }}>
                  {d.message}
                </p>
              </div>
            ))}

            {/* ── CYCLE STATUS CARD ────────────────────────────── */}
            <div style={{
              marginTop: 12, padding: 16, borderRadius: TOKENS.radius.xl,
              background: activeCycle
                ? `linear-gradient(180deg, ${(CYCLE_STATES[activeCycle.state]?.color || '#2B8FE0')}18, rgba(255,255,255,0.02))`
                : TOKENS.glass.panel,
              border: `1px solid ${activeCycle ? (CYCLE_STATES[activeCycle.state]?.color || '#2B8FE0') + '30' : TOKENS.colors.border}`,
            }}>
              {activeCycle && progress ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>
                        PRODUCCIÓN #{activeCycle.cycle_number || '?'}
                      </p>
                      <p style={{ ...typo.h2, color: CYCLE_STATES[activeCycle.state]?.color || TOKENS.colors.text, margin: 0 }}>
                        {progress.phaseLabel}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{
                        fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.03em',
                        color: progress.isOverdue ? TOKENS.colors.error : TOKENS.colors.text,
                        animation: progress.isOverdue ? 'pulse 1.5s ease infinite' : 'none',
                      }}>
                        {progress.isOverdue ? '+' : ''}{progress.remainingMin}:{String(progress.remainingSec).padStart(2, '0')}
                      </p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                        {progress.isOverdue ? 'pasado' : 'restante'}
                      </p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{
                    height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: `${progress.progressPct}%`,
                      background: progress.isOverdue
                        ? TOKENS.colors.error
                        : progress.progressPct >= 80
                          ? TOKENS.colors.warning
                          : CYCLE_STATES[activeCycle.state]?.color || TOKENS.colors.blue2,
                      transition: 'width 1s linear',
                    }} />
                  </div>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6, textAlign: 'center' }}>
                    {progress.elapsedMin} min de {progress.expectedMin} min esperados
                  </p>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 6 }}>PRODUCCIÓN</p>
                  <p style={{ ...typo.h2, color: TOKENS.colors.textMuted, margin: 0 }}>
                    Listo para producir
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textLow, marginTop: 4 }}>
                    Presiona abajo para iniciar
                  </p>
                </div>
              )}
            </div>

            {/* ── NEXT ACTION (CTA) ────────────────────────────── */}
            {nextAction.action !== 'wait_freeze' && nextAction.action !== 'wait_defrost' && nextAction.route && (
              <button
                onClick={() => navigate(nextAction.route)}
                style={{
                  marginTop: 12, width: '100%', padding: '16px 20px',
                  borderRadius: TOKENS.radius.lg,
                  background: nextAction.urgency === 'urgent'
                    ? 'linear-gradient(90deg, #dc2626, #ef4444)'
                    : nextAction.urgency === 'required'
                      ? 'linear-gradient(90deg, #f59e0b, #eab308)'
                      : 'linear-gradient(90deg, #15499B, #2B8FE0)',
                  color: 'white',
                  boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {nextAction.action === 'checklist' ? '\u2611' :
                   nextAction.action === 'packing' ? '\uD83D\uDCE6' :
                   nextAction.action === 'start_cycle' ? '\u25B6' :
                   nextAction.action === 'end_freeze' ? '\u2744' :
                   nextAction.action === 'end_defrost' ? '\uD83D\uDD25' : '\u27A1'}
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                    {nextAction.label}
                  </p>
                  <p style={{ fontSize: 12, fontWeight: 500, margin: 0, marginTop: 2, opacity: 0.85 }}>
                    {nextAction.description}
                  </p>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            )}

            {/* ── KPIs ─────────────────────────────────────────── */}
            {kpis && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 20, marginBottom: 10 }}>HOY</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <KpiCard
                    label="Ciclos"
                    value={kpis.expectedCycles ? `${kpis.completedCycles}/${kpis.expectedCycles}` : `${kpis.completedCycles}`}
                    accent={kpis.completedCycles > 0 ? TOKENS.colors.blue2 : TOKENS.colors.textMuted} typo={typo} />
                  <KpiCard
                    label="Producido"
                    value={kpis.totalKgProduced !== null
                      ? `${kpis.totalKgProduced} kg`
                      : (kpis.estimated?.producedKg ? `~${Math.round(kpis.estimated.producedKg)} kg` : '—')}
                    hint={kpis.totalKgProduced === null && kpis.estimated?.producedKg ? 'estimado' : null}
                    accent={TOKENS.colors.blue2} typo={typo} />
                  <KpiCard
                    label="Empacado"
                    value={kpis.totalKgPacked !== null
                      ? `${kpis.totalKgPacked} kg`
                      : (kpis.estimated?.packedKg ? `~${Math.round(kpis.estimated.packedKg)} kg` : '—')}
                    hint={kpis.totalKgPacked === null && kpis.estimated?.packedKg ? 'estimado' : null}
                    accent={TOKENS.colors.success} typo={typo} />
                  <KpiCard
                    label="Merma"
                    value={kpis.mermaKg !== null && kpis.mermaPct !== null
                      ? `${kpis.mermaKg} kg (${kpis.mermaPct}%)`
                      : '—'}
                    hint={kpis.mermaKg === null ? 'sin dato backend' : null}
                    accent={kpis.mermaExceeded ? TOKENS.colors.error : TOKENS.colors.success} typo={typo} />
                </div>
              </>
            )}

            {/* ── ACTIONS GRID ─────────────────────────────────── */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 20, marginBottom: 10 }}>ACCIONES</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <ActionButton label="Producir" icon={'\u23F1'} color={TOKENS.colors.blue2}
                onClick={() => navigate('/produccion/ciclo')} typo={typo}
                disabled={!!activeCycle || totalBagsAvailable <= 0}
                disabledMsg={activeCycle ? 'Hay producción activa' : 'No hay bolsa disponible'} />
              <ActionButton label="Materiales" icon={'\uD83D\uDCE6'} color={TOKENS.colors.warning}
                onClick={() => navigate('/almacen-pt/materiales', { state: { backTo: '/produccion' } })} typo={typo} />
              <ActionButton label="Empaque" icon={'\uD83D\uDCE6'} color={TOKENS.colors.success}
                onClick={() => navigate('/produccion/empaque')} typo={typo} />
              <ActionButton label="Reportar problema" icon={'\u26A0'} color={TOKENS.colors.warning}
                onClick={() => navigate('/produccion/incidencia')} typo={typo} />
              <ActionButton label="Checklist" icon={'\u2611'} color="#a78bfa"
                onClick={() => navigate('/produccion/checklist')} typo={typo} />
              <ActionButton label="Resumen" icon={'\uD83D\uDCCA'} color={TOKENS.colors.blue3}
                onClick={() => navigate('/produccion/corte')} typo={typo} />
              <ActionButton label="Cerrar Turno" icon={'\uD83D\uDD12'} color={TOKENS.colors.textMuted}
                onClick={() => navigate('/produccion/cierre')} typo={typo} />
            </div>

            {/* ── RECENT CYCLES ─────────────────────────────────── */}
            {cycles.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 20, marginBottom: 10 }}>ÚLTIMAS PRODUCCIONES</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cycles.slice(-5).reverse().map((c, i) => {
                    const st = CYCLE_STATES[c.state] || CYCLE_STATES.freezing
                    const timeStr = c.freeze_start ? new Date(c.freeze_start.replace(' ', 'T')).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '--:--'
                    const cycleDiag = getCycleDiagnostics(c)
                    return (
                      <div key={c.id || i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', borderRadius: TOKENS.radius.md,
                        background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                      }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%',
                          background: `${st.color}14`, border: `1px solid ${st.color}30`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: st.color, flexShrink: 0,
                        }}>
                          {c.cycle_number || '#'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>
                            Prod. {c.cycle_number} &middot; {timeStr}
                          </p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 1 }}>
                            {c.state === 'dumped' ? `${c.kg_dumped || 0} kg` : st.label}
                            {cycleDiag ? ` \u26A0` : ''}
                          </p>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: st.color,
                          background: `${st.color}14`, padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                        }}>
                          {st.label}
                        </span>
                      </div>
                    )
                  })}
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

function KpiCard({ label, value, accent, typo, hint }) {
  return (
    <div style={{
      padding: '12px', borderRadius: TOKENS.radius.md,
      background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: accent || TOKENS.colors.text, margin: 0, letterSpacing: '-0.02em' }}>
        {value}
      </p>
      {hint && (
        <p style={{ fontSize: 10, color: TOKENS.colors.textLow, margin: 0, marginTop: 2, fontStyle: 'italic' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function ActionButton({ label, icon, color, onClick, typo, disabled, disabledMsg }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      onPointerDown={() => !disabled && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={disabled ? undefined : onClick}
      style={{
        padding: '14px 10px', borderRadius: TOKENS.radius.lg,
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
        transition: `transform ${TOKENS.motion.fast}`,
        opacity: disabled ? 0.4 : 1,
        textAlign: 'center',
      }}
      title={disabledMsg || ''}
    >
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{label}</p>
    </button>
  )
}
