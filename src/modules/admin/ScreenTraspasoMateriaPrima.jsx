// ScreenTraspasoMateriaPrima — Gerente sucursal entrega MP Laurita al rolito.
// Lee inventario REAL de PIGU/MP-IGUALA (loc 1172) filtrado a las 3 MP Laurita,
// y emite un material.issue con destination='rolito' que internamente crea
// el stock.move real PIGU/MP-IGUALA → PIGU/MP-IGUALA/PROCESO-ROLITO.
//
// Hardcoded para Fabricación-Iguala (warehouse 76) — único caso de uso hoy.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { useSession } from '../../App'
import { logScreenError } from '../shared/logScreenError'
import { getTraspasoMpIgualaStock, traspasoMpIgualaTransfer } from '../almacen-pt/materialsService'
import { AdminProvider } from './AdminContext'
import AdminShell from './components/AdminShell'

// Fallback fijo para Fabricación de Congelados (company 35) — Planta Iguala (76).
// Se usa cuando session.warehouse_id viene null (gerentes sin warehouse asignado).
const FABRICACION_COMPANY_ID = 35
const PLANTA_IGUALA_WAREHOUSE_ID = 76

function resolveWarehouseId(session) {
  if (session?.warehouse_id) return session.warehouse_id
  const companyId = Number(session?.company_id || 0)
  if (companyId === FABRICACION_COMPANY_ID) return PLANTA_IGUALA_WAREHOUSE_ID
  return null
}

export default function ScreenTraspasoMateriaPrima() {
  const [sw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  if (sw < 1024) {
    return (
      <AdminProvider>
        <MobileTraspasoMP />
      </AdminProvider>
    )
  }
  return (
    <AdminProvider>
      <AdminShell activeBlock="traspaso-mp" title="Traspaso Materia Prima">
        <TraspasoMPForm />
      </AdminShell>
    </AdminProvider>
  )
}

function MobileTraspasoMP() {
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

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
      `}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/admin')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>TRASPASO MATERIA PRIMA</span>
        </div>
        <TraspasoMPForm />
      </div>
    </div>
  )
}

function TraspasoMPForm() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = resolveWarehouseId(session)

  const [stockData, setStockData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [selectedProduct, setSelectedProduct] = useState(null)
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess] = useState(false)

  async function loadStock() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getTraspasoMpIgualaStock()
      setStockData(data)
    } catch (e) {
      logScreenError('ScreenTraspasoMateriaPrima', 'getTraspasoMpIgualaStock', e)
      setLoadError(e?.message || 'Error cargando inventario')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStock() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedProduct?.product_id || !(Number(qty) > 0)) return
    if (Number(qty) > Number(selectedProduct.qty_available)) {
      setSubmitError(`Solo hay ${selectedProduct.qty_available} disponibles en PIGU/MP-IGUALA`)
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      await traspasoMpIgualaTransfer({
        productId: Number(selectedProduct.product_id),
        qty: Number(qty),
        notes,
      })
      setSuccess(true)
    } catch (e) {
      logScreenError('ScreenTraspasoMateriaPrima', 'traspasoMpIgualaTransfer', e)
      setSubmitError(e?.message || 'Error al crear el traspaso')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Spinner />

  if (loadError) {
    return (
      <div style={{ padding: '32px 0' }}>
        <div style={{
          padding: '20px', borderRadius: TOKENS.radius.lg,
          background: `${TOKENS.colors.error}14`, border: `1px solid ${TOKENS.colors.error}30`,
        }}>
          <p style={{ ...typo.title, color: TOKENS.colors.error, margin: '0 0 6px' }}>Error</p>
          <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>{loadError}</p>
          <button
            onClick={loadStock}
            style={{
              marginTop: 14, padding: '10px 16px', borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
              ...typo.body, color: TOKENS.colors.text, cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `${TOKENS.colors.success}20`, border: `1px solid ${TOKENS.colors.success}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 6px' }}>Traspaso registrado</p>
        <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: '0 0 24px' }}>
          {qty} unidades de {selectedProduct?.product_name} enviadas a PROCESO-ROLITO
        </p>
        <button
          onClick={() => {
            setSuccess(false)
            setSelectedProduct(null)
            setQty('')
            setNotes('')
            loadStock()
          }}
          style={{
            width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            ...typo.title, color: TOKENS.colors.text, cursor: 'pointer',
          }}
        >
          Nuevo traspaso
        </button>
        <button
          onClick={() => navigate('/admin')}
          style={{
            width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
            background: 'transparent', border: 'none',
            ...typo.body, color: TOKENS.colors.textMuted, cursor: 'pointer', marginTop: 8,
          }}
        >
          Volver al panel
        </button>
      </div>
    )
  }

  const products = stockData?.products || []

  if (!selectedProduct) {
    return (
      <div style={{ paddingTop: 8 }}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 6 }}>SELECCIONA MATERIAL</p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginBottom: 14 }}>
          Inventario real en {stockData?.locationName || 'PIGU/MP-IGUALA'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {products.map(p => {
            const empty = Number(p.qty_available) <= 0
            return (
              <button
                key={p.product_id}
                disabled={empty}
                onClick={() => { setSelectedProduct(p); setQty('') }}
                style={{
                  padding: '16px 18px', borderRadius: TOKENS.radius.lg,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                  boxShadow: TOKENS.shadow.soft, opacity: empty ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: empty ? 'not-allowed' : 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.material_name || p.product_name}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    Disponible
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <p style={{ ...typo.title, color: empty ? TOKENS.colors.error : TOKENS.colors.blue3, margin: 0 }}>
                    {Number(p.qty_available).toFixed(0)}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                    {p.uom}
                  </p>
                </div>
              </button>
            )
          })}
          {products.length === 0 && (
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, textAlign: 'center', padding: 20 }}>
              Sin materiales disponibles
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ paddingTop: 8 }}>
      <button
        type="button"
        onClick={() => { setSelectedProduct(null); setQty(''); setSubmitError('') }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
          background: 'transparent', border: 'none', cursor: 'pointer',
          ...typo.caption, color: TOKENS.colors.blue3,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
        </svg>
        Cambiar material
      </button>

      <div style={{
        padding: 14, borderRadius: TOKENS.radius.md, marginBottom: 16,
        background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
      }}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>MATERIAL</p>
        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '4px 0 0' }}>
          {selectedProduct.material_name || selectedProduct.product_name}
        </p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
          Disponible: <strong style={{ color: TOKENS.colors.blue3 }}>{Number(selectedProduct.qty_available).toFixed(0)}</strong> {selectedProduct.uom}
        </p>
      </div>

      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>CANTIDAD A TRANSFERIR</p>
      <input
        type="number"
        required
        min="0.01"
        max={selectedProduct.qty_available}
        step="any"
        placeholder={`Máximo ${selectedProduct.qty_available}`}
        value={qty}
        onChange={e => { setQty(e.target.value); setSubmitError('') }}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
          color: TOKENS.colors.text, fontSize: 15, marginBottom: 12,
        }}
      />

      <textarea
        placeholder="Notas (opcional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
          color: TOKENS.colors.text, fontSize: 14, resize: 'none', marginBottom: 16,
        }}
      />

      {submitError && (
        <p style={{ ...typo.caption, color: TOKENS.colors.error, marginBottom: 12 }}>{submitError}</p>
      )}

      <button
        type="submit"
        disabled={submitting || !(Number(qty) > 0) || Number(qty) > Number(selectedProduct.qty_available)}
        style={{
          width: '100%', padding: '16px', borderRadius: TOKENS.radius.lg,
          background: submitting ? TOKENS.colors.surface : 'linear-gradient(90deg, #15499B, #2B8FE0)',
          border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
          ...typo.title, color: 'white',
          opacity: (submitting || !(Number(qty) > 0) || Number(qty) > Number(selectedProduct.qty_available)) ? 0.5 : 1,
        }}
      >
        {submitting ? 'Registrando...' : 'Confirmar traspaso a rolito'}
      </button>
    </form>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}
