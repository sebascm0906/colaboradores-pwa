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

export default function ScreenCicloRolito() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [shift, setShift] = useState(null)
  const [cycles, setCycles] = useState([])
  const [activeCycle, setActiveCycle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [kgDumped, setKgDumped] = useState(String(EXPECTED_KG_PER_CYCLE))
  const [tick, setTick] = useState(0)
  const timerRef = useRef(null)

  const loadData = useCallback(async () => {
    try {
      setError('')
      const result = await getShiftOverview()
      setShift(result.shift)
      setCycles(result.cycles || [])
      setActiveCycle(getActiveCycle(result.cycles))
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
    if (!kg || kg <= 0) { setError('Ingresa los kg producidos (mayor a 0)'); return }
    if (!activeCycle?.id) return
    setSaving(true)
    setError('')
    try {
      await markDump(activeCycle.id, kg)
      setSuccess(`Ciclo completado: ${kg} kg`)
      setTimeout(() => navigate('/produccion/empaque'), 1500)
    } catch (e) {
      setError(e.message || 'Error al registrar descarga')
    } finally {
      setSaving(false)
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
                <button
                  onClick={handleStartFreeze}
                  disabled={saving}
                  style={{
                    width: '100%', padding: '18px', borderRadius: TOKENS.radius.lg,
                    background: 'linear-gradient(90deg, #15499B, #2B8FE0)',
                    color: 'white', fontSize: 18, fontWeight: 700,
                    boxShadow: '0 10px 24px rgba(21,73,155,0.30)',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Iniciando...' : 'SI, EMPEZO AHORA'}
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
                  <button onClick={() => setKgDumped(v => String(Math.max(0, (parseInt(v) || 0) - 50)))}
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
                  <button onClick={() => setKgDumped(v => String((parseInt(v) || 0) + 50))}
                    style={{
                      width: 48, height: 48, borderRadius: TOKENS.radius.md,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 24, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>+</button>
                </div>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center', marginBottom: 16 }}>
                  Esperado: {EXPECTED_KG_PER_CYCLE} kg por ciclo
                </p>

                <button
                  onClick={handleMarkDump}
                  disabled={saving || !kgDumped || parseFloat(kgDumped) <= 0}
                  style={{
                    width: '100%', padding: '18px', borderRadius: TOKENS.radius.lg,
                    background: (kgDumped && parseFloat(kgDumped) > 0)
                      ? 'linear-gradient(90deg, #15803d, #22c55e)'
                      : TOKENS.colors.surface,
                    color: (kgDumped && parseFloat(kgDumped) > 0) ? 'white' : TOKENS.colors.textLow,
                    fontSize: 16, fontWeight: 700,
                    boxShadow: (kgDumped && parseFloat(kgDumped) > 0) ? '0 10px 24px rgba(34,197,94,0.25)' : 'none',
                    opacity: saving ? 0.6 : 1,
                  }}
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
