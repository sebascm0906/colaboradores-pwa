import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { softWarehouse } from '../../lib/sessionGuards'
import { getDaySummary, getEntregasShiftStatus, computeStepStatuses, STEP_STATUS } from './entregasService'
import { getEntregasDestination } from '../almacen-pt/ptService'
import { ScreenShell, StepTimeline } from './components'
import SessionErrorState from '../../components/SessionErrorState'

const STEPS = [
  { id: 'aceptarTurno', label: 'Aceptar turno', icon: '\u{1F504}', route: '/entregas/aceptar-turno' },
  { id: 'recibirPT', label: 'Recibir de PT', icon: '\u{1F4E6}', route: '/entregas/recibir-pt' },
  { id: 'cargarUnidades', label: 'Cargar unidades', icon: '\u{1F69A}', route: '/entregas/carga' },
  { id: 'operacionDia', label: 'Operacion del dia', icon: '\u{1F3EA}', route: '/entregas/operacion' },
  { id: 'devoluciones', label: 'Devoluciones', icon: '\u21A9\uFE0F', route: '/entregas/devoluciones' },
  { id: 'merma', label: 'Merma', icon: '\u26A0\uFE0F', route: '/entregas/merma' },
  { id: 'entregarTurno', label: 'Entregar turno', icon: '\u{1F512}', route: '/entregas/cierre-turno' },
]

function getBadgeText(stepId, summary) {
  if (!summary) return ''
  switch (stepId) {
    case 'aceptarTurno':
      return summary.shift_handover_pending ? 'Pendiente' : summary.shift_accepted_today ? 'Aceptado' : 'Pendiente'
    case 'recibirPT':
      return `${summary.pending_pallets ?? 0} pallets`
    case 'cargarUnidades':
      return `${summary.routes_sealed ?? 0}/${summary.routes_total ?? 0} cargadas`
    case 'operacionDia':
      return `${summary.pending_tickets ?? 0} tickets`
    case 'devoluciones':
      return `${summary.pending_returns ?? 0} pendientes`
    case 'merma':
      return `${summary.scraps_today ?? 0} registradas`
    case 'entregarTurno':
      return 'Pendiente'
    default:
      return ''
  }
}

function getStatusColor(status) {
  switch (status) {
    case STEP_STATUS.COMPLETED: return TOKENS.colors.success
    case STEP_STATUS.IN_PROGRESS: return TOKENS.colors.blue2
    case STEP_STATUS.PENDING: return TOKENS.colors.warning
    case STEP_STATUS.ALERT: return TOKENS.colors.error
    case STEP_STATUS.LOCKED:
    default: return TOKENS.colors.textMuted
  }
}

function getStatusLabel(status) {
  switch (status) {
    case STEP_STATUS.COMPLETED: return 'Completado'
    case STEP_STATUS.IN_PROGRESS: return 'En curso'
    case STEP_STATUS.PENDING: return 'Pendiente'
    case STEP_STATUS.ALERT: return 'Atencion'
    case STEP_STATUS.LOCKED: return 'Bloqueado'
    default: return ''
  }
}

export default function ScreenHubDia() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [summary, setSummary] = useState(null)
  const [shiftStatus, setShiftStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fixedDestination, setFixedDestination] = useState(null)

  const sessionWarehouseId = softWarehouse(session)
  const warehouseId = fixedDestination?.id || sessionWarehouseId
  const warehouseName = session?.warehouse_name || 'Almacen'

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    let active = true
    getEntregasDestination()
      .then((dest) => { if (active && dest?.id) setFixedDestination(dest) })
      .catch(() => { if (active) setFixedDestination(null) })
    return () => { active = false }
  }, [])

  const loadData = useCallback(async () => {
    if (!warehouseId) { setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const status = await getEntregasShiftStatus({
        warehouseId,
        employeeId: Number(session?.employee_id || 0) || 0,
      })
      setShiftStatus(status)
      if (status.view === 'dashboard') {
        const data = await getDaySummary(warehouseId)
        console.info('[ENTREGAS][HubDia] summary loaded', {
          warehouseId,
          pending_pallets: data?.pending_pallets,
          summary: data,
        })
        setSummary(data)
      } else {
        setSummary(null)
      }
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar resumen del dia')
    } finally {
      setLoading(false)
    }
  }, [warehouseId, session?.employee_id])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (shiftStatus?.view === 'receive_turn') {
      navigate('/entregas/cierre-turno', { replace: true })
    }
  }, [shiftStatus?.view, navigate])

  // Guard: si no hay warehouse, mostrar pantalla de error claro.
  if (!warehouseId) {
    return (
      <SessionErrorState
        error={{ missing: 'warehouse_id', userMessage: 'Tu usuario no tiene almacén asignado. Vuelve a iniciar sesión o contacta a tu gerente.' }}
        backTo="/"
      />
    )
  }

  const statuses = summary ? computeStepStatuses(summary) : {}
  if (summary) {
    console.info('[ENTREGAS][HubDia] recibirPT status', {
      pending_pallets: summary.pending_pallets,
      recibirPT: statuses.recibirPT,
    })
  }

  // Find first non-completed step as "suggested next"
  const suggestedStepId = STEPS.find(
    (s) => statuses[s.id] && statuses[s.id] !== STEP_STATUS.COMPLETED && statuses[s.id] !== STEP_STATUS.LOCKED
  )?.id || null

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const stepsWithData = STEPS.map((step) => ({
    ...step,
    status: statuses[step.id] || STEP_STATUS.LOCKED,
    badge: getBadgeText(step.id, summary),
    isSuggested: step.id === suggestedStepId,
  }))

  return (
    <ScreenShell title="Almacen de Entregas" backTo="/">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-border { 0%, 100% { border-color: rgba(43,143,224,0.30); } 50% { border-color: rgba(43,143,224,0.60); } }
      `}</style>

      {/* Date + Warehouse sub-header */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, textTransform: 'capitalize' }}>{today}</p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>{warehouseName}</p>
      </div>

      {/* Refresh button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={loadData}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: TOKENS.radius.pill,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.textMuted, fontSize: 12, fontWeight: 600,
            opacity: loading ? 0.5 : 1, cursor: loading ? 'default' : 'pointer',
            transition: `opacity ${TOKENS.motion.fast}`,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={loading ? { animation: 'spin 0.8s linear infinite' } : {}}>
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Actualizar
        </button>
      </div>

      <button
        onClick={() => navigate('/entregas/transformacion')}
        style={{
          width: '100%',
          marginBottom: 12,
          padding: '14px 16px',
          borderRadius: TOKENS.radius.lg,
          background: 'linear-gradient(180deg, rgba(43,143,224,0.14), rgba(43,143,224,0.04))',
          border: `1px solid rgba(43,143,224,0.35)`,
          boxShadow: TOKENS.shadow.blue,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <div>
          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Transformacion</p>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>Medias barras para entregas</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {/* Error */}
      {error && (
        <div style={{
          margin: '0 0 12px', padding: 12, borderRadius: TOKENS.radius.sm,
          background: TOKENS.colors.errorSoft, border: `1px solid rgba(239,68,68,0.2)`,
        }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && !summary ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      ) : shiftStatus?.view === 'blocked' ? (
        <EntregasBlockedView shiftStatus={shiftStatus} typo={typo} onReload={loadData} />
      ) : shiftStatus?.view === 'receive_turn' ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      ) : summary ? (
        <>
          {/* Step Timeline label */}
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 4, marginBottom: 12 }}>
            FLUJO DEL DIA
          </p>

          {/* Step cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stepsWithData.map((step, idx) => {
              const color = getStatusColor(step.status)
              const isLocked = step.status === STEP_STATUS.LOCKED
              return (
                <button
                  key={step.id}
                  onClick={() => !isLocked && navigate(step.route)}
                  disabled={isLocked}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 14px', borderRadius: TOKENS.radius.lg,
                    background: step.isSuggested
                      ? 'linear-gradient(180deg, rgba(43,143,224,0.14), rgba(43,143,224,0.04))'
                      : TOKENS.glass.panel,
                    border: step.isSuggested
                      ? `1.5px solid rgba(43,143,224,0.40)`
                      : `1px solid ${TOKENS.colors.border}`,
                    boxShadow: step.isSuggested ? TOKENS.shadow.blue : TOKENS.shadow.soft,
                    width: '100%', textAlign: 'left',
                    opacity: isLocked ? 0.45 : 1,
                    cursor: isLocked ? 'default' : 'pointer',
                    transition: `all ${TOKENS.motion.fast}`,
                    animation: step.isSuggested ? 'pulse-border 2.5s ease infinite' : 'none',
                  }}
                >
                  {/* Step number circle */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `${color}18`, border: `1.5px solid ${color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                  }}>
                    {step.status === STEP_STATUS.COMPLETED ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <span>{step.icon}</span>
                    )}
                  </div>

                  {/* Label + badge */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{step.label}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{step.badge}</span>
                      {step.isSuggested && (
                        <span style={{
                          padding: '1px 7px', borderRadius: TOKENS.radius.pill,
                          background: `${TOKENS.colors.blue2}20`, border: `1px solid ${TOKENS.colors.blue2}40`,
                          fontSize: 10, fontWeight: 700, color: TOKENS.colors.blue3,
                        }}>
                          Siguiente
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                      background: `${color}15`, border: `1px solid ${color}30`,
                      fontSize: 10, fontWeight: 700, color,
                    }}>
                      {getStatusLabel(step.status)}
                    </span>
                    {!isLocked && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div style={{ height: 32 }} />
        </>
      ) : null}
    </ScreenShell>
  )
}

function EntregasBlockedView({ shiftStatus, typo, onReload }) {
  const ownerName = shiftStatus?.owner_employee_name || 'otro almacenista'
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        padding: 24, borderRadius: TOKENS.radius.xl,
        background: 'linear-gradient(160deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))',
        border: `1px solid ${TOKENS.colors.error}50`,
        boxShadow: '0 12px 28px rgba(239,68,68,0.20)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `${TOKENS.colors.error}24`, border: `1px solid ${TOKENS.colors.error}60`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', color: TOKENS.colors.error,
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <p style={{ ...typo.title, color: TOKENS.colors.error, margin: 0, fontWeight: 700 }}>
          Entregas en uso por otro almacenista
        </p>
        <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: '8px 0 0' }}>
          <strong>{ownerName}</strong> tiene el turno activo. No puedes operar Entregas
          hasta que entregue el turno.
        </p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '12px 0 0' }}>
          Cuando te asignen el relevo, esta pantalla cambiará a “Recibir turno”.
        </p>
        <button
          onClick={onReload}
          style={{
            marginTop: 18, padding: '10px 18px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.textSoft, fontSize: 13, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
          }}
        >
          Refrescar estado
        </button>
      </div>
    </div>
  )
}
