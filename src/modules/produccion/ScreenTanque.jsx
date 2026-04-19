// ScreenTanque — Operador Barras: mapa físico del tanque + cosecha + incidentes
// Route: /produccion/tanque/:machineId
//
// Layout del grid: filas por número, columnas A y B (como está en planta):
//   A1  B1
//   A2  B2
//   ...
//   A12 B12
//
// Backend:
//   GET  /pwa-prod/slots?machine_id=:id → { slots, tank, next_ready_id }
//   POST /pwa-prod/harvest               → action_cosechar (bypass controlador)
//   POST /pwa-prod/tank-incident         → mail.message en gf.production.machine

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { listSlots, harvest, reportIncident, INCIDENT_TYPES } from './barraService'
import { getTodayDateKey } from '../supervision/brineReadings'

// ── Colores por estado ───────────────────────────────────────────────────────
const STATE_META = {
  draft:     { label: 'Vacio',      bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' },
  freezing:  { label: 'Congelando', bg: 'rgba(43,143,224,0.14)',  border: 'rgba(97,178,255,0.35)',  color: '#61b2ff' },
  ready:     { label: 'Lista',      bg: 'rgba(34,197,94,0.16)',   border: 'rgba(34,197,94,0.40)',   color: '#22c55e' },
  harvested: { label: 'Cosechada',  bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.30)' },
}
const stateMeta = s => STATE_META[s] || STATE_META.draft

// Parse "A7" → { col: 'A', row: 7 } ; unrecognised → null
function parseSlotName(name) {
  const m = String(name || '').match(/^([A-Za-z])(\d+)$/)
  if (!m) return null
  return { col: m[1].toUpperCase(), row: parseInt(m[2], 10) }
}

export default function ScreenTanque() {
  const navigate = useNavigate()
  const { machineId: machineIdParam } = useParams()
  const machineId = Number(machineIdParam) || 0
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [slots, setSlots] = useState([])
  const [tank, setTank] = useState(null)
  const [nextReadyId, setNextReadyId] = useState(null)

  const [harvestSlot, setHarvestSlot] = useState(null)
  const [harvestTemp, setHarvestTemp] = useState('')
  const [harvestBusy, setHarvestBusy] = useState(false)

  const [incidentOpen, setIncidentOpen] = useState(false)
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPES[0].id)
  const [incidentDesc, setIncidentDesc] = useState('')
  const [incidentBusy, setIncidentBusy] = useState(false)

  useEffect(() => {
    if (!machineId) {
      navigate('/produccion/tanque', { replace: true })
      return
    }
    load()
    // eslint-disable-next-line
  }, [machineId])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await listSlots(machineId)
      setSlots(Array.isArray(res?.slots) ? res.slots : [])
      setTank(res?.tank || null)
      setNextReadyId(res?.next_ready_id || null)
    } catch (e) {
      setError(e.message || 'Error al cargar el tanque')
    } finally {
      setLoading(false)
    }
  }

  // ── Construir grid físico: filas numéricas × columnas [A, B, …] ────────────
  // Usa slot_columns/slot_rows del tanque; si no hay data, deriva de los slots.
  const gridLayout = useMemo(() => {
    const parsed = slots
      .map(s => ({ slot: s, pos: parseSlotName(s.name) }))
      .filter(x => x.pos)

    // Columnas presentes (A, B, ...)
    const colsFromSlots = Array.from(new Set(parsed.map(x => x.pos.col))).sort()
    const nCols = tank?.slot_columns || colsFromSlots.length || 2
    const columns = colsFromSlots.length
      ? colsFromSlots.slice(0, nCols)
      : Array.from({ length: nCols }, (_, i) => String.fromCharCode(65 + i))

    // Filas presentes (1..N)
    const rowsFromSlots = Array.from(new Set(parsed.map(x => x.pos.row))).sort((a, b) => a - b)
    const nRows = tank?.slot_rows || rowsFromSlots.length || 12
    const rows = rowsFromSlots.length ? rowsFromSlots.slice(0, nRows) : Array.from({ length: nRows }, (_, i) => i + 1)

    // Mapa { "A7": slot }
    const byName = Object.fromEntries(parsed.map(x => [`${x.pos.col}${x.pos.row}`, x.slot]))

    return { columns, rows, byName }
  }, [slots, tank])

  const counts = useMemo(() => {
    const c = { freezing: 0, ready: 0, harvested: 0, draft: 0 }
    slots.forEach(s => { c[s.state] = (c[s.state] || 0) + 1 })
    return c
  }, [slots])

  function openHarvest(slot) {
    if (!slot || slot.state !== 'ready') return
    setHarvestSlot(slot)
    setHarvestTemp(tank?.brine_temp ? String(tank.brine_temp) : '')
    setError('')
  }

  // ── Preflight UX (backend es la autoridad real) ─────────────────────────
  // Los umbrales vienen del tanque (configurados en Odoo por Sebastián).
  // Si el backend no los expone, no se muestran avisos: backend igual valida.
  const tempThreshold = tank?.min_brine_temp_for_harvest  // e.g., -7
  const saltThreshold = tank?.min_salt_level_for_harvest  // e.g., 65 ppm
  const saltUnit = tank?.salt_level_unit || 'ppm'

  function getHarvestWarnings() {
    const warnings = []
    // 1) Temperatura — solo advertir si se capturó y excede umbral
    const temp = parseFloat(harvestTemp)
    if (!harvestTemp || isNaN(temp)) {
      warnings.push({ key: 'temp_missing', msg: 'Ingresa la temperatura de salmuera', blocking: true })
    } else if (tempThreshold != null && temp > tempThreshold) {
      warnings.push({ key: 'temp_high', msg: `Temperatura ${temp}°C > ${tempThreshold}°C. Backend rechazará.`, blocking: true })
    }
    // 2) Sal — solo si el tanque reporta umbral
    if (saltThreshold != null) {
      const saltVal = tank?.salt_level || 0
      if (!tank?.salt_level_updated_at) {
        warnings.push({ key: 'salt_missing', msg: 'Sin revisión de sal del día. Registra la lectura antes de extraer.', blocking: true })
      } else {
        const updatedDate = String(tank.salt_level_updated_at).substring(0, 10)
        const today = getTodayDateKey()
        if (updatedDate < today) {
          warnings.push({ key: 'salt_old', msg: 'La revisión de sal no es de hoy. Registra una nueva lectura.', blocking: true })
        } else if (saltVal < saltThreshold) {
          warnings.push({ key: 'salt_low', msg: `Sal ${saltVal} ${saltUnit} < mínimo ${saltThreshold}. Backend rechazará.`, blocking: true })
        }
      }
    }
    return warnings
  }

  const harvestWarnings = harvestSlot ? getHarvestWarnings() : []
  const hasBlockingWarning = harvestWarnings.some(w => w.blocking)
  const canHarvest = harvestSlot && !hasBlockingWarning && !harvestBusy

  async function confirmHarvest() {
    if (!canHarvest) return
    setHarvestBusy(true); setError('')
    try {
      await harvest(harvestSlot.id, harvestTemp)
      setSuccess(`Canastilla ${harvestSlot.name} cosechada`)
      setHarvestSlot(null)
      setHarvestTemp('')
      await load()
      setTimeout(() => setSuccess(''), 2500)
    } catch (e) {
      setError(e.message || 'Error al cosechar')
    } finally {
      setHarvestBusy(false)
    }
  }

  async function confirmIncident() {
    if (!incidentType) return
    setIncidentBusy(true); setError('')
    try {
      await reportIncident(machineId, incidentType, incidentDesc)
      setSuccess('Incidencia reportada')
      setIncidentOpen(false)
      setIncidentType(INCIDENT_TYPES[0].id)
      setIncidentDesc('')
      setTimeout(() => setSuccess(''), 2500)
    } catch (e) {
      setError(e.message || 'Error al reportar incidencia')
    } finally {
      setIncidentBusy(false)
    }
  }

  // Expected harvest weight per canister: bars_per_basket × kg_per_bar
  const expectedKgPerBasket = tank
    ? (Number(tank.bars_per_basket || 0) * Number(tank.kg_per_bar || 0))
    : 0

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
        button { border: none; background: none; cursor: pointer; font-family: 'DM Sans', sans-serif; }
        input, textarea, select { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulseReady {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
          50%      { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
        }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/produccion/tanque')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>TANQUE</p>
            <p style={{ ...typo.title, color: TOKENS.colors.textSoft, margin: 0 }}>
              {tank?.display_name || tank?.name || 'Cargando...'}
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Info del tanque */}
            {tank && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.md,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Info label="Producto" value={tank.product_name || '—'} typo={typo} wide />
                  <Info label="Línea" value={tank.line_name || '—'} typo={typo} />
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
                  paddingTop: 10, borderTop: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <MiniStat label="Barras/cnst" value={tank.bars_per_basket || '—'} typo={typo} />
                  <MiniStat label="Kg/barra"    value={tank.kg_per_bar || '—'} typo={typo} />
                  <MiniStat label="Kg/cnst"     value={expectedKgPerBasket || '—'} typo={typo} />
                </div>
              </div>
            )}

            {/* Condiciones actuales vs mínimo requerido (del backend) */}
            {tank && (tempThreshold != null || saltThreshold != null) && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.md,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>
                  CONDICIONES PARA EXTRAER
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tempThreshold != null && (() => {
                    const cur = tank.brine_temp
                    const ok = cur != null && cur !== 0 && cur <= tempThreshold
                    const missing = !cur
                    const color = missing ? TOKENS.colors.textMuted : ok ? TOKENS.colors.success : TOKENS.colors.error
                    return (
                      <ConditionRow
                        label="Temperatura salmuera"
                        actual={missing ? '—' : `${cur}°C`}
                        req={`máx. ${tempThreshold}°C`}
                        status={missing ? 'missing' : ok ? 'ok' : 'bad'}
                        color={color}
                        typo={typo}
                      />
                    )
                  })()}
                  {saltThreshold != null && (() => {
                    const cur = tank.salt_level
                    const todayStr = getTodayDateKey()
                    const updStr = tank.salt_level_updated_at ? String(tank.salt_level_updated_at).substring(0, 10) : ''
                    const isToday = updStr === todayStr
                    const missing = !cur || !isToday
                    const ok = !missing && cur >= saltThreshold
                    const color = missing ? TOKENS.colors.warning : ok ? TOKENS.colors.success : TOKENS.colors.error
                    const hint = !cur ? 'sin lectura' : !isToday ? 'no es de hoy' : null
                    return (
                      <ConditionRow
                        label={`Nivel de sal (${saltUnit})`}
                        actual={cur ? `${Number(cur).toFixed(1)} ${saltUnit}` : '—'}
                        req={`mín. ${saltThreshold} ${saltUnit}`}
                        status={missing ? 'missing' : ok ? 'ok' : 'bad'}
                        color={color}
                        hint={hint}
                        typo={typo}
                      />
                    )
                  })()}
                </div>
              </div>
            )}

            {/* Resumen por estado */}
            <div style={{
              padding: 12, borderRadius: TOKENS.radius.md,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
              display: 'flex', justifyContent: 'space-around', gap: 8,
            }}>
              <Stat label="Listas"     value={counts.ready}     color={STATE_META.ready.color}    typo={typo} />
              <Stat label="Congelando" value={counts.freezing}  color={STATE_META.freezing.color} typo={typo} />
              <Stat label="Cosechadas" value={counts.harvested} color={TOKENS.colors.textLow}     typo={typo} />
            </div>

            {/* Siguiente a cosechar */}
            {nextReadyId && (() => {
              const s = slots.find(x => x.id === nextReadyId)
              if (!s) return null
              return (
                <button onClick={() => openHarvest(s)} style={{
                  padding: 14, borderRadius: TOKENS.radius.lg, textAlign: 'left',
                  background: 'linear-gradient(90deg, rgba(34,197,94,0.22), rgba(34,197,94,0.08))',
                  border: '1px solid rgba(34,197,94,0.40)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: TOKENS.radius.md,
                    background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'pulseReady 1.6s ease-in-out infinite',
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ ...typo.overline, color: '#22c55e', margin: 0 }}>SIGUIENTE A COSECHAR</p>
                    <p style={{ ...typo.h2, color: 'white', margin: 0, marginTop: 2 }}>Canastilla {s.name}</p>
                    {s.time_in_ready_hours > 0 && (
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                        Lista hace {s.time_in_ready_hours.toFixed(1)}h
                      </p>
                    )}
                  </div>
                </button>
              )
            })()}

            {/* Mapa físico del tanque */}
            <SectionLabel text="MAPA DEL TANQUE" typo={typo} />
            {slots.length === 0 ? (
              <div style={{
                padding: 20, borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center',
              }}>Sin canastillas registradas</div>
            ) : (
              <div style={{
                background: TOKENS.glass.panelSoft,
                border: `1px solid ${TOKENS.colors.border}`,
                borderRadius: TOKENS.radius.lg,
                padding: 12,
              }}>
                {/* Header de columnas */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `28px repeat(${gridLayout.columns.length}, 1fr)`,
                  gap: 8, marginBottom: 8,
                }}>
                  <div />
                  {gridLayout.columns.map(col => (
                    <div key={col} style={{
                      ...typo.overline, color: TOKENS.colors.textLow,
                      textAlign: 'center',
                    }}>{col}</div>
                  ))}
                </div>
                {/* Filas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {gridLayout.rows.map(rowNum => (
                    <div key={rowNum} style={{
                      display: 'grid',
                      gridTemplateColumns: `28px repeat(${gridLayout.columns.length}, 1fr)`,
                      gap: 8, alignItems: 'center',
                    }}>
                      <div style={{
                        ...typo.overline, color: TOKENS.colors.textLow,
                        textAlign: 'right', paddingRight: 2,
                      }}>{rowNum}</div>
                      {gridLayout.columns.map(col => {
                        const slot = gridLayout.byName[`${col}${rowNum}`]
                        if (!slot) return <div key={col} />
                        const meta = stateMeta(slot.state)
                        const isNext = slot.id === nextReadyId
                        const clickable = slot.state === 'ready'
                        return (
                          <button
                            key={col}
                            onClick={() => clickable && openHarvest(slot)}
                            disabled={!clickable}
                            style={{
                              aspectRatio: '1.5',
                              borderRadius: TOKENS.radius.sm,
                              background: meta.bg,
                              border: `1px solid ${isNext ? '#22c55e' : meta.border}`,
                              padding: 4,
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center',
                              cursor: clickable ? 'pointer' : 'default',
                              opacity: slot.state === 'harvested' ? 0.5 : 1,
                              boxShadow: isNext ? '0 0 0 2px rgba(34,197,94,0.35)' : 'none',
                            }}
                          >
                            <span style={{ fontSize: 14, fontWeight: 700, color: meta.color, lineHeight: 1 }}>
                              {slot.name}
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 600, color: meta.color, marginTop: 3,
                              opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.04em',
                            }}>{meta.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botón incidencia */}
            <button
              onClick={() => { setIncidentOpen(true); setError('') }}
              style={{
                marginTop: 4, padding: '14px',
                borderRadius: TOKENS.radius.lg,
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.30)',
                color: TOKENS.colors.warning,
                fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Reportar incidencia
            </button>

            {error && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
                color: TOKENS.colors.error, ...typo.caption, textAlign: 'center',
              }}>{error}</div>
            )}
            {success && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                color: TOKENS.colors.success, ...typo.caption, textAlign: 'center',
              }}>{success}</div>
            )}

            <div style={{ height: 24 }} />
          </div>
        )}
      </div>

      {/* Modal Cosecha */}
      {harvestSlot && (
        <Modal onClose={() => !harvestBusy && setHarvestSlot(null)}>
          <p style={{ ...typo.overline, color: TOKENS.colors.blue3, margin: 0 }}>COSECHAR CANASTILLA</p>
          <p style={{ ...typo.h1, color: 'white', margin: 0, marginTop: 4 }}>{harvestSlot.name}</p>

          <div style={{
            marginTop: 10, padding: 10, borderRadius: TOKENS.radius.sm,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
          }}>
            <MiniStat label="Barras" value={tank?.bars_per_basket || '—'} typo={typo} />
            <MiniStat label="Kg/barra" value={tank?.kg_per_bar || '—'} typo={typo} />
            <MiniStat label="Kg total" value={expectedKgPerBasket || '—'} typo={typo} />
          </div>
          {(harvestSlot.product_name || tank?.product_name) && (
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 8 }}>
              Producto: <span style={{ color: TOKENS.colors.textSoft, fontWeight: 600 }}>
                {harvestSlot.product_name || tank?.product_name}
              </span>
            </p>
          )}
          {harvestSlot.time_in_ready_hours > 0 && (
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
              Lista hace {harvestSlot.time_in_ready_hours.toFixed(1)}h
            </p>
          )}

          <div style={{ marginTop: 16 }}>
            <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
              Temperatura de salmuera (°C)
            </label>
            <input
              type="number" inputMode="decimal" step="0.1"
              value={harvestTemp}
              onChange={e => setHarvestTemp(e.target.value)}
              placeholder="-10.5"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: TOKENS.radius.md,
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                color: 'white', fontSize: 18, fontWeight: 700, outline: 'none',
              }}
            />
          </div>

          {/* Advertencias preflight (backend valida de nuevo al extraer) */}
          {harvestWarnings.length > 0 && (
            <div style={{
              marginTop: 12, padding: 10, borderRadius: TOKENS.radius.sm,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {harvestWarnings.map(b => (
                <div key={b.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ color: TOKENS.colors.error, fontSize: 14, lineHeight: 1.3 }}>&#x26D4;</span>
                  <span style={{ ...typo.caption, color: TOKENS.colors.error, fontWeight: 600 }}>{b.msg}</span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 10, padding: 10, borderRadius: TOKENS.radius.sm,
              background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
              color: TOKENS.colors.error, ...typo.caption, textAlign: 'center',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              onClick={() => setHarvestSlot(null)} disabled={harvestBusy}
              style={{
                flex: 1, padding: '12px', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                color: TOKENS.colors.textSoft, fontSize: 14, fontWeight: 600,
              }}
            >Cancelar</button>
            <button
              onClick={confirmHarvest} disabled={!canHarvest}
              style={{
                flex: 1, padding: '12px', borderRadius: TOKENS.radius.md,
                background: canHarvest ? 'linear-gradient(90deg, #16a34a, #22c55e)' : TOKENS.colors.surface,
                color: canHarvest ? 'white' : TOKENS.colors.textLow,
                fontSize: 14, fontWeight: 700,
                opacity: harvestBusy ? 0.6 : 1,
              }}
            >{harvestBusy ? 'Cosechando...' : !canHarvest ? 'Corrige para extraer' : 'Cosechar'}</button>
          </div>
        </Modal>
      )}

      {/* Modal Incidencia */}
      {incidentOpen && (
        <Modal onClose={() => !incidentBusy && setIncidentOpen(false)}>
          <p style={{ ...typo.overline, color: TOKENS.colors.warning, margin: 0 }}>INCIDENCIA DE TANQUE</p>
          <p style={{ ...typo.h2, color: 'white', margin: 0, marginTop: 4 }}>
            {tank?.display_name || 'Reportar'}
          </p>

          <div style={{ marginTop: 16 }}>
            <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Tipo</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {INCIDENT_TYPES.map(t => {
                const active = incidentType === t.id
                return (
                  <button
                    key={t.id} onClick={() => setIncidentType(t.id)}
                    style={{
                      padding: '12px 14px', borderRadius: TOKENS.radius.sm,
                      background: active ? 'rgba(245,158,11,0.18)' : TOKENS.colors.surface,
                      border: `1px solid ${active ? 'rgba(245,158,11,0.45)' : TOKENS.colors.border}`,
                      color: active ? TOKENS.colors.warning : TOKENS.colors.textSoft,
                      fontSize: 13, fontWeight: 600, textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Descripción</label>
            <textarea
              value={incidentDesc}
              onChange={e => setIncidentDesc(e.target.value)}
              rows={3}
              placeholder="Detalle breve de la incidencia"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                color: 'white', fontSize: 14, outline: 'none', resize: 'vertical',
              }}
            />
          </div>

          {error && (
            <div style={{
              marginTop: 10, padding: 10, borderRadius: TOKENS.radius.sm,
              background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
              color: TOKENS.colors.error, ...typo.caption, textAlign: 'center',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              onClick={() => setIncidentOpen(false)} disabled={incidentBusy}
              style={{
                flex: 1, padding: '12px', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                color: TOKENS.colors.textSoft, fontSize: 14, fontWeight: 600,
              }}
            >Cancelar</button>
            <button
              onClick={confirmIncident} disabled={incidentBusy}
              style={{
                flex: 1, padding: '12px', borderRadius: TOKENS.radius.md,
                background: 'linear-gradient(90deg, #d97706, #f59e0b)',
                color: 'white', fontSize: 14, fontWeight: 700,
                opacity: incidentBusy ? 0.6 : 1,
              }}
            >{incidentBusy ? 'Enviando...' : 'Reportar'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SectionLabel({ text, typo }) {
  return <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0, marginTop: 8 }}>{text}</p>
}

function Stat({ label, value, color, typo }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0, marginTop: 4 }}>{label}</p>
    </div>
  )
}

function MiniStat({ label, value, typo, alert }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{
        fontSize: 16, fontWeight: 800,
        color: alert ? TOKENS.colors.warning : 'white',
        margin: 0, lineHeight: 1,
      }}>{value}</p>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0, marginTop: 4 }}>{label}</p>
    </div>
  )
}

function ConditionRow({ label, actual, req, status, color, hint, typo }) {
  const icon = status === 'ok' ? '\u2714' : status === 'missing' ? '\u26A0' : '\u26D4'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: TOKENS.radius.sm,
      background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}30`,
    }}>
      <span style={{ fontSize: 14, color, width: 18, textAlign: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontWeight: 600 }}>{label}</p>
        <p style={{ margin: 0, marginTop: 2, fontSize: 13 }}>
          <span style={{ color, fontWeight: 700 }}>{actual}</span>
          <span style={{ color: TOKENS.colors.textLow, fontWeight: 500 }}> ({req})</span>
          {hint && <span style={{ color: TOKENS.colors.warning, fontWeight: 600 }}> — {hint}</span>}
        </p>
      </div>
    </div>
  )
}

function Info({ label, value, typo, wide }) {
  return (
    <div style={{ flex: wide ? 2 : 1, minWidth: 0 }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>{label}</p>
      <p style={{
        ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, marginTop: 2,
        fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</p>
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(3,8,17,0.75)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480,
        background: `linear-gradient(180deg, ${TOKENS.colors.bg2} 0%, ${TOKENS.colors.bg1} 100%)`,
        borderTop: `1px solid ${TOKENS.colors.border}`,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 20, paddingBottom: 28,
        boxShadow: '0 -20px 40px rgba(0,0,0,0.4)',
      }}>
        {children}
      </div>
    </div>
  )
}
