// ScreenCicloRolito.jsx — V2 Ciclo Guiado Operador de Rolito
// Flujo de 3 pasos en lugar de 4 campos sueltos:
//   Paso 1: Inicio congelacion → un solo tap "SI, EMPEZO AHORA"
//   Paso 2: Fin congelacion + inicio deshielo → un solo tap
//   Paso 3: Fin deshielo + kg producidos → confirmar descarga
// Si ya hay un ciclo activo, muestra el paso correspondiente.
import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getShiftOverview,
  getActiveCycle,
  getCycleProgress,
  startFreeze,
  markDefrost,
  markDump,
  EXPECTED_KG_PER_CYCLE,
  CYCLE_STATES,
  fmtTime,
} from './rolitoService'
import {
  validateRolitoKg,
  ROLITO_KG_MIN,
  ROLITO_KG_MAX,
  ROLITO_KG_TARGET,
} from './productionRules'
import { validateSupervisorPin } from '../shared/supervisorAuth'

export default function ScreenCicloRolito() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [shift, setShift] = useState(null)
  const [cycles, setCycles] = useState([])
  const [activeCycle, setActiveCycle] = useState(null)
  const [bagMaterials, setBagMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [kgDumped, setKgDumped] = useState(String(EXPECTED_KG_PER_CYCLE))
  const [tick, setTick] = useState(0)
  const timerRef = useRef(null)
  // Override supervisor (PIN / validacion) para kg fuera de rango
  const [supervisorOverride, setSupervisorOverride] = useState(false)
  const [overrideSupervisorId, setOverrideSupervisorId] = useState(null)
  const [overridePin, setOverridePin] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [validatingPin, setValidatingPin] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setError('')
      const result = await getShiftOverview()
      setShift(result.shift)
      setCycles(result.cycles || [])
      setActiveCycle(getActiveCycle(result.cycles))
      setBagMaterials(result.bagMaterials || [])
    } catch (e) {
      setError('No se pudo cargar el turno')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Countdown
  useEffect(() => {
    if (activeCycle) {
      timerRef.current = setInterval(() => setTick(t => t + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [activeCycle])

  const progress = getCycleProgress(activeCycle)
  const totalBagsAvailable = bagMaterials.reduce((sum, item) => sum + (Number(item.remaining) || 0), 0)

  // Determine current step
  let step = 'start' // no active cycle → start new
  if (activeCycle?.state === 'freezing') step = 'freezing'
  if (activeCycle?.state === 'defrosting') step = 'defrosting'

  // ── STEP 1: Start Freeze ──────────────────────────────────────────────────
  async function handleStartFreeze() {
    if (!shift?.id) return
    setSaving(true)
    setError('')
    try {
      await startFreeze(shift.id)
      setSuccess('Congelacion iniciada')
      setTimeout(() => { setSuccess(''); navigate('/produccion') }, 1200)
    } catch (e) {
      setError(e.message || 'Error al iniciar ciclo')
    } finally {
      setSaving(false)
    }
  }

  // ── STEP 2: End Freeze + Start Defrost ────────────────────────────────────
  async function handleMarkDefrost() {
    if (!activeCycle?.id) return
    setSaving(true)
    setError('')
    try {
      await markDefrost(activeCycle.id)
      setSuccess('Deshielo iniciado')
      await loadData()
      setTimeout(() => setSuccess(''), 2000)
    } catch (e) {
      setError(e.message || 'Error al marcar deshielo')
    } finally {
      setSaving(false)
    }
  }

  // ── STEP 3: End Defrost + Dump ────────────────────────────────────────────
  async function handleMarkDump() {
    const kg = parseFloat(kgDumped)
    const validation = validateRolitoKg(kg, { target: activeCycle?.kg_expected })

    // Backend es la unica autoridad de rechazo. Frontend solo rechaza kg<=0
    // (donde el backend tambien rechaza via _check_kg_dumped_positive).
    // Fuera de rango es warning visible, pero el operador puede confirmar.
    if (!validation.ok) {
      setError(validation.reason)
      return
    }
    if (!activeCycle?.id) return

    setSaving(true)
    setError('')
    try {
      // Si hay override, incluir en el payload como marca de excepcion.
      // Se envia el id del supervisor validado por backend (trazabilidad).
      const extraData = supervisorOverride
        ? {
            supervisor_override: true,
            override_reason: overrideReason || '',
            supervisor_employee_id: overrideSupervisorId || undefined,
          }
        : undefined
      await markDump(activeCycle.id, kg, extraData)
      const overrideMsg = supervisorOverride ? ' (validado por supervisor)' : ''
      setSuccess(`Ciclo completado: ${kg} kg${overrideMsg}`)
      setTimeout(() => navigate('/produccion/empaque'), 1500)
    } catch (e) {
      setError(e.message || 'Error al registrar descarga')
    } finally {
      setSaving(false)
    }
  }

  async function applyOverride() {
    // Validacion contra backend real — /api/production/validate-pin
    // (no se acepta ningun PIN local: si backend rechaza, se bloquea).
    if (!overrideReason || overrideReason.trim().length < 5) {
      setError('Razon obligatoria (minimo 5 caracteres)')
      return
    }
    setValidatingPin(true)
    setError('')
    try {
      const res = await validateSupervisorPin(overridePin)
      if (!res?.ok) {
        setError(res?.error || 'PIN incorrecto')
        return
      }
      setOverrideSupervisorId(res.employee_id || null)
      setSupervisorOverride(true)
      setShowOverrideForm(false)
      setOverridePin('')
    } catch (e) {
      setError(e?.message || 'Error validando PIN')
    } finally {
      setValidatingPin(false)
    }
  }

  // ── Freeze time warning ───────────────────────────────────────────────────
  const freezeWarning = progress?.phase === 'freezing' && progress.elapsedMin < 5
    ? 'Congelacion muy corta. ¿Seguro que termino?'
    : progress?.phase === 'freezing' && progress.elapsedMin > 60
      ? 'Tiempo largo. Verifica que todo este bien.'
      : null

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
        input { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/produccion')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Ciclo de Congelacion</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !shift ? (
          <div style={{ padding: 24, textAlign: 'center', ...typo.body, color: TOKENS.colors.textMuted }}>
            Sin turno activo
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Step indicator */}
            <div style={{ display: 'flex', gap: 4, padding: '0 4px' }}>
              {['Congelar', 'Deshielo', 'Descarga'].map((s, i) => {
                const stepIdx = step === 'start' ? 0 : step === 'freezing' ? 1 : 2
                const active = i === stepIdx
                const done = i < stepIdx
                return (
                  <div key={s} style={{ flex: 1 }}>
                    <div style={{
                      height: 4, borderRadius: 2, marginBottom: 6,
                      background: done ? TOKENS.colors.success : active ? TOKENS.colors.blue2 : 'rgba(255,255,255,0.08)',
                    }} />
                    <p style={{ ...typo.caption, margin: 0, textAlign: 'center',
                      color: active ? TOKENS.colors.blue2 : done ? TOKENS.colors.success : TOKENS.colors.textLow,
                      fontWeight: active ? 700 : 500,
                    }}>{s}</p>
                  </div>
                )
              })}
            </div>

            {/* ── STEP: START (no active cycle) ──────────────── */}
            {step === 'start' && (
              <div style={{
                padding: 24, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
                textAlign: 'center',
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>
                  CICLO #{(cycles.filter(c => c.state === 'dumped').length) + 1}
                </p>
                <p style={{ ...typo.h1, color: TOKENS.colors.text, margin: 0, marginBottom: 8 }}>
                  ¿Empezo a congelar?
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginBottom: 20 }}>
                  Se registra la hora actual como inicio
                </p>
                <div style={{
                  padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 16,
                  background: totalBagsAvailable > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${totalBagsAvailable > 0 ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
                }}>
                  <p style={{ ...typo.caption, margin: 0, fontWeight: 700, color: totalBagsAvailable > 0 ? TOKENS.colors.success : TOKENS.colors.warning }}>
                    {totalBagsAvailable > 0
                      ? `${totalBagsAvailable} bolsas disponibles para producir`
                      : 'No hay bolsas disponibles en el turno'}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    {totalBagsAvailable > 0
                      ? 'Ya puedes iniciar el siguiente ciclo'
                      : 'Recibe y valida bolsa antes de iniciar produccion'}
                  </p>
                </div>
                <button
                  onClick={handleStartFreeze}
                  disabled={saving || totalBagsAvailable <= 0}
                  style={{
                    width: '100%', padding: '18px', borderRadius: TOKENS.radius.lg,
                    background: totalBagsAvailable > 0 ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                    color: totalBagsAvailable > 0 ? 'white' : TOKENS.colors.textLow,
                    fontSize: 18, fontWeight: 700,
                    boxShadow: totalBagsAvailable > 0 ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Iniciando...' : totalBagsAvailable > 0 ? 'SI, EMPEZO AHORA' : 'SIN BOLSA DISPONIBLE'}
                </button>
              </div>
            )}

            {/* ── STEP: FREEZING ─────────────────────────────── */}
            {step === 'freezing' && progress && (
              <div style={{
                padding: 20, borderRadius: TOKENS.radius.xl,
                background: `linear-gradient(180deg, ${TOKENS.colors.blue2}18, rgba(255,255,255,0.02))`,
                border: `1px solid ${TOKENS.colors.blue2}30`,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>
                  CICLO #{activeCycle.cycle_number || '?'} &middot; CONGELANDO
                </p>
                {/* Countdown */}
                <div style={{ textAlign: 'center', margin: '16px 0' }}>
                  <p style={{
                    fontSize: 44, fontWeight: 700, margin: 0, letterSpacing: '-0.04em',
                    color: progress.isOverdue ? TOKENS.colors.error : TOKENS.colors.text,
                    animation: progress.isOverdue ? 'pulse 1.5s ease infinite' : 'none',
                  }}>
                    {progress.isOverdue ? '+' : ''}{progress.remainingMin}:{String(progress.remainingSec).padStart(2, '0')}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                    {progress.isOverdue ? 'Tiempo cumplido' : `Faltan para terminar (de ${progress.expectedMin} min)`}
                  </p>
                </div>
                {/* Progress bar */}
                <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{
                    height: '100%', borderRadius: 5, transition: 'width 1s linear',
                    width: `${progress.progressPct}%`,
                    background: progress.isOverdue ? TOKENS.colors.error
                      : progress.progressPct >= 80 ? TOKENS.colors.warning : TOKENS.colors.blue2,
                  }} />
                </div>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center', marginBottom: 16 }}>
                  Inicio: {fmtTime(activeCycle.freeze_start)} &middot; {progress.elapsedMin} min transcurridos
                </p>

                {/* Warning if too short/long */}
                {freezeWarning && (
                  <div style={{
                    padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
                    background: TOKENS.colors.warningSoft, border: '1px solid rgba(245,158,11,0.3)',
                  }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0, fontWeight: 600 }}>
                      {freezeWarning}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleMarkDefrost}
                  disabled={saving}
                  style={{
                    width: '100%', padding: '18px', borderRadius: TOKENS.radius.lg,
                    background: progress.isOverdue
                      ? 'linear-gradient(90deg, #dc2626, #ef4444)'
                      : 'linear-gradient(90deg, #f59e0b, #eab308)',
                    color: 'white', fontSize: 16, fontWeight: 700,
                    boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Guardando...' : 'TERMINO DE CONGELAR → DESHIELO'}
                </button>
              </div>
            )}

            {/* ── STEP: DEFROSTING ───────────────────────────── */}
            {step === 'defrosting' && progress && (
              <div style={{
                padding: 20, borderRadius: TOKENS.radius.xl,
                background: `linear-gradient(180deg, ${TOKENS.colors.warning}18, rgba(255,255,255,0.02))`,
                border: `1px solid ${TOKENS.colors.warning}30`,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>
                  CICLO #{activeCycle.cycle_number || '?'} &middot; DESHIELO
                </p>
                {/* Countdown */}
                <div style={{ textAlign: 'center', margin: '16px 0' }}>
                  <p style={{
                    fontSize: 44, fontWeight: 700, margin: 0, letterSpacing: '-0.04em',
                    color: progress.isOverdue ? TOKENS.colors.success : TOKENS.colors.warning,
                  }}>
                    {progress.isOverdue ? '0:00' : `${progress.remainingMin}:${String(progress.remainingSec).padStart(2, '0')}`}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                    {progress.isOverdue ? 'Deshielo completo — registra la descarga' : `Faltan (de ${progress.expectedMin} min)`}
                  </p>
                </div>
                {/* Progress bar */}
                <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{
                    height: '100%', borderRadius: 5, transition: 'width 1s linear',
                    width: `${progress.progressPct}%`,
                    background: progress.isOverdue ? TOKENS.colors.success : TOKENS.colors.warning,
                  }} />
                </div>

                {/* Kg input */}
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>KG PRODUCIDOS</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <button onClick={() => setKgDumped(v => String(Math.max(0, (parseFloat(v) || 0) - 50)))}
                    style={{
                      width: 48, height: 48, borderRadius: TOKENS.radius.md,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 24, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>-</button>
                  <input
                    type="number" inputMode="numeric"
                    value={kgDumped}
                    onChange={e => setKgDumped(e.target.value)}
                    style={{
                      flex: 1, padding: '12px', borderRadius: TOKENS.radius.md,
                      background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                      color: 'white', fontSize: 28, fontWeight: 700, outline: 'none',
                      textAlign: 'center', letterSpacing: '-0.03em',
                    }}
                  />
                  <button onClick={() => setKgDumped(v => String((parseFloat(v) || 0) + 50))}
                    style={{
                      width: 48, height: 48, borderRadius: TOKENS.radius.md,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 24, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>+</button>
                </div>
                {(() => {
                  const target = Number(activeCycle?.kg_expected) > 0 ? Number(activeCycle.kg_expected) : ROLITO_KG_TARGET
                  const min = Number(activeCycle?.kg_expected) > 0 ? Math.round(target * 0.85 * 10) / 10 : ROLITO_KG_MIN
                  const max = Number(activeCycle?.kg_expected) > 0 ? Math.round(target * 1.20) : ROLITO_KG_MAX
                  return (
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center', marginBottom: 8 }}>
                      Esperado: {target} kg · rango operativo {min}–{max} kg
                    </p>
                  )
                })()}

                {/* Validacion Rolito kg en vivo */}
                {(() => {
                  const v = validateRolitoKg(parseFloat(kgDumped), { target: activeCycle?.kg_expected })
                  if (v.level === 'ok') return null
                  const bg = v.level === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)'
                  const border = v.level === 'error' ? 'rgba(239,68,68,0.30)' : 'rgba(245,158,11,0.30)'
                  const color = v.level === 'error' ? TOKENS.colors.error : TOKENS.colors.warning
                  return (
                    <div style={{
                      padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
                      background: bg, border: `1px solid ${border}`,
                    }}>
                      <p style={{ ...typo.caption, color, margin: 0, fontWeight: 600, textAlign: 'center' }}>
                        {v.reason}
                      </p>
                    </div>
                  )
                })()}

                {supervisorOverride && (
                  <div style={{
                    padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
                    background: 'rgba(43,143,224,0.10)', border: '1px solid rgba(43,143,224,0.30)',
                  }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.blue2, margin: 0, fontWeight: 600, textAlign: 'center' }}>
                      ✓ Validado por supervisor — motivo: {overrideReason}
                    </p>
                  </div>
                )}

                {/* Formulario override supervisor */}
                {showOverrideForm && !supervisorOverride && (
                  <div style={{
                    padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 12,
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
                  }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0, marginBottom: 8, fontWeight: 700 }}>
                      Fuera de rango — requiere validacion supervisor
                    </p>
                    <input
                      type="password" inputMode="numeric"
                      value={overridePin}
                      onChange={e => setOverridePin(e.target.value)}
                      placeholder="PIN supervisor"
                      style={{
                        width: '100%', padding: '10px', borderRadius: TOKENS.radius.sm, marginBottom: 8,
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                        color: 'white', fontSize: 14, outline: 'none',
                      }}
                    />
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={e => setOverrideReason(e.target.value)}
                      placeholder="Motivo (obligatorio)"
                      style={{
                        width: '100%', padding: '10px', borderRadius: TOKENS.radius.sm, marginBottom: 8,
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                        color: 'white', fontSize: 14, outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setShowOverrideForm(false); setOverridePin(''); setOverrideReason('') }}
                        style={{
                          flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm,
                          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                          color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600,
                        }}
                      >Cancelar</button>
                      <button
                        onClick={applyOverride}
                        disabled={validatingPin}
                        style={{
                          flex: 2, padding: '10px', borderRadius: TOKENS.radius.sm,
                          background: 'linear-gradient(90deg, #15499B, #2B8FE0)',
                          color: 'white', fontSize: 13, fontWeight: 700,
                          opacity: validatingPin ? 0.6 : 1,
                        }}
                      >{validatingPin ? 'Validando...' : 'Validar'}</button>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleMarkDump}
                  disabled={(() => {
                    if (saving) return true
                    if (!kgDumped || parseFloat(kgDumped) <= 0) return true
                    const v = validateRolitoKg(parseFloat(kgDumped), { target: activeCycle?.kg_expected })
                    if (!v.ok && !supervisorOverride) return true
                    return false
                  })()}
                  style={(() => {
                    const v = validateRolitoKg(parseFloat(kgDumped), { target: activeCycle?.kg_expected })
                    const allowed = kgDumped && parseFloat(kgDumped) > 0 && (v.ok || supervisorOverride)
                    return {
                      width: '100%', padding: '18px', borderRadius: TOKENS.radius.lg,
                      background: allowed ? 'linear-gradient(90deg, #15803d, #22c55e)' : TOKENS.colors.surface,
                      color: allowed ? 'white' : TOKENS.colors.textLow,
                      fontSize: 16, fontWeight: 700,
                      boxShadow: allowed ? '0 10px 24px rgba(34,197,94,0.25)' : 'none',
                      opacity: saving ? 0.6 : 1,
                    }
                  })()}
                >
                  {saving ? 'Guardando...' : 'CONFIRMAR DESCARGA'}
                </button>
              </div>
            )}

            {/* Messages */}
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
    </div>
  )
}
