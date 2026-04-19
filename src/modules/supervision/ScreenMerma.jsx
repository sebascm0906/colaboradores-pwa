import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift, getScraps, getScrapReasons, getScrapProducts, createScrap } from './api'
import { resolveSupervisionWarehouseId } from './shiftContext'
import { getCycles } from '../produccion/api'
import { validateMermaVsProduction, MERMA_MAX_PCT } from '../produccion/productionRules'
import { loadLines } from '../shared/lineService'
import { logScreenError } from '../shared/logScreenError'

const FALLBACK_LINES = [
  { id: 1, name: 'Iguala - Barras' },
  { id: 2, name: 'Iguala - Rolito' },
]

const INITIAL_FORM = {
  scrap_type: 'weight', // 'weight' | 'unit'
  scrap_phase: 'production', // 'production' | 'transformation' | 'warehouse'
  kg: '',
  product_id: '',
  qty_units: '',
  reason_id: '',
  line_id: '',
  notes: '',
}

const SCRAP_PHASES = [
  { value: 'production', label: 'Produccion' },
  { value: 'transformation', label: 'Transformacion' },
  { value: 'warehouse', label: 'Almacen' },
]

export default function ScreenMerma() {
  const { session } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const backTo = location.state?.backTo || '/supervision'
  const supervisionWarehouseId = resolveSupervisionWarehouseId(session)
  const [shift, setShift] = useState(null)
  const [scraps, setScraps] = useState([])
  const [reasons, setReasons] = useState([])
  const [products, setProducts] = useState([])
  const [cycles, setCycles] = useState([])
  const [lines, setLines] = useState(FALLBACK_LINES)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [photo, setPhoto] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift(supervisionWarehouseId)
      setShift(s)
      if (s?.id) {
        const [sc, rs, ps, cy, lns] = await Promise.all([
          getScraps(s.id).catch((e) => { logScreenError('ScreenMerma', 'getScraps', e); return [] }),
          getScrapReasons().catch((e) => { logScreenError('ScreenMerma', 'getScrapReasons', e); return [] }),
          getScrapProducts().catch((e) => { logScreenError('ScreenMerma', 'getScrapProducts', e); return [] }),
          getCycles(s.id).catch(() => []),
          loadLines(),
        ])
        setScraps(sc || [])
        setReasons(rs || [])
        setProducts(ps || [])
        setCycles(cy || [])
        if (Array.isArray(lns) && lns.length > 0) setLines(lns)
      }
    } catch (e) { logScreenError('ScreenMerma', 'loadData', e) }
    finally { setLoading(false) }
  }

  // Producto actualmente seleccionado (para calcular kg automaticamente)
  const selectedProduct = useMemo(() => {
    if (formData.scrap_type !== 'unit' || !formData.product_id) return null
    return products.find(p => String(p.id) === String(formData.product_id)) || null
  }, [formData.scrap_type, formData.product_id, products])

  // Kg calculado para unit mode (qty_units * product.weight)
  const computedKg = useMemo(() => {
    if (formData.scrap_type !== 'unit') return null
    const qty = Number(formData.qty_units || 0)
    const unit = Number(selectedProduct?.weight || 0)
    if (qty <= 0 || unit <= 0) return null
    return qty * unit
  }, [formData.scrap_type, formData.qty_units, selectedProduct])

  // Validacion
  const canSubmit = useMemo(() => {
    if (!formData.reason_id || !formData.line_id) return false
    if (formData.scrap_type === 'weight') {
      return Number(formData.kg) > 0
    }
    // unit mode: necesita producto + qty_units > 0
    if (!formData.product_id || !(Number(formData.qty_units) > 0)) return false
    // y necesita peso (computado o manual fallback si producto no tiene weight)
    if (computedKg !== null && computedKg > 0) return true
    return Number(formData.kg) > 0 // fallback manual
  }, [formData, computedKg])

  async function handleCreate(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const payload = {
        shift_id: shift.id,
        scrap_type: formData.scrap_type,
        scrap_phase: formData.scrap_phase, // Fase 4: campo real en gf.production.scrap
        reason_id: Number(formData.reason_id),
        line_id: Number(formData.line_id),
        notes: formData.notes,
      }

      if (formData.scrap_type === 'unit') {
        payload.product_id = Number(formData.product_id)
        payload.product_name = selectedProduct?.name || ''
        payload.qty_units = Number(formData.qty_units)
        payload.kg_per_unit = Number(selectedProduct?.weight || 0)
        // Fallback: si el producto no tiene peso, mandamos kg manual
        if (!payload.kg_per_unit && Number(formData.kg) > 0) {
          payload.kg = Number(formData.kg)
        }
      } else {
        payload.kg = Number(formData.kg)
      }

      if (photo) {
        const reader = new FileReader()
        const b64 = await new Promise((resolve) => { reader.onload = () => resolve(reader.result); reader.readAsDataURL(photo) })
        payload.photo_base64 = b64
      }

      await createScrap(payload)
      setMsg({ type: 'success', text: 'Merma registrada' })
      setShowForm(false)
      setFormData(INITIAL_FORM)
      setPhoto(null)
      await loadData()
    } catch (err) { setMsg({ type: 'error', text: err.message || 'Error al registrar merma' }) }
    finally { setSubmitting(false) }
  }

  useEffect(() => {
    if (msg) {
      const duration = msg.type === 'error' ? 6000 : 3500
      const t = setTimeout(() => setMsg(null), duration)
      return () => clearTimeout(t)
    }
  }, [msg])

  const totalKg = scraps.reduce((s, sc) => s + (Number(sc.kg) || 0), 0)
  const totalProducedKg = useMemo(
    () => (cycles || []).filter(c => c.state === 'dumped').reduce((s, c) => s + (Number(c.kg_dumped) || 0), 0),
    [cycles]
  )
  const mermaCheck = useMemo(
    () => validateMermaVsProduction(totalKg, totalProducedKg),
    [totalKg, totalProducedKg]
  )

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate(backTo)} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Merma</span>
          </div>
          <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{totalKg.toFixed(1)} kg total</span>
        </div>

        {/* Msg */}
        {msg && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: TOKENS.radius.md,
            background: msg.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <span style={{ ...typo.caption, color: msg.type === 'success' ? TOKENS.colors.success : TOKENS.colors.error }}>{msg.text}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !shift ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.warning }}>Sin turno activo</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un turno para poder registrar merma.</p>
            <button onClick={() => navigate('/supervision/turno')} style={{
              marginTop: 14, padding: '10px 20px', borderRadius: TOKENS.radius.sm,
              background: 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
              color: 'white', fontSize: 13, fontWeight: 600,
            }}>Ir a Control de Turno</button>
          </div>
        ) : (
          <>
            {/* KPI merma vs produccion */}
            {totalProducedKg > 0 && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.xl, marginBottom: 12,
                background: mermaCheck.level === 'error'
                  ? 'rgba(239,68,68,0.08)'
                  : mermaCheck.level === 'warning'
                    ? 'rgba(245,158,11,0.08)'
                    : 'rgba(34,197,94,0.06)',
                border: `1px solid ${
                  mermaCheck.level === 'error' ? 'rgba(239,68,68,0.25)'
                  : mermaCheck.level === 'warning' ? 'rgba(245,158,11,0.25)'
                  : 'rgba(34,197,94,0.20)'
                }`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>MERMA / PRODUCIDO</p>
                    <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, marginTop: 2 }}>
                      {totalKg.toFixed(1)} kg / {totalProducedKg.toFixed(0)} kg
                    </p>
                  </div>
                  <div style={{
                    padding: '6px 12px', borderRadius: TOKENS.radius.pill,
                    background: mermaCheck.level === 'error' ? 'rgba(239,68,68,0.15)'
                      : mermaCheck.level === 'warning' ? 'rgba(245,158,11,0.15)'
                      : 'rgba(34,197,94,0.15)',
                  }}>
                    <span style={{
                      fontSize: 16, fontWeight: 700,
                      color: mermaCheck.level === 'error' ? TOKENS.colors.error
                        : mermaCheck.level === 'warning' ? TOKENS.colors.warning
                        : TOKENS.colors.success,
                    }}>
                      {mermaCheck.pct.toFixed(2)}%
                    </span>
                  </div>
                </div>
                {mermaCheck.message && (
                  <p style={{
                    ...typo.caption, margin: '8px 0 0',
                    color: mermaCheck.level === 'error' ? TOKENS.colors.error
                      : mermaCheck.level === 'warning' ? TOKENS.colors.warning
                      : TOKENS.colors.textMuted,
                    fontWeight: 600,
                  }}>
                    {mermaCheck.message}
                  </p>
                )}
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                  Limite operativo: {MERMA_MAX_PCT}%
                </p>
              </div>
            )}

            {/* Registrar Merma */}
            {!showForm ? (
              <button onClick={() => setShowForm(true)} style={{
                width: '100%', padding: '12px', borderRadius: TOKENS.radius.md, marginBottom: 16,
                background: 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                color: 'white', fontSize: 14, fontWeight: 600,
              }}>
                + Registrar Merma
              </button>
            ) : (
              <form onSubmit={handleCreate} style={{
                padding: 16, borderRadius: TOKENS.radius.xl, marginBottom: 16,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.borderBlue}`,
              }}>
                <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 12px' }}>Registrar Merma</p>

                {/* Fase (origen) de la merma - segmented */}
                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
                  Donde ocurrio <span style={{ color: TOKENS.colors.error }}>*</span>
                </label>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12,
                  padding: 4, borderRadius: TOKENS.radius.sm,
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  {SCRAP_PHASES.map(opt => {
                    const active = formData.scrap_phase === opt.value
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => setFormData(p => ({ ...p, scrap_phase: opt.value }))}
                        style={{
                          padding: '8px 6px', borderRadius: 10,
                          background: active ? 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)' : 'transparent',
                          color: active ? 'white' : TOKENS.colors.textMuted,
                          fontSize: 12, fontWeight: 600,
                        }}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                {/* Tipo de merma - segmented */}
                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Tipo de merma</label>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12,
                  padding: 4, borderRadius: TOKENS.radius.sm,
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  {[
                    { value: 'unit', label: 'Producto (pzas)' },
                    { value: 'weight', label: 'Peso (kg)' },
                  ].map(opt => {
                    const active = formData.scrap_type === opt.value
                    return (
                      <button key={opt.value} type="button"
                        onClick={() => setFormData(p => ({ ...p, scrap_type: opt.value, kg: '', product_id: '', qty_units: '' }))}
                        style={{
                          padding: '8px 10px', borderRadius: 10,
                          background: active ? 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)' : 'transparent',
                          color: active ? 'white' : TOKENS.colors.textMuted,
                          fontSize: 12, fontWeight: 600,
                        }}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                {/* Campos especificos por tipo */}
                {formData.scrap_type === 'unit' ? (
                  <>
                    <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Producto</label>
                    <select value={formData.product_id} onChange={e => setFormData(p => ({ ...p, product_id: e.target.value, kg: '' }))}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                      <option value="">Seleccionar producto...</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.weight > 0 ? ` (${p.weight} kg/pza)` : ''}
                        </option>
                      ))}
                    </select>

                    <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Cantidad de piezas</label>
                    <input type="number" step="1" min="0" value={formData.qty_units}
                      onChange={e => setFormData(p => ({ ...p, qty_units: e.target.value }))}
                      placeholder="0"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }} />

                    {/* Kg computado (read-only) o fallback manual si producto sin peso */}
                    {selectedProduct && selectedProduct.weight > 0 ? (
                      <div style={{
                        padding: '10px 12px', borderRadius: TOKENS.radius.sm, marginBottom: 10,
                        background: 'rgba(43,143,224,0.08)', border: '1px solid rgba(43,143,224,0.25)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Kg calculado</span>
                        <span style={{ ...typo.title, color: TOKENS.colors.blue2, fontWeight: 700 }}>
                          {computedKg !== null ? `${computedKg.toFixed(2)} kg` : '—'}
                        </span>
                      </div>
                    ) : selectedProduct ? (
                      <>
                        <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: '0 0 4px' }}>
                          Producto sin peso unitario &mdash; captura kg manualmente.
                        </p>
                        <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Kg (manual)</label>
                        <input type="number" step="0.1" min="0" value={formData.kg}
                          onChange={e => setFormData(p => ({ ...p, kg: e.target.value }))}
                          placeholder="0.0"
                          style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }} />
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Kg</label>
                    <input type="number" step="0.1" min="0" value={formData.kg}
                      onChange={e => setFormData(p => ({ ...p, kg: e.target.value }))}
                      placeholder="0.0"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }} />
                  </>
                )}

                {/* Campos comunes */}
                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Motivo</label>
                <select value={formData.reason_id} onChange={e => setFormData(p => ({ ...p, reason_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                  <option value="">Seleccionar...</option>
                  {reasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Linea</label>
                <select value={formData.line_id} onChange={e => setFormData(p => ({ ...p, line_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }}>
                  <option value="">Seleccionar...</option>
                  {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Notas</label>
                <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2}
                  placeholder="Notas adicionales..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }} />

                <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Foto</label>
                <input type="file" accept="image/*" capture="environment" onChange={e => setPhoto(e.target.files?.[0] || null)}
                  style={{ width: '100%', padding: '8px 0', color: TOKENS.colors.textMuted, fontSize: 13, marginBottom: 12 }} />
                {photo && <p style={{ ...typo.caption, color: TOKENS.colors.blue2, marginTop: -6, marginBottom: 10 }}>{photo.name}</p>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => { setShowForm(false); setFormData(INITIAL_FORM); setPhoto(null) }}
                    style={{ flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={submitting || !canSubmit}
                    style={{
                      flex: 2, padding: '10px', borderRadius: TOKENS.radius.sm, fontSize: 13, fontWeight: 600, color: 'white',
                      background: !canSubmit ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                      border: `1px solid ${!canSubmit ? TOKENS.colors.border : 'transparent'}`,
                      opacity: submitting ? 0.6 : 1,
                    }}>
                    {submitting ? 'Registrando...' : 'Registrar Merma'}
                  </button>
                </div>
              </form>
            )}

            {/* Lista de mermas */}
            {scraps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {scraps.map(sc => {
                  const isUnit = sc.scrap_type === 'unit'
                  const title = isUnit
                    ? (sc.product_name || sc.reason || 'Merma')
                    : (sc.reason || 'Merma')
                  const subtitle = isUnit && sc.qty_units
                    ? `${sc.qty_units} pzas${sc.reason ? ` \u00B7 ${sc.reason}` : ''}`
                    : null
                  return (
                    <div key={sc.id} style={{
                      padding: 14, borderRadius: TOKENS.radius.xl,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                      boxShadow: TOKENS.shadow.soft,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                              padding: '2px 6px', borderRadius: 4,
                              background: isUnit ? 'rgba(43,143,224,0.15)' : 'rgba(245,158,11,0.15)',
                              color: isUnit ? TOKENS.colors.blue2 : TOKENS.colors.warning,
                              border: `1px solid ${isUnit ? 'rgba(43,143,224,0.3)' : 'rgba(245,158,11,0.3)'}`,
                            }}>
                              {isUnit ? 'PZAS' : 'PESO'}
                            </span>
                            <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
                          </div>
                          {subtitle && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>{subtitle}</p>}
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                            {sc.line_name || ''} {sc.created_at ? `\u00B7 ${sc.created_at}` : ''}
                          </p>
                        </div>
                        <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.warning }}>{Number(sc.kg || 0).toFixed(1)} kg</span>
                        </div>
                      </div>
                      {sc.notes && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0 0' }}>{sc.notes}</p>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ marginTop: 20, padding: 24, borderRadius: TOKENS.radius.xl, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
                <p style={{ ...typo.title, color: TOKENS.colors.success }}>Sin merma</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>No se ha registrado merma en este turno.</p>
              </div>
            )}
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
