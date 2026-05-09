import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { computeKoldcupSteps, normalizeKoldcupSummary } from './koldcupState'
import { getKoldcupDaySummary } from './koldcupService'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function fmtMoney(value) {
  return `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusColor(status) {
  switch (status) {
    case 'completed': return TOKENS.colors.success
    case 'in_progress': return TOKENS.colors.blue2
    case 'pending': return TOKENS.colors.warning
    case 'alert': return TOKENS.colors.error
    default: return TOKENS.colors.textMuted
  }
}

export default function ScreenKoldcupHub() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const warehouseId = session?.warehouse_id || session?.plant_warehouse_id || 0
  const employeeId = session?.employee_id || 0

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const raw = await getKoldcupDaySummary({ warehouseId, employeeId, date: todayIso() })
      setSummary(normalizeKoldcupSummary(raw))
    } catch (err) {
      setError(err.message || 'No se pudo cargar KOLDCUP')
      setSummary(normalizeKoldcupSummary(null))
    } finally {
      setLoading(false)
    }
  }, [warehouseId, employeeId])

  useEffect(() => { loadData() }, [loadData])

  const safeSummary = summary || normalizeKoldcupSummary(null)
  const steps = computeKoldcupSteps(safeSummary)

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
        @keyframes koldcupSpin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 14 }}>
          <button onClick={() => navigate('/')} style={iconButtonStyle()}>
            <BackIcon />
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>KOLDCUP</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>{todayIso()}</p>
          </div>
          <button onClick={loadData} disabled={loading} style={iconButtonStyle(loading ? 0.6 : 1)}>
            <RefreshIcon spinning={loading} />
          </button>
        </div>

        {error ? <AlertMessage tone="error" text={error} typo={typo} /> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
          <Kpi label="Compra" value={fmtMoney(safeSummary.purchase.totalAmount)} typo={typo} />
          <Kpi label="Vasos" value={String(safeSummary.production.outputQty)} typo={typo} />
          <Kpi label="Listos" value={String(safeSummary.inventory.finishedAvailableQty)} typo={typo} />
        </div>

        <div style={{
          padding: 16,
          borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel,
          border: `1px solid ${TOKENS.colors.border}`,
          boxShadow: TOKENS.shadow.md,
        }}>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 14px' }}>FLUJO DEL DIA</p>
          {loading && !summary ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)', borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%', animation: 'koldcupSpin 0.8s linear infinite' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {steps.map((step) => {
                const locked = step.status === 'locked'
                const color = statusColor(step.status)
                return (
                  <button
                    key={step.id}
                    onClick={() => !locked && navigate(step.route)}
                    disabled={locked}
                    style={{
                      width: '100%',
                      minHeight: 58,
                      padding: '12px 14px',
                      borderRadius: TOKENS.radius.lg,
                      background: locked ? 'rgba(255,255,255,0.035)' : TOKENS.colors.surface,
                      border: `1px solid ${locked ? TOKENS.colors.border : `${color}55`}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      textAlign: 'left',
                      opacity: locked ? 0.55 : 1,
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 10, background: locked ? 'transparent' : color, border: locked ? `1px solid ${TOKENS.colors.textMuted}` : 'none', flexShrink: 0 }} />
                    <span style={{ ...typo.body, color: TOKENS.colors.text, fontWeight: 700, flex: 1 }}>{step.label}</span>
                    {step.badge ? <span style={{ ...typo.caption, color, fontWeight: 700 }}>{step.badge}</span> : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {safeSummary.close.blockers.length ? (
          <div style={{ marginTop: 14 }}>
            <AlertMessage tone="error" text={safeSummary.close.blockers.join(' · ')} typo={typo} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Kpi({ label, value, typo }) {
  return (
    <div style={{ padding: 12, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}` }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 800, color: TOKENS.colors.text, margin: '4px 0 0' }}>{value}</p>
    </div>
  )
}

function AlertMessage({ tone, text, typo }) {
  const color = tone === 'error' ? TOKENS.colors.error : TOKENS.colors.warning
  return (
    <div style={{ padding: 12, borderRadius: TOKENS.radius.lg, background: `${color}18`, border: `1px solid ${color}44`, marginBottom: 12 }}>
      <p style={{ ...typo.caption, color, margin: 0, fontWeight: 700 }}>{text}</p>
    </div>
  )
}

function iconButtonStyle(opacity = 1) {
  return {
    width: 38,
    height: 38,
    borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface,
    border: `1px solid ${TOKENS.colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity,
    flexShrink: 0,
  }
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
    </svg>
  )
}

function RefreshIcon({ spinning }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={spinning ? { animation: 'koldcupSpin 0.8s linear infinite' } : null}>
      <path d="M1 4v6h6" /><path d="M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
    </svg>
  )
}
