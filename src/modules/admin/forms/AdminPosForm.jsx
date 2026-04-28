// ─── AdminPosForm — Venta mostrador V2 (desktop) ────────────────────────────
// Backend: `gf_pwa_admin.sale-create` + `pos-products` + `customers`.
// Layout desktop de 2 columnas:
//   ┌─────────────────────────┬──────────────────────┐
//   │ Search + Product grid   │  Customer + Cart     │
//   │ (scroll independiente)  │  Totals + Payment    │
//   └─────────────────────────┴──────────────────────┘
// Mobile legacy sigue en ScreenPOS.jsx < 1024px.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS } from '../../../tokens'
import { useAdmin } from '../AdminContext'
import AuthBanner from '../../../components/AuthBanner'
import { useToast } from '../../../components/Toast'
import { safeNumber } from '../../../lib/safeNumber'
import {
  getPosProducts,
  searchCustomers,
  getDefaultCustomer,
  createSaleOrder,
} from '../api'
import { addProductToCart, changeCartItemQty, getDisplayStock, stockLabel } from '../posCart'
import { logScreenError } from '../../shared/logScreenError'
import { computePosSummary } from '../posPricing'

const fmt = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

// Umbrales de venta (UI — backend debe re-validar)
export const POS_THRESHOLDS = {
  MANAGER_AUTH: 5000,   // > $5000: requiere autorización gerente
  DIRECTOR_AUTH: 50000, // > $50000: requiere autorización dirección
}

export default function AdminPosForm() {
  const navigate = useNavigate()
  const { companyId, companyLabel, warehouseId, sucursal } = useAdmin()

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState({ id: null, name: 'VENTA PUBLICO' })
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [searchingCustomer, setSearchingCustomer] = useState(false)
  const [payConfirm, setPayConfirm] = useState(null) // 'cash' | 'card' | null
  const [cardRef, setCardRef] = useState('')          // folio obligatorio si card
  const toast = useToast()

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    async function load() {
      if (!warehouseId) {
        if (alive) {
          setProducts([])
          setError('Tu sesión no tiene almacén asignado. Vuelve a iniciar sesión.')
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError('')
      try {
        const res = await getPosProducts(warehouseId)
        const data = res?.data ?? res
        const list = Array.isArray(data) ? data : (Array.isArray(data?.products) ? data.products : [])
        if (alive) setProducts(list)
      } catch (e) {
        if (alive) setError(e?.message || 'Error cargando productos')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [warehouseId])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await getDefaultCustomer()
        const c = res?.data ?? res
        if (alive && c && c.id) setCustomer({ id: c.id, name: c.name || 'VENTA PUBLICO' })
      } catch (e) { logScreenError('AdminPosForm', 'getDefaultCustomer', e) }
    })()
    return () => { alive = false }
  }, [])

  // Reset cart cuando cambia razón social o almacén
  useEffect(() => {
    setCart([])
    setPayConfirm(null)
  }, [companyId, warehouseId])

  // ── Productos filtrados ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.trim().toLowerCase()
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.default_code || p.sku || '').toLowerCase().includes(q),
    )
  }, [products, search])

  // ── Carrito ───────────────────────────────────────────────────────────────
  function addToCart(product) {
    setCart((prev) => addProductToCart(prev, product))
  }

  function updateQty(productId, delta) {
    setCart((prev) => changeCartItemQty(prev, productId, delta))
  }

  function removeItem(productId) {
    setCart(prev => prev.filter(c => c.product_id !== productId))
  }

  const { subtotal, total } = computePosSummary(cart)

  // ── Cliente ───────────────────────────────────────────────────────────────
  const doCustomerSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setCustomerResults([]); return }
    setSearchingCustomer(true)
    try {
      const res = await searchCustomers(q)
      const data = res?.data ?? res
      setCustomerResults(Array.isArray(data) ? data : [])
    } catch {
      setCustomerResults([])
    } finally {
      setSearchingCustomer(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doCustomerSearch(customerQuery), 400)
    return () => clearTimeout(t)
  }, [customerQuery, doCustomerSearch])

  function selectCustomer(c) {
    setCustomer({ id: c.id, name: c.name })
    setShowCustomerSearch(false)
    setCustomerQuery('')
    setCustomerResults([])
  }

  // ── Cobro ─────────────────────────────────────────────────────────────────
  async function confirmPay() {
    if (!payConfirm || cart.length === 0) return

    // Validación: folio de terminal obligatorio en pagos con tarjeta
    if (payConfirm === 'card') {
      const ref = cardRef.trim()
      if (ref.length < 4) {
        toast.error('Ingresa el folio de la terminal (mínimo 4 caracteres)')
        return
      }
    }

    setSubmitting(true)
    setError('')
    try {
      const result = await createSaleOrder({
        warehouse_id: warehouseId,
        company_id: companyId,
        sucursal_code: sucursal || undefined,
        partner_id: customer.id,
        payment_method: payConfirm,
        // Folio terminal: requerido backend cuando payment_method='card'
        payment_reference: payConfirm === 'card' ? cardRef.trim() : undefined,
        lines: cart.map(c => ({
          product_id: c.product_id,
          qty: c.qty,
          price_unit: c.price_unit,
        })),
      })
      const data = result?.data ?? result
      const orderId = data?.order_id || data?.id
      if (orderId) {
        toast.success('Venta registrada')
        navigate(`/admin/ticket/${orderId}`, { state: { order_id: orderId } })
      } else {
        setError('Venta creada pero sin folio')
      }
    } catch (e) {
      setError(e?.message || 'Error al crear venta')
    } finally {
      setSubmitting(false)
      setPayConfirm(null)
      setCardRef('')
    }
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text, fontSize: 14, outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, margin: 0,
        }}>
          VENTA MOSTRADOR · {companyLabel.toUpperCase()}
        </p>
        <h1 style={{
          fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em',
          color: TOKENS.colors.text, margin: '4px 0 0',
        }}>
          POS
        </h1>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
          fontSize: 12, fontWeight: 600, color: TOKENS.colors.error,
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* ── Columna izquierda: búsqueda + grid productos ── */}
        <div style={{
          padding: 22, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <input
              type="text"
              placeholder="Buscar producto por nombre o SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.colors.textLow, whiteSpace: 'nowrap' }}>
              {loading ? '…' : `${filtered.length} / ${products.length}`}
            </span>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
              <div style={{
                width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)',
                borderTop: '2px solid #2B8FE0', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              padding: '40px 20px', borderRadius: TOKENS.radius.lg, textAlign: 'center',
              background: TOKENS.glass.panelSoft, border: `1px dashed ${TOKENS.colors.border}`,
            }}>
              <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
                {products.length === 0 ? 'Sin productos en este almacén' : 'Sin coincidencias'}
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
              maxHeight: 'calc(100dvh - 260px)',
              overflowY: 'auto',
              paddingRight: 4,
            }}>
              {filtered.map(p => {
                const stock = getDisplayStock(p)
                const inCart = cart.find(c => c.product_id === p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    style={{
                      padding: '12px 12px 10px', borderRadius: TOKENS.radius.md,
                      background: inCart ? `${TOKENS.colors.blue2}14` : TOKENS.colors.surface,
                      border: `1px solid ${inCart ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                      textAlign: 'left',
                      cursor: 'pointer',
                      position: 'relative',
                      minHeight: 92,
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <p style={{
                      fontSize: 12, fontWeight: 600, color: TOKENS.colors.text,
                      margin: 0, lineHeight: 1.3,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {p.name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: TOKENS.colors.blue3 }}>
                        {fmt(p.price || p.list_price || 0)}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        color: TOKENS.colors.textMuted,
                      }}>
                        {stockLabel(stock)}
                      </span>
                    </div>
                    {inCart && (
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        minWidth: 22, height: 22, borderRadius: TOKENS.radius.pill,
                        background: TOKENS.colors.success,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: 'white', padding: '0 6px',
                      }}>
                        {inCart.qty}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Columna derecha: cliente + carrito + totales ── */}
        <div style={{
          padding: 22, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
          position: 'sticky', top: 84,
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100dvh - 100px)',
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
            color: TOKENS.colors.textLow, margin: '0 0 12px',
          }}>
            CLIENTE
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{
              flex: 1, minWidth: 0,
              padding: '8px 12px', borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: 13, color: TOKENS.colors.textSoft,
            }}>
              {customer.name}
            </div>
            <button
              type="button"
              onClick={() => setShowCustomerSearch(v => !v)}
              style={{
                padding: '8px 12px', borderRadius: TOKENS.radius.md,
                background: `${TOKENS.colors.blue2}18`, border: `1px solid ${TOKENS.colors.blue2}30`,
                fontSize: 11, fontWeight: 600, color: TOKENS.colors.blue3,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Cambiar
            </button>
          </div>

          {showCustomerSearch && (
            <div style={{
              padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 12,
              background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <input
                type="text"
                placeholder="Buscar cliente…"
                value={customerQuery}
                onChange={e => setCustomerQuery(e.target.value)}
                autoFocus
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: TOKENS.radius.sm,
                  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                  color: TOKENS.colors.text, fontSize: 12, outline: 'none',
                  fontFamily: "'DM Sans', sans-serif", marginBottom: 8,
                }}
              />
              {searchingCustomer && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
                  <div style={{
                    width: 16, height: 16, border: '2px solid rgba(255,255,255,0.12)',
                    borderTop: '2px solid #2B8FE0', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                </div>
              )}
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {customerResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                      background: 'transparent', fontSize: 12, color: TOKENS.colors.text,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
            color: TOKENS.colors.textLow, margin: '4px 0 10px',
          }}>
            CARRITO · {cart.length}
          </p>

          <div style={{
            flex: 1, minHeight: 0, overflowY: 'auto', marginBottom: 12,
            borderRadius: TOKENS.radius.md,
            border: `1px solid ${TOKENS.colors.border}`,
          }}>
            {cart.length === 0 ? (
              <div style={{ padding: '30px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: TOKENS.colors.textMuted, margin: 0 }}>
                  Agrega productos desde el panel izquierdo
                </p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.product_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                  borderBottom: `1px solid ${TOKENS.colors.border}30`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 12, fontWeight: 600, color: TOKENS.colors.text, margin: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: 10, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                      {fmt(item.price_unit)} c/u
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => updateQty(item.product_id, -1)}
                      style={{
                        width: 24, height: 24, borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: TOKENS.colors.textSoft, fontSize: 13, fontWeight: 700,
                      }}
                    >
                      −
                    </button>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: TOKENS.colors.text,
                      minWidth: 22, textAlign: 'center',
                    }}>
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.product_id, 1)}
                      style={{
                        width: 24, height: 24, borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: TOKENS.colors.textSoft, fontSize: 13, fontWeight: 700,
                      }}
                    >
                      +
                    </button>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: TOKENS.colors.blue3,
                    minWidth: 64, textAlign: 'right',
                  }}>
                    {fmt(item.qty * item.price_unit)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.product_id)}
                    style={{
                      width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: TOKENS.colors.error, flexShrink: 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Totales */}
          <div style={{
            padding: '12px 14px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>Subtotal</span>
              <span style={{ fontSize: 12, color: TOKENS.colors.textSoft }}>{fmt(subtotal)}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              paddingTop: 6, borderTop: `1px solid ${TOKENS.colors.border}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: TOKENS.colors.text }}>Total</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: TOKENS.colors.text }}>{fmt(total)}</span>
            </div>
          </div>

          {/* Acciones de cobro */}
          {payConfirm ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{
                fontSize: 11, color: TOKENS.colors.textSoft,
                textAlign: 'center', margin: 0,
              }}>
                Confirmar pago con <strong>{payConfirm === 'cash' ? 'Efectivo' : 'Terminal'}</strong> — {fmt(total)}
              </p>

              {/* Banner de autorización según monto */}
              {total > POS_THRESHOLDS.DIRECTOR_AUTH && (
                <AuthBanner
                  level="director"
                  title="Venta excepcional"
                  reason={`Monto de ${fmt(total)} requiere autorización de dirección.`}
                />
              )}
              {total > POS_THRESHOLDS.MANAGER_AUTH && total <= POS_THRESHOLDS.DIRECTOR_AUTH && (
                <AuthBanner
                  level="manager"
                  title="Venta con monto alto"
                  reason={`Monto de ${fmt(total)} requiere autorización del gerente de sucursal.`}
                />
              )}

              {/* Folio obligatorio para pagos con tarjeta */}
              {payConfirm === 'card' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: TOKENS.colors.warning }}>
                    FOLIO DE LA TERMINAL *
                  </label>
                  <input
                    type="text"
                    value={cardRef}
                    onChange={e => setCardRef(e.target.value)}
                    placeholder="Ej: 0012345"
                    autoFocus
                    maxLength={32}
                    style={{
                      ...inputStyle, marginTop: 4,
                      borderColor: cardRef.trim().length >= 4 ? TOKENS.colors.border : TOKENS.colors.warning,
                    }}
                  />
                  <p style={{ fontSize: 10, color: TOKENS.colors.textLow, margin: '4px 0 0' }}>
                    Copia el folio exacto del comprobante de la terminal (mín. 4 caracteres).
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { setPayConfirm(null); setCardRef('') }}
                  disabled={submitting}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: TOKENS.radius.md,
                    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                    fontSize: 13, fontWeight: 600, color: TOKENS.colors.textSoft,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmPay}
                  disabled={submitting || (payConfirm === 'card' && cardRef.trim().length < 4)}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: TOKENS.radius.md,
                    background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                    opacity: (submitting || (payConfirm === 'card' && cardRef.trim().length < 4)) ? 0.5 : 1,
                    cursor: submitting ? 'wait' : 'pointer',
                    fontSize: 13, fontWeight: 700, color: 'white',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {submitting ? 'Procesando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => cart.length > 0 && setPayConfirm('cash')}
                disabled={cart.length === 0}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: TOKENS.radius.md,
                  background: cart.length === 0
                    ? TOKENS.colors.surface
                    : `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                  border: cart.length === 0 ? `1px solid ${TOKENS.colors.border}` : 'none',
                  opacity: cart.length === 0 ? 0.5 : 1,
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 700, color: 'white',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Efectivo
              </button>
              <button
                type="button"
                onClick={() => cart.length > 0 && setPayConfirm('card')}
                disabled={cart.length === 0}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: TOKENS.radius.md,
                  background: cart.length === 0
                    ? TOKENS.colors.surface
                    : `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                  border: cart.length === 0 ? `1px solid ${TOKENS.colors.border}` : 'none',
                  opacity: cart.length === 0 ? 0.5 : 1,
                  cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 700, color: 'white',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Terminal
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 20 }} />
    </div>
  )
}
