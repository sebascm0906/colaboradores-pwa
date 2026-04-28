// ─── ScreenPOS — entrada responsive al POS mostrador ────────────────────────
// En desktop (≥1024px) usa AdminShell + AdminPosForm (V2 backend live).
// En mobile se conserva la pantalla legacy como fallback.
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { softWarehouse } from '../../lib/sessionGuards'
import { getPosProducts, searchCustomers, getDefaultCustomer, createSaleOrder } from './api'
import { AdminProvider } from './AdminContext'
import AdminShell from './components/AdminShell'
import AdminPosForm from './forms/AdminPosForm'
import { logScreenError } from '../shared/logScreenError'
import SessionErrorState from '../../components/SessionErrorState'

export default function ScreenPOS() {
  const { session } = useSession()
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const warehouseId = softWarehouse(session)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (!warehouseId) {
    return (
      <SessionErrorState
        error={{ missing: 'warehouse_id' }}
        backTo="/admin"
      />
    )
  }

  if (sw < 1024) return <MobilePOS warehouseId={warehouseId} />

  return (
    <AdminProvider>
      <AdminShell activeBlock="pos" title="Venta mostrador">
        <AdminPosForm />
      </AdminShell>
    </AdminProvider>
  )
}

function MobilePOS({ warehouseId }) {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Customer
  const [customer, setCustomer] = useState({ id: null, name: 'VENTA PUBLICO' })
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [searchingCustomer, setSearchingCustomer] = useState(false)

  // Payment confirmation
  const [payConfirm, setPayConfirm] = useState(null) // 'cash' | 'card' | null

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => { loadProducts() }, [])

  useEffect(() => {
    loadDefaultCustomer()
  }, [])

  async function loadProducts() {
    setLoading(true)
    try {
      const data = await getPosProducts(warehouseId)
      setProducts(Array.isArray(data) ? data : [])
    } catch (e) { logScreenError('ScreenPOS', 'getPosProducts', e); setError('Error cargando productos') }
    finally { setLoading(false) }
  }

  async function loadDefaultCustomer() {
    try {
      const c = await getDefaultCustomer()
      if (c && c.id) setCustomer({ id: c.id, name: c.name || 'VENTA PUBLICO' })
    } catch (e) { logScreenError('ScreenPOS', 'getDefaultCustomer', e) }
  }

  // Filtered products
  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(p => p.name?.toLowerCase().includes(q))
  }, [products, search])

  // Cart operations
  function addToCart(product) {
    if ((product.stock || 0) <= 0) return
    setCart(prev => {
      const existing = prev.find(c => c.product_id === product.id)
      if (existing) {
        if (existing.qty >= (product.stock || 0)) return prev
        return prev.map(c => c.product_id === product.id ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { product_id: product.id, name: product.name, qty: 1, price_unit: product.price || 0, stock: product.stock || 0 }]
    })
  }

  function updateQty(productId, delta) {
    setCart(prev => {
      return prev.map(c => {
        if (c.product_id !== productId) return c
        const newQty = c.qty + delta
        if (newQty <= 0) return null
        if (newQty > c.stock) return c
        return { ...c, qty: newQty }
      }).filter(Boolean)
    })
  }

  function removeItem(productId) {
    setCart(prev => prev.filter(c => c.product_id !== productId))
  }

  const subtotal = cart.reduce((s, c) => s + c.qty * c.price_unit, 0)
  const iva = subtotal * 0.16
  const total = subtotal + iva

  // Customer search
  const doCustomerSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setCustomerResults([]); return }
    setSearchingCustomer(true)
    try {
      const res = await searchCustomers(q)
      setCustomerResults(Array.isArray(res) ? res : [])
    } catch { setCustomerResults([]) }
    finally { setSearchingCustomer(false) }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => doCustomerSearch(customerQuery), 400)
    return () => clearTimeout(timer)
  }, [customerQuery, doCustomerSearch])

  function selectCustomer(c) {
    setCustomer({ id: c.id, name: c.name })
    setShowCustomerSearch(false)
    setCustomerQuery('')
    setCustomerResults([])
  }

  // Payment
  async function confirmPay() {
    if (!payConfirm || cart.length === 0) return
    setSubmitting(true)
    setError('')
    try {
      const result = await createSaleOrder({
        warehouse_id: warehouseId,
        partner_id: customer.id,
        payment_method: payConfirm,
        lines: cart.map(c => ({ product_id: c.product_id, qty: c.qty, price_unit: c.price_unit })),
      })
      const orderId = result?.order_id || result?.id
      navigate(`/admin/ticket/${orderId}`, { state: { order_id: orderId } })
    } catch (e) {
      setError(e.message || 'Error al crear venta')
    } finally { setSubmitting(false); setPayConfirm(null) }
  }

  const fmt = (n) => '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

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
        input { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px', paddingBottom: cart.length > 0 ? 200 : 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/admin')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>POS Mostrador</span>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: TOKENS.radius.sm, background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`, marginBottom: 12 }}>
            <span style={{ ...typo.caption, color: TOKENS.colors.error }}>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Search */}
            <div style={{ marginBottom: 14 }}>
              <input
                type="text" placeholder="Buscar producto..."
                value={search} onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                  color: TOKENS.colors.text, fontSize: typo.body.fontSize, outline: 'none',
                }}
              />
            </div>

            {/* Product Grid */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>PRODUCTOS</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {filtered.map(p => {
                const outOfStock = (p.stock || 0) <= 0
                const inCart = cart.find(c => c.product_id === p.id)
                return (
                  <button key={p.id} onClick={() => !outOfStock && addToCart(p)}
                    style={{
                      padding: '12px 10px', borderRadius: TOKENS.radius.md,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                      textAlign: 'left', opacity: outOfStock ? 0.4 : 1,
                      cursor: outOfStock ? 'not-allowed' : 'pointer',
                      position: 'relative',
                    }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, marginBottom: 4, lineHeight: '1.3' }}>{p.name}</p>
                    <p style={{ ...typo.title, color: TOKENS.colors.blue3, margin: 0 }}>{fmt(p.price || 0)}</p>
                    <p style={{ ...typo.caption, color: outOfStock ? TOKENS.colors.error : TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                      {outOfStock ? 'Sin stock' : `${p.stock} disp.`}
                    </p>
                    {inCart && (
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        minWidth: 20, height: 20, borderRadius: TOKENS.radius.pill,
                        background: TOKENS.colors.success, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color: 'white', padding: '0 5px',
                      }}>{inCart.qty}</div>
                    )}
                  </button>
                )
              })}
            </div>

            {filtered.length === 0 && (
              <p style={{ ...typo.body, color: TOKENS.colors.textMuted, textAlign: 'center', padding: '20px 0' }}>No se encontraron productos</p>
            )}

            {/* Cart Section */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>CARRITO</p>

            {/* Customer chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                padding: '6px 12px', borderRadius: TOKENS.radius.pill,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textSoft }}>{customer.name}</span>
              </div>
              <button onClick={() => setShowCustomerSearch(!showCustomerSearch)} style={{
                padding: '6px 10px', borderRadius: TOKENS.radius.pill,
                background: `${TOKENS.colors.blue2}18`, border: `1px solid ${TOKENS.colors.blue2}30`,
              }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.blue3 }}>Cambiar cliente</span>
              </button>
            </div>

            {/* Customer Search Overlay */}
            {showCustomerSearch && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.lg, marginBottom: 12,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <input
                  type="text" placeholder="Buscar cliente por nombre..."
                  value={customerQuery} onChange={e => setCustomerQuery(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: TOKENS.radius.sm,
                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                    color: TOKENS.colors.text, fontSize: typo.caption.fontSize, outline: 'none', marginBottom: 8,
                  }}
                />
                {searchingCustomer && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 10 }}>
                    <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                )}
                {customerResults.map(c => (
                  <button key={c.id} onClick={() => selectCustomer(c)} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                    background: 'transparent', marginBottom: 2,
                  }}>
                    <span style={{ ...typo.caption, color: TOKENS.colors.text }}>{c.name}</span>
                  </button>
                ))}
              </div>
            )}

            {cart.length === 0 ? (
              <div style={{
                padding: '30px 20px', borderRadius: TOKENS.radius.lg, textAlign: 'center',
                background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Agrega productos</p>
              </div>
            ) : (
              <div style={{
                borderRadius: TOKENS.radius.lg, overflow: 'hidden',
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                {cart.map(item => (
                  <div key={item.product_id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                    borderBottom: `1px solid ${TOKENS.colors.border}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 1 }}>{fmt(item.price_unit)} c/u</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => updateQty(item.product_id, -1)} style={{
                        width: 26, height: 26, borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: TOKENS.colors.textSoft, fontSize: 14, fontWeight: 700,
                      }}>-</button>
                      <span style={{ ...typo.caption, color: TOKENS.colors.text, minWidth: 22, textAlign: 'center', fontWeight: 700 }}>{item.qty}</span>
                      <button onClick={() => updateQty(item.product_id, 1)} style={{
                        width: 26, height: 26, borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: TOKENS.colors.textSoft, fontSize: 14, fontWeight: 700,
                      }}>+</button>
                    </div>
                    <span style={{ ...typo.caption, color: TOKENS.colors.blue3, fontWeight: 700, minWidth: 60, textAlign: 'right' }}>{fmt(item.qty * item.price_unit)}</span>
                    <button onClick={() => removeItem(item.product_id)} style={{
                      width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: TOKENS.colors.error, flexShrink: 0,
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ height: 120 }} />
          </>
        )}
      </div>

      {/* Sticky Footer */}
      {cart.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: TOKENS.colors.bg0, borderTop: `1px solid ${TOKENS.colors.border}`,
          padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
        }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>Subtotal</span>
              <span style={{ ...typo.caption, color: TOKENS.colors.textSoft }}>{fmt(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>IVA 16%</span>
              <span style={{ ...typo.caption, color: TOKENS.colors.textSoft }}>{fmt(iva)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ ...typo.title, color: TOKENS.colors.text }}>Total</span>
              <span style={{ ...typo.title, color: TOKENS.colors.text }}>{fmt(total)}</span>
            </div>

            {payConfirm ? (
              <div>
                <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, textAlign: 'center', marginBottom: 8 }}>
                  Confirmar pago con {payConfirm === 'cash' ? 'Efectivo' : 'Terminal'}: {fmt(total)}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPayConfirm(null)} style={{
                    flex: 1, padding: '12px 0', borderRadius: TOKENS.radius.md,
                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                  }}>
                    <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600 }}>Cancelar</span>
                  </button>
                  <button onClick={confirmPay} disabled={submitting} style={{
                    flex: 1, padding: '12px 0', borderRadius: TOKENS.radius.md,
                    background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                    opacity: submitting ? 0.6 : 1,
                  }}>
                    {submitting ? (
                      <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                    ) : (
                      <span style={{ ...typo.body, color: 'white', fontWeight: 700 }}>Confirmar</span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPayConfirm('cash')} style={{
                  flex: 1, padding: '12px 0', borderRadius: TOKENS.radius.md,
                  background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                }}>
                  <span style={{ ...typo.body, color: 'white', fontWeight: 700 }}>Efectivo</span>
                </button>
                <button onClick={() => setPayConfirm('card')} style={{
                  flex: 1, padding: '12px 0', borderRadius: TOKENS.radius.md,
                  background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                }}>
                  <span style={{ ...typo.body, color: 'white', fontWeight: 700 }}>Terminal</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
