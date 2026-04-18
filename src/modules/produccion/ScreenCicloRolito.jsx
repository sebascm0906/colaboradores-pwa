// ScreenCicloRolito.jsx — V2 Ciclo Guiado Operador de Rolito
// Flujo simplificado:
//   Paso 1: Inicio congelacion
//   Paso 2: Fin congelacion + inicio deshielo
//   Paso 3: Fin deshielo + descarga base fija del ciclo
// El detalle real del producto empacado se captura despues en empaque.
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
  const [bagMaterials, setBagMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tick, setTick] = useState(0)
  const timerRef = useRef(null)

  const loadData = useCallback(async () => {
    try {
      setError('')
      const result = await getShiftOverview()
      setShift(result.shift)
      setCycles(result.cycles || [])
      setActiveCycle(getActiveCycle(result.cycles))
      setBagMaterials(result.bagMaterials || [])
    } catch (_) {
      setError('No se pudo cargar el turno')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

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

  let step = 'start'
  if (activeCycle?.state === 'freezing') step = 'freezing'
  if (activeCycle?.state === 'defrosting') step = 'defrosting'

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

  async function handleMarkDump() {
    if (!activeCycle?.id) return
    const kg = Number(activeCycle?.kg_expected || EXPECTED_KG_PER_CYCLE) || EXPECTED_KG_PER_CYCLE
    setSaving(true)
    setError('')
    try {
      await markDump(activeCycle.id, kg)
      setSuccess(`Ciclo completado: ${kg} kg base`)
      setTimeout(() => navigate('/produccion/empaque'), 1500)
    } catch (e) {
      setError(e.message || 'Error al registrar descarga')
    } finally {
      setSaving(false)
    }
  }

  const freezeWarning = progress?.phase === 'freezing' && progress.elapsedMin < 5
    ? 'Congelacion muy corta. Verifica que si haya arrancado.'
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
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
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
                    <p style={{ ...typo.caption, margin: 0, textAlign: 'center', color: active ? TOKENS.colors.blue2 : done ? TOKENS.colors.success : TOKENS.colors.textLow, fontWeight: active ? 700 : 500 }}>
                      {s}
                    </p>
                  </div>
                )
              })}
            </div>

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
                    {totalBagsAvailable > 0 ? `${totalBagsAvailable} bolsas disponibles para producir` : 'No hay bolsas disponibles en el turno'}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    {totalBagsAvailable > 0 ? 'Ya puedes iniciar el siguiente ciclo' : 'Recibe y valida bolsa antes de iniciar produccion'}
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

            {step === 'freezing' && progress && (
              <div style={{
                padding: 20, borderRadius: TOKENS.radius.xl,
                background: `linear-gradient(180deg, ${TOKENS.colors.blue2}18, rgba(255,255,255,0.02))`,
                border: `1px solid ${TOKENS.colors.blue2}30`,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>
                  CICLO #{activeCycle.cycle_number || '?'} · CONGELANDO
                </p>
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
                <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{
                    height: '100%', borderRadius: 5, transition: 'width 1s linear',
                    width: `${progress.progressPct}%`,
                    background: progress.isOverdue ? TOKENS.colors.error : progress.progressPct >= 80 ? TOKENS.colors.warning : TOKENS.colors.blue2,
                  }} />
                </div>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center', marginBottom: 16 }}>
                  Inicio: {fmtTime(activeCycle.freeze_start)} · {progress.elapsedMin} min transcurridos
                </p>

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
                    background: progress.isOverdue ? 'linear-gradient(90deg, #dc2626, #ef4444)' : 'linear-gradient(90deg, #f59e0b, #eab308)',
                    color: 'white', fontSize: 16, fontWeight: 700,
                    boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Guardando...' : 'TERMINO DE CONGELAR → DESHIELO'}
                </button>
              </div>
            )}

            {step === 'defrosting' && progress && (
              <div style={{
                padding: 20, borderRadius: TOKENS.radius.xl,
                background: `linear-gradient(180deg, ${TOKENS.colors.warning}18, rgba(255,255,255,0.02))`,
                border: `1px solid ${TOKENS.colors.warning}30`,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>
                  CICLO #{activeCycle.cycle_number || '?'} · DESHIELO
                </p>
                <div style={{ textAlign: 'center', margin: '16px 0' }}>
                  <p style={{
                    fontSize: 44, fontWeight: 700, margin: 0, letterSpacing: '-0.04em',
                    color: progress.isOverdue ? TOKENS.colors.success : TOKENS.colors.warning,
                  }}>
                    {progress.isOverdue ? '0:00' : `${progress.remainingMin}:${String(progress.remainingSec).padStart(2, '0')}`}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                    {progress.isOverdue ? 'Deshielo completo — registra la descarga base' : `Faltan (de ${progress.expectedMin} min)`}
                  </p>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{
                    height: '100%', borderRadius: 5, transition: 'width 1s linear',
                    width: `${progress.progressPct}%`,
                    background: progress.isOverdue ? TOKENS.colors.success : TOKENS.colors.warning,
                  }} />
                </div>

                <div style={{
                  padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 16,
                  background: 'rgba(43,143,224,0.10)', border: '1px solid rgba(43,143,224,0.25)',
                  textAlign: 'center',
                }}>
                  <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 6 }}>DESCARGA BASE DEL CICLO</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color: TOKENS.colors.text, margin: 0 }}>
                    {Number(activeCycle?.kg_expected || EXPECTED_KG_PER_CYCLE)} kg
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 0' }}>
                    Este dato ya no lo modifica el operador. El producto final y la cantidad real se registran en empaque.
                  </p>
                </div>

                <button
                  onClick={handleMarkDump}
                  disabled={saving}
                  style={{
                    width: '100%', padding: '18px', borderRadius: TOKENS.radius.lg,
                    background: 'linear-gradient(90deg, #15803d, #22c55e)',
                    color: 'white', fontSize: 16, fontWeight: 700,
                    boxShadow: '0 10px 24px rgba(34,197,94,0.25)',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Guardando...' : 'CONFIRMAR DESCARGA BASE'}
                </button>
              </div>
            )}

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
