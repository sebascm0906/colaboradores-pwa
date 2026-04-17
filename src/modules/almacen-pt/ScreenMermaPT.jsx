// ScreenMermaPT.jsx — Registrar merma PT
// Catálogo de razones: gf.production.scrap.reason (Sebastián commit 56c064e).
// Endpoint: /gf/logistics/api/employee/warehouse_scrap/create con warehouse_id PT.

import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getInventory,
  getScrapHistory,
  createScrap,
  DEFAULT_WAREHOUSE_ID,
} from './ptService'
import { ScreenShell, ConfirmDialog } from '../entregas/components'
import { logScreenError } from '../shared/logScreenError'

// Scrap reasons catálogo real en backend (Sebastián audit 2026-04-10):
//   {damage, expired, shortage, contamination, other}
// Se alinean con `gf.production.scrap.reason`. `melt`/`deform` no existían y
// se removieron para evitar rechazos del endpoint.
const PT_REASONS = [
  { tag: 'damage',        label: 'Roto / dañado' },
  { tag: 'expired',       label: 'Caducado' },
  { tag: 'shortage',      label: 'Faltante' },
  { tag: 'contamination', label: 'Contaminado' },
  { tag: 'other',         label: 'Otro' },
]

export default function ScreenMermaPT() {
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID
  const employeeId = session?.employee_id || 0

  const [inventory, setInventory] = useState([])
  const [history, setHistory] = useState([])
  const [loadingInit, setLoadingInit] = useState(true)

  const [productSearch, setProductSearch] = useState('')
  const [showProductList, setShowProductList] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [qty, setQty] = useState(1)
  const [selectedReason, setSelectedReason] = useState(null)
  const [notes, setNotes] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [validationErrors, setValidationErrors] = useState({})

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoadingInit(true)
    try {
      const [inv, hist] = await Promise.allSettled([
        getInventory(warehouseId),
        getScrapHistory(warehouseId),
      ])
      if (inv.status === 'rejected') logScreenError('ScreenMermaPT', 'getInventory', inv.reason)
      if (hist.status === 'rejected') logScreenError('ScreenMermaPT', 'getScrapHistory', hist.reason)
      // Inventario ya deduplicado + MP filtrado por el BFF canonico.
      const rawInv = inv.status === 'fulfilled' && Array.isArray(inv.value) ? inv.value : []
      setInventory(rawInv.map((item) => ({
        product_id: item.product_id,
        product: item.product_name,
        quantity: Number(item.quantity) || 0,
        weight: Number(item.weight_per_unit) || 1,
        total_kg: Number(item.total_kg) || 0,
      })))
      setHistory(hist.status === 'fulfilled' && Array.isArray(hist.value) ? hist.value : [])
    } catch (e) { logScreenError('ScreenMermaPT', 'loadData', e) }
    finally { setLoadingInit(false) }
  }

  const filteredProducts = productSearch
    ? inventory.filter(i => i.product?.toLowerCase().includes(productSearch.toLowerCase()))
    : inventory

  function validate() {
    const errs = {}
    if (!selectedProduct) errs.product = 'Selecciona un producto'
    if (!qty || qty <= 0) errs.qty = 'Cantidad debe ser mayor a 0'
    if (!selectedReason) errs.reason = 'Selecciona un motivo'
    setValidationErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleOpenConfirm() {
    if (!validate()) return
    setConfirmOpen(true)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      await createScrap(
        warehouseId,
        employeeId,
        selectedProduct.product_id,
        qty,
        selectedReason, // id del gf.production.scrap.reason
        notes.trim() || undefined
      )
      setSuccess('Merma registrada correctamente')
      clearForm()
      setConfirmOpen(false)
      const hist = await getScrapHistory(warehouseId).catch((e) => {
        logScreenError('ScreenMermaPT', 'getScrapHistory(refresh)', e)
        return []
      })
      setHistory(hist || [])
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) {
      setConfirmOpen(false)
      setError(e.message || 'Error al registrar merma')
    } finally { setSubmitting(false) }
  }

  function clearForm() {
    setSelectedProduct(null)
    setProductSearch('')
    setQty(1)
    setSelectedReason(null)
    setNotes('')
    setValidationErrors({})
  }

  function selectProduct(item) {
    setSelectedProduct(item)
    setProductSearch(item.product || '')
    setShowProductList(false)
    setValidationErrors(prev => ({ ...prev, product: undefined }))
  }

  const reasonObj = PT_REASONS.find(r => r.tag === selectedReason)
  const confirmMessage = selectedProduct
    ? `¿Registrar ${qty} unidad(es) de merma de ${selectedProduct.product} por ${reasonObj?.label || '—'}?`
    : ''

  return (
    <ScreenShell title="Merma PT" backTo="/almacen-pt">
      <style>{`
        @keyframes ptMermaSpin { to { transform: rotate(360deg); } }
        input, textarea { font-family: 'DM Sans', sans-serif; }
      `}</style>

      {loadingInit ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
            animation: 'ptMermaSpin 0.8s linear infinite',
          }} />
        </div>
      ) : (
        <>
          {error && (
            <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)', color: TOKENS.colors.error, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)', color: TOKENS.colors.success, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
              {success}
            </div>
          )}

          <div style={{ padding: 18, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, marginBottom: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px', fontWeight: 600 }}>Producto</p>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductList(true); setSelectedProduct(null) }}
                  onFocus={() => setShowProductList(true)}
                  placeholder="Buscar producto..."
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${validationErrors.product ? TOKENS.colors.error : TOKENS.colors.border}`,
                    color: 'white', fontSize: 14, outline: 'none',
                  }}
                />
                {showProductList && filteredProducts.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    maxHeight: 200, overflowY: 'auto',
                    borderRadius: TOKENS.radius.md, background: TOKENS.colors.bg1,
                    border: `1px solid ${TOKENS.colors.border}`, boxShadow: TOKENS.shadow.md,
                    marginTop: 4,
                  }}>
                    {filteredProducts.slice(0, 20).map((item, i) => (
                      <button
                        key={item.product_id || i}
                        onClick={() => selectProduct(item)}
                        style={{
                          width: '100%', padding: '10px 14px', textAlign: 'left',
                          background: 'transparent',
                          borderBottom: i < Math.min(filteredProducts.length, 20) - 1 ? `1px solid ${TOKENS.colors.border}` : 'none',
                        }}
                      >
                        <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>{item.product}</p>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                          Stock: {item.quantity} · {(item.total_kg || 0).toFixed(0)} kg
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedProduct && (
                <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: TOKENS.radius.sm, background: 'rgba(43,143,224,0.08)', border: '1px solid rgba(43,143,224,0.15)' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.blue3, margin: 0, fontWeight: 600 }}>{selectedProduct.product}</p>
                </div>
              )}
              {validationErrors.product && <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{validationErrors.product}</p>}
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px', fontWeight: 600 }}>Cantidad</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button
                  onClick={() => setQty(prev => Math.max(0.5, (prev || 1) - 0.5))}
                  style={{
                    width: 48, height: 48, borderRadius: `${TOKENS.radius.md}px 0 0 ${TOKENS.radius.md}px`,
                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                    color: TOKENS.colors.text, fontSize: 20, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  -
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  value={qty}
                  onChange={e => setQty(parseFloat(e.target.value) || 0)}
                  style={{
                    flex: 1, height: 48, padding: '0 12px', textAlign: 'center',
                    background: 'rgba(255,255,255,0.05)',
                    border: `1px solid ${validationErrors.qty ? TOKENS.colors.error : TOKENS.colors.border}`,
                    borderLeft: 'none', borderRight: 'none',
                    color: 'white', fontSize: 18, fontWeight: 700, outline: 'none',
                  }}
                />
                <button
                  onClick={() => setQty(prev => (prev || 0) + 0.5)}
                  style={{
                    width: 48, height: 48, borderRadius: `0 ${TOKENS.radius.md}px ${TOKENS.radius.md}px 0`,
                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                    color: TOKENS.colors.text, fontSize: 20, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  +
                </button>
              </div>
              {validationErrors.qty && <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{validationErrors.qty}</p>}
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 8px', fontWeight: 600 }}>Motivo</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PT_REASONS.map(reason => {
                  const active = selectedReason === reason.tag
                  return (
                    <button
                      key={reason.tag}
                      onClick={() => { setSelectedReason(reason.tag); setValidationErrors(prev => ({ ...prev, reason: undefined })) }}
                      style={{
                        padding: '10px 14px', borderRadius: TOKENS.radius.md,
                        background: active ? 'rgba(43,143,224,0.15)' : TOKENS.colors.surfaceSoft,
                        border: `1.5px solid ${active ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                        color: active ? TOKENS.colors.blue3 : TOKENS.colors.textSoft,
                        fontSize: 13, fontWeight: 600,
                        transition: `all ${TOKENS.motion.fast}`,
                      }}
                    >
                      {reason.label}
                    </button>
                  )
                })}
              </div>
              {validationErrors.reason && <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{validationErrors.reason}</p>}
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px', fontWeight: 600 }}>
                Notas (opcional)
              </p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Detalle adicional..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${validationErrors.notes ? TOKENS.colors.error : TOKENS.colors.border}`,
                  color: 'white', fontSize: 14, outline: 'none', resize: 'vertical',
                }}
              />
              {validationErrors.notes && <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{validationErrors.notes}</p>}
            </div>

            <button
              onClick={handleOpenConfirm}
              disabled={submitting}
              style={{
                width: '100%', padding: 14, borderRadius: TOKENS.radius.lg,
                background: 'linear-gradient(90deg, #f59e0b, #d97706)', color: 'white',
                fontSize: 15, fontWeight: 600, opacity: submitting ? 0.6 : 1,
                boxShadow: '0 10px 24px rgba(245,158,11,0.25)',
              }}
            >
              {submitting ? 'Registrando...' : 'Registrar Merma'}
            </button>
          </div>

          <div>
            <p style={{ ...typo.overline, color: TOKENS.colors.textMuted, marginBottom: 10 }}>MERMA DEL DÍA</p>
            {history.length === 0 ? (
              <div style={{ padding: 20, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin mermas registradas hoy</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map((item, i) => (
                  <div key={item.id || i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: TOKENS.radius.md,
                    background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>{item.product || 'Producto'}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                        {item.reason || '—'} · {item.time || ''}
                      </p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.colors.warning, flexShrink: 0, marginLeft: 8 }}>
                      {item.qty ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Registrar merma"
        message={confirmMessage}
        confirmLabel="Registrar"
        variant="danger"
        onConfirm={handleSubmit}
        onCancel={() => setConfirmOpen(false)}
        loading={submitting}
      />
    </ScreenShell>
  )
}
