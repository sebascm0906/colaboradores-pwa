import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo, TURNO_LABELS } from '../../tokens'
import { getModuleById } from '../registry'
import { resolveModuleContextRole } from '../../lib/roleContext'
import { getMyShift, getCycles, getPackingEntries } from './api'
import { getSaltLevel, listTanks, MACHINE_ID_BARRA } from './barraService'
import OpeningStateBanner from './OpeningStateBanner'

// V2: Rolito users get redirected to the new guided hub
import ScreenTurnoRolito from './ScreenTurnoRolito'

const STATES = {
  draft:       { label: 'Pendiente',   color: TOKENS.colors.textMuted },
  in_progress: { label: 'En progreso', color: TOKENS.colors.blue2 },
  closed:      { label: 'Cerrado',     color: TOKENS.colors.success },
  audited:     { label: 'Auditado',    color: TOKENS.colors.success },
}

export default function ScreenMiTurno() {
  const { session } = useSession()
  const location = useLocation()
  const activeRole = resolveModuleContextRole(
    session,
    getModuleById('registro_produccion'),
    location.state?.selected_role,
  ) || session?.role || ''

  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [shift, setShift] = useState(null)
  const [cycles, setCycles] = useState([])
  const [packing, setPacking] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saltData, setSaltData] = useState(null) // Barra: salt level from machine
  const [tankData, setTankData] = useState(null) // Barra: tank summary (ready count, temp, etc.)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    if (activeRole === 'operador_rolito') return
    loadData()
  }, [activeRole])

  const isBarras = activeRole === 'operador_barra'

  // V2: Rolito operators get the new guided hub
  if (activeRole === 'operador_rolito') {
    return <ScreenTurnoRolito />
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const s = await getMyShift()
      setShift(s)
      if (s?.id) {
        const promises = [getCycles(s.id), getPackingEntries(s.id)]
        if (isBarras) {
          promises.push(getSaltLevel(MACHINE_ID_BARRA).catch(() => null))
          promises.push(listTanks().catch(() => ({ tanks: [] })))
        }
        const results = await Promise.all(promises)
        setCycles(results[0] || [])
        setPacking(results[1] || [])
        if (isBarras) {
          if (results[2]) setSaltData(results[2])
          const tanksRes = results[3]
          if (tanksRes?.tanks?.length) setTankData(tanksRes.tanks[0])
        }
      }
    } catch (e) {
      setError(e.message === 'no_session' ? 'Sesion expirada' : 'No se pudo cargar el turno')
    } finally {
      setLoading(false)
    }
  }

  const totalKgPacked = packing.reduce((sum, p) => sum + (p.total_kg || 0), 0)
  const stateInfo = STATES[shift?.state] || STATES.draft

  // Acciones — orden por flujo real de trabajo
  const ACTIONS = [
    // BARRA: 1. Tanque = acción principal (extraer canastillas)
    ...(isBarras ? [{
      id: 'tanque',
      label: 'Extraer del tanque',
      desc: `${tankData?.ready_slots_count || 0} canastillas listas`,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/>
        </svg>
      ),
      route: '/produccion/tanque',
      color: (tankData?.ready_slots_count || 0) > 0 ? TOKENS.colors.success : '#38bdf8',
    }] : []),
    // 2. Pasar a almacén (después de extraer, fraccionas y envías)
    ...(isBarras ? [{
      id: 'transformacion',
      label: 'Pasar a almacén',
      desc: 'Fraccionar y enviar barras',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      ),
      route: '/produccion/transformacion',
      color: '#a78bfa',
    }] : []),
    // 3. Empaque
    {
      id: 'empaque',
      label: 'Empaque',
      desc: isBarras ? 'Registrar barras' : 'Registrar bolsas',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      ),
      route: '/produccion/empaque',
      color: TOKENS.colors.success,
    },
    // ROLITO/genérico: Producción (tracking de ciclos de congelación)
    ...(!isBarras ? [{
      id: 'ciclo',
      label: 'Nuevo Ciclo',
      desc: 'Congelación + deshielo',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
      ),
      route: '/produccion/ciclo',
      color: TOKENS.colors.blue2,
    }] : []),
    // 4. Reportar problema
    {
      id: 'incidencia',
      label: 'Reportar problema',
      desc: 'Paro, merma o incidencia',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
      route: '/produccion/incidencia',
      color: TOKENS.colors.warning,
    },
    // 6. Inspección (no urgente, al inicio o final del turno)
    {
      id: 'checklist',
      label: 'Inspección',
      desc: 'Checklist HACCP',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      ),
      route: '/produccion/checklist',
      color: TOKENS.colors.textMuted,
    },
    // 7. Corte / Cierre (al final del turno)
    {
      id: 'corte',
      label: 'Resumen del turno',
      desc: 'Resumen de producción',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
        </svg>
      ),
      route: '/produccion/corte',
      color: TOKENS.colors.blue3,
    },
    {
      id: 'cierre',
      label: 'Cerrar turno',
      desc: 'Finalizar y cerrar',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      ),
      route: '/produccion/cierre',
      color: TOKENS.colors.error,
    },
  ]

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
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          paddingTop: 20, paddingBottom: 12,
        }}>
          <button onClick={() => navigate('/')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Registro de Turno</span>
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
            background: TOKENS.colors.errorSoft, border: `1px solid rgba(239,68,68,0.3)`,
            color: TOKENS.colors.error, ...typo.body, textAlign: 'center',
          }}>
            {error}
            <button onClick={loadData} style={{ display: 'block', margin: '10px auto 0', color: TOKENS.colors.blue2, ...typo.caption, textDecoration: 'underline' }}>
              Reintentar
            </button>
          </div>
        )}

        {/* Sin turno activo */}
        {!loading && !error && !shift && (
          <div style={{
            marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl,
            background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F3ED;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.text, marginBottom: 6 }}>Sin turno activo</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>No hay un turno de producción asignado para hoy. Contacta a tu supervisor.</p>
          </div>
        )}

        {/* Turno activo */}
        {!loading && !error && shift && (
          <>
            {/* Card del turno */}
            <div style={{
              marginTop: 8, padding: 18, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 6 }}>TURNO ACTIVO</p>
                  <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>
                    {shift.name || `Turno ${shift.shift_code}`}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>
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

              {/* Mini stats — Barra: métricas operativas reales.
                  Umbrales leídos del tanque (configurados en backend). */}
              {isBarras ? (() => {
                const tempThr = tankData?.min_brine_temp_for_harvest  // e.g., -7
                const saltThr = tankData?.min_salt_level_for_harvest  // e.g., 65 ppm
                const saltUnit = tankData?.salt_level_unit || 'ppm'
                const tempBad = tempThr != null && !!saltData?.brine_temp && saltData.brine_temp > tempThr
                const saltBad = saltThr != null && !!saltData?.salt_level && saltData.salt_level < saltThr
                return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                  {/* Fila 1: canastillas + temp + sal */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <MiniStat
                      label="Canastillas listas"
                      value={tankData?.ready_slots_count ?? '—'}
                      accent={(tankData?.ready_slots_count || 0) > 0 ? TOKENS.colors.success : TOKENS.colors.textMuted}
                      typo={typo}
                    />
                    <MiniStat
                      label="Temp salmuera"
                      value={saltData?.brine_temp ? `${saltData.brine_temp}°C` : '—'}
                      accent={tempBad ? TOKENS.colors.error : TOKENS.colors.blue2}
                      typo={typo}
                    />
                    <MiniStat
                      label={`Sal (${saltUnit})`}
                      value={saltData?.salt_level ? saltData.salt_level : '—'}
                      accent={saltBad ? TOKENS.colors.warning : TOKENS.colors.blue2}
                      typo={typo}
                    />
                  </div>
                  {/* Fila 2: extracciones reales (del tanque) + última extracción */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <MiniStat
                      label="Extrac. 30min"
                      value={tankData?.extractions_last_30min ?? '—'}
                      accent={TOKENS.colors.blue2}
                      typo={typo}
                    />
                    <MiniStat
                      label="Barras/canast."
                      value={tankData?.bars_per_basket || 8}
                      typo={typo}
                    />
                    <MiniStat
                      label="Última extracción"
                      value={tankData?.last_extraction_time
                        ? new Date(tankData.last_extraction_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                      typo={typo}
                    />
                  </div>
                  {/* Alerta de temp o sal (umbrales del tanque) */}
                  {tempBad && (
                    <div style={{
                      padding: '8px 12px', borderRadius: TOKENS.radius.sm,
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 14 }}>&#x26A0;</span>
                      <span style={{ ...typo.caption, color: TOKENS.colors.error, fontWeight: 600 }}>
                        Temperatura {saltData.brine_temp}°C — debe ser {tempThr}°C o menor para extraer
                      </span>
                    </div>
                  )}
                </div>
                )
              })() : (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <MiniStat label="Producciones" value={cycles.length} typo={typo} />
                  <MiniStat label="Producido" value={`${shift.total_kg_produced?.toFixed(0) || '0'} kg`} accent={TOKENS.colors.blue2} typo={typo} />
                  <MiniStat label="Empacado" value={`${totalKgPacked.toFixed(0)} kg`} accent={TOKENS.colors.success} typo={typo} />
                </div>
              )}
            </div>

            {/* Opening State — qué recibe este turno del anterior */}
            <OpeningStateBanner shiftId={shift.id} typo={typo} />

            {/* Barra: CTA principal — ir al tanque */}
            {isBarras && tankData && (tankData.ready_slots_count || 0) > 0 && (
              <button onClick={() => navigate(`/produccion/tanque/${tankData.id}`)} style={{
                marginTop: 12, padding: 14, borderRadius: TOKENS.radius.lg, textAlign: 'left',
                background: 'linear-gradient(90deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))',
                border: '1px solid rgba(34,197,94,0.35)',
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: TOKENS.radius.md,
                  background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.30)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ ...typo.overline, color: '#22c55e', margin: 0 }}>
                    {tankData.ready_slots_count} CANASTILLA{tankData.ready_slots_count > 1 ? 'S' : ''} LISTA{tankData.ready_slots_count > 1 ? 'S' : ''}
                  </p>
                  <p style={{ ...typo.body, color: 'white', margin: 0, marginTop: 2, fontWeight: 600 }}>
                    Ir al tanque a extraer
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            )}

            {/* Acciones */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 20, marginBottom: 12 }}>ACCIONES</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACTIONS.map(action => (
                <ActionCard key={action.id} action={action} typo={typo} onClick={() => navigate(action.route)} />
              ))}
            </div>

            {/* Últimos ciclos */}
            {cycles.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>ÚLTIMAS PRODUCCIONES</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cycles.slice(-3).reverse().map((c, i) => (
                    <CycleRow key={c.id || i} cycle={c} typo={typo} />
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

function MiniStat({ label, value, accent, typo }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, borderRadius: TOKENS.radius.md,
      padding: '10px', background: TOKENS.glass.panelSoft,
      border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: typo.h2.fontSize - 2, fontWeight: 700, color: accent || TOKENS.colors.text, letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  )
}

function ActionCard({ action, typo, onClick }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: TOKENS.radius.lg,
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        boxShadow: pressed ? 'none' : TOKENS.shadow.soft,
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        transition: `transform ${TOKENS.motion.fast}, box-shadow ${TOKENS.motion.fast}`,
        width: '100%', textAlign: 'left',
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: TOKENS.radius.md,
        background: `${action.color}14`, border: `1px solid ${action.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: action.color, flexShrink: 0,
      }}>
        {action.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{action.label}</p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{action.desc}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </button>
  )
}

const CYCLE_STATES = {
  freezing:   { label: 'Congelando', color: TOKENS.colors.blue2 },
  defrosting: { label: 'Deshielando', color: TOKENS.colors.warning },
  dumped:     { label: 'Completado', color: TOKENS.colors.success },
  cancelled:  { label: 'Cancelado', color: TOKENS.colors.error },
}

function CycleRow({ cycle, typo }) {
  const st = CYCLE_STATES[cycle.state] || CYCLE_STATES.freezing
  const timeStr = cycle.freeze_start ? new Date(cycle.freeze_start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '--:--'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: `${st.color}14`, border: `1px solid ${st.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color: st.color,
      }}>
        {cycle.cycle_number || '#'}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>
          Prod. {cycle.cycle_number} &middot; {timeStr}
        </p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
          {cycle.kg_dumped ? `${cycle.kg_dumped} kg` : 'En proceso'}
        </p>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: `${st.color}14`, padding: '2px 8px', borderRadius: TOKENS.radius.pill }}>
        {st.label}
      </span>
    </div>
  )
}
