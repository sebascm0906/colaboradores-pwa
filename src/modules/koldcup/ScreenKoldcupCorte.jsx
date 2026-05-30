import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { buildKoldcupClosePayload, closeKoldcupDay, getKoldcupDaySummary } from './koldcupService'
import { normalizeKoldcupSummary, validateKoldcupCloseDraft } from './koldcupState'
import { todayLocal } from '../../lib/api'

function todayIso() {
  return todayLocal()
}

function fmt(value) {
  return Number(value || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

function fmtMoney(value) {
  return `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ScreenKoldcupCorte() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [summary, setSummary] = useState(null)
  const [draft, setDraft] = useState({ final_input_count: '', final_finished_count: '', expected_input_count: '', expected_finished_count: '', difference_reason: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
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
      const normalized = normalizeKoldcupSummary(await getKoldcupDaySummary({ warehouseId, employeeId, date: todayIso() }))
      setSummary(normalized)
      setDraft({
        final_input_count: String(normalized.inventory.inputAvailableQty),
        final_finished_count: String(normalized.inventory.finishedAvailableQty),
        expected_input_count: String(normalized.inventory.inputAvailableQty),
        expected_finished_count: String(normalized.inventory.finishedAvailableQty),
        difference_reason: '',
      })
    } catch (err) {
      setError(err.message || 'No se pudo cargar corte KOLDCUP')
      setSummary(normalizeKoldcupSummary(null))
    } finally {
      setLoading(false)
    }
  }, [warehouseId, employeeId])

  useEffect(() => { loadData() }, [loadData])

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setMessage('')
    setError('')
  }

  async function handleSubmit() {
    const validation = validateKoldcupCloseDraft(draft)
    setErrors(validation)
    if (Object.keys(validation).length) return

    setSaving(true)
    setError('')
    try {
      await closeKoldcupDay(buildKoldcupClosePayload({
        warehouseId,
        employeeId,
        date: summary?.date || todayIso(),
        finalInputCount: draft.final_input_count,
        finalFinishedCount: draft.final_finished_count,
        differenceReason: draft.difference_reason,
      }))
      setMessage('Corte KOLDCUP cerrado')
      await loadData()
    } catch (err) {
      setError(err.message || 'No se pudo cerrar produccion KOLDCUP')
    } finally {
      setSaving(false)
    }
  }

  const safeSummary = summary || normalizeKoldcupSummary(null)
  const blocked = safeSummary.close.blockers.length > 0 && !safeSummary.close.canClose

  return (
    <Frame title="Corte KOLDCUP" typo={typo} navigate={navigate}>
      {error ? <Message tone="error" text={error} typo={typo} /> : null}
      {message ? <Message tone="success" text={message} typo={typo} /> : null}
      {safeSummary.close.blockers.length ? <Message tone="error" text={safeSummary.close.blockers.join(' · ')} typo={typo} /> : null}
      {safeSummary.close.warnings.length ? <Message tone="warning" text={safeSummary.close.warnings.join(' · ')} typo={typo} /> : null}

      <div style={panelStyle()}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>RESUMEN DEL DIA</p>
        {loading ? <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Cargando corte...</p> : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Metric label="Compra" value={fmtMoney(safeSummary.purchase.totalAmount)} typo={typo} />
          <Metric label="Vasos producidos" value={fmt(safeSummary.production.outputQty)} typo={typo} />
          <Metric label="Insumo consumido" value={fmt(safeSummary.production.inputQty)} typo={typo} />
          <Metric label="PT disponible" value={fmt(safeSummary.inventory.finishedAvailableQty)} typo={typo} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Insumo final" error={errors.final_input_count} typo={typo}>
            <input type="number" min="0" step="0.01" value={draft.final_input_count} onChange={(e) => updateDraft('final_input_count', e.target.value)} style={fieldStyle(errors.final_input_count)} />
          </Field>
          <Field label="Vasos finales" error={errors.final_finished_count} typo={typo}>
            <input type="number" min="0" step="1" value={draft.final_finished_count} onChange={(e) => updateDraft('final_finished_count', e.target.value)} style={fieldStyle(errors.final_finished_count)} />
          </Field>
        </div>

        <Field label="Nota de diferencia" error={errors.difference_reason} typo={typo}>
          <textarea rows="3" value={draft.difference_reason} onChange={(e) => updateDraft('difference_reason', e.target.value)} placeholder="Obligatoria si hay diferencia" style={{ ...fieldStyle(errors.difference_reason), resize: 'vertical' }} />
        </Field>

        <button onClick={handleSubmit} disabled={saving || loading || blocked} style={primaryButtonStyle(saving || loading || blocked)}>
          {saving ? 'Cerrando...' : 'Cerrar produccion KOLDCUP'}
        </button>
      </div>
    </Frame>
  )
}

function Frame({ title, typo, navigate, children }) {
  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 14 }}>
          <button onClick={() => navigate('/koldcup')} style={{ width: 38, height: 38, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          </button>
          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{title}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

function Metric({ label, value, typo }) {
  return <div style={{ padding: 12, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}` }}><p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{label}</p><p style={{ ...typo.title, color: TOKENS.colors.text, margin: '4px 0 0' }}>{value}</p></div>
}

function Field({ label, error, typo, children }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ ...typo.caption, color: TOKENS.colors.textMuted, fontWeight: 700 }}>{label}</span>{children}{error ? <span style={{ ...typo.caption, color: TOKENS.colors.error }}>{error}</span> : null}</label>
}

function Message({ tone, text, typo }) {
  const color = tone === 'success' ? TOKENS.colors.success : tone === 'warning' ? TOKENS.colors.warning : TOKENS.colors.error
  return <div style={{ padding: 12, borderRadius: TOKENS.radius.lg, background: `${color}18`, border: `1px solid ${color}44`, marginBottom: 12 }}><p style={{ ...typo.caption, color, margin: 0, fontWeight: 700 }}>{text}</p></div>
}

function panelStyle() {
  return { padding: 16, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, boxShadow: TOKENS.shadow.md, display: 'flex', flexDirection: 'column', gap: 12 }
}

function fieldStyle(hasError) {
  return { width: '100%', borderRadius: TOKENS.radius.md, border: `1px solid ${hasError ? 'rgba(239,68,68,0.35)' : TOKENS.colors.border}`, background: TOKENS.colors.surface, color: TOKENS.colors.textSoft, padding: '12px 14px', fontSize: 15, outline: 'none', colorScheme: 'dark' }
}

function primaryButtonStyle(disabled) {
  return { minHeight: 46, borderRadius: TOKENS.radius.pill, background: 'linear-gradient(90deg,#15499B,#2B8FE0)', color: '#fff', fontSize: 14, fontWeight: 800, opacity: disabled ? 0.55 : 1 }
}
