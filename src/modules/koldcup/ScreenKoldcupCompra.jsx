import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { buildKoldcupPurchasePayload, createKoldcupPurchase, getKoldcupPurchaseCatalog } from './koldcupService'
import { validateKoldcupPurchaseDraft } from './koldcupState'

function unwrap(res) {
  return res?.data && typeof res.data === 'object' ? res.data : (res || {})
}

function rows(data, ...keys) {
  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

export default function ScreenKoldcupCompra() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [catalog, setCatalog] = useState({})
  const [draft, setDraft] = useState({ supplier_id: '', product_id: '', qty: '', unit_price: '', notes: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const warehouseId = session?.warehouse_id || session?.plant_warehouse_id || 0
  const employeeId = session?.employee_id || 0

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    getKoldcupPurchaseCatalog({ warehouseId, employeeId })
      .then((res) => { if (active) setCatalog(unwrap(res)) })
      .catch((err) => { if (active) setError(err.message || 'No se pudo cargar catalogo KOLDCUP') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [warehouseId, employeeId])

  const suppliers = rows(catalog, 'suppliers', 'providers')
  const products = rows(catalog, 'products', 'items')
  const cashBox = catalog.cash_location || catalog.cash_box || null
  const total = Number(draft.qty || 0) * Number(draft.unit_price || 0)

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setError('')
    setResult(null)
  }

  async function handleSubmit() {
    const validation = validateKoldcupPurchaseDraft(draft)
    setErrors(validation)
    if (Object.keys(validation).length) return

    setSaving(true)
    setError('')
    try {
      const payload = buildKoldcupPurchasePayload({
        warehouseId,
        employeeId,
        supplierId: draft.supplier_id,
        productId: draft.product_id,
        qty: draft.qty,
        unitPrice: draft.unit_price,
        notes: draft.notes,
      })
      const res = await createKoldcupPurchase(payload)
      setResult(unwrap(res))
      setDraft({ supplier_id: draft.supplier_id, product_id: '', qty: '', unit_price: '', notes: '' })
    } catch (err) {
      setError(err.message || 'No se pudo registrar compra KOLDCUP')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScreenFrame title="Compra KOLDCUP" backTo="/koldcup" typo={typo} navigate={navigate}>
      {error ? <Message tone="error" text={error} typo={typo} /> : null}
      {result ? (
        <Message
          tone="success"
          text={`Compra ${result.purchase_name || result.purchase_order_id || ''} registrada con salida de caja ${result.cash_box_name || result.cash_out_id || ''}`}
          typo={typo}
        />
      ) : null}

      <div style={panelStyle()}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 14px' }}>REGISTRAR COMPRA Y SALIDA DE CAJA</p>
        {cashBox ? (
          <div style={infoBoxStyle()}>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Caja</p>
            <p style={{ ...typo.body, color: TOKENS.colors.text, margin: '3px 0 0', fontWeight: 700 }}>{cashBox.name || cashBox.display_name || 'Caja CEDIS CDMX'}</p>
          </div>
        ) : null}

        {loading ? <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Cargando catalogo...</p> : null}

        {suppliers.length ? (
          <Field label="Proveedor" error={errors.supplier_id} typo={typo}>
            <select value={draft.supplier_id} onChange={(e) => updateDraft('supplier_id', e.target.value)} style={fieldStyle()}>
              <option value="">Proveedor default...</option>
              {suppliers.map((item) => <option key={item.id || item.supplier_id} value={item.id || item.supplier_id}>{item.name || item.display_name}</option>)}
            </select>
          </Field>
        ) : null}

        <Field label="Insumo" error={errors.product_id} typo={typo}>
          <select value={draft.product_id} onChange={(e) => updateDraft('product_id', e.target.value)} style={fieldStyle(errors.product_id)}>
            <option value="">Selecciona insumo...</option>
            {products.map((item) => <option key={item.id || item.product_id} value={item.id || item.product_id}>{item.name || item.display_name}</option>)}
          </select>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Cantidad" error={errors.qty} typo={typo}>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.qty} onChange={(e) => updateDraft('qty', e.target.value)} style={fieldStyle(errors.qty)} />
          </Field>
          <Field label="Precio unitario" error={errors.unit_price} typo={typo}>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.unit_price} onChange={(e) => updateDraft('unit_price', e.target.value)} style={fieldStyle(errors.unit_price)} />
          </Field>
        </div>

        <div style={infoBoxStyle()}>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Total salida caja</p>
          <p style={{ fontSize: 22, color: TOKENS.colors.text, margin: '4px 0 0', fontWeight: 800 }}>${total.toFixed(2)}</p>
        </div>

        <textarea rows="3" placeholder="Notas opcionales" value={draft.notes} onChange={(e) => updateDraft('notes', e.target.value)} style={{ ...fieldStyle(), resize: 'vertical' }} />

        <button onClick={handleSubmit} disabled={saving || loading} style={primaryButtonStyle(saving || loading)}>
          {saving ? 'Guardando...' : 'Registrar compra y salida de caja'}
        </button>
      </div>
    </ScreenFrame>
  )
}

function ScreenFrame({ title, backTo, typo, navigate, children }) {
  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; } .koldcup-select option { background: #14253c; color: rgba(255,255,255,0.9); }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 14 }}>
          <button onClick={() => navigate(backTo)} style={{ width: 38, height: 38, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
          </button>
          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{title}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, error, typo, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted, fontWeight: 700 }}>{label}</span>
      {children}
      {error ? <span style={{ ...typo.caption, color: TOKENS.colors.error }}>{error}</span> : null}
    </label>
  )
}

function Message({ tone, text, typo }) {
  const color = tone === 'success' ? TOKENS.colors.success : TOKENS.colors.error
  return <div style={{ padding: 12, borderRadius: TOKENS.radius.lg, background: `${color}18`, border: `1px solid ${color}44`, marginBottom: 12 }}><p style={{ ...typo.caption, color, margin: 0, fontWeight: 700 }}>{text}</p></div>
}

function panelStyle() {
  return { padding: 16, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, boxShadow: TOKENS.shadow.md, display: 'flex', flexDirection: 'column', gap: 12 }
}

function infoBoxStyle() {
  return { padding: 12, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}` }
}

function fieldStyle(hasError) {
  return { width: '100%', borderRadius: TOKENS.radius.md, border: `1px solid ${hasError ? 'rgba(239,68,68,0.35)' : TOKENS.colors.border}`, background: TOKENS.colors.surface, color: TOKENS.colors.textSoft, padding: '12px 14px', fontSize: 15, outline: 'none', colorScheme: 'dark' }
}

function primaryButtonStyle(disabled) {
  return { minHeight: 46, borderRadius: TOKENS.radius.pill, background: 'linear-gradient(90deg,#15499B,#2B8FE0)', color: '#fff', fontSize: 14, fontWeight: 800, opacity: disabled ? 0.55 : 1 }
}
