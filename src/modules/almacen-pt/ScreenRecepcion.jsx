// ScreenRecepcion.jsx — V2 Recepción de Producción
// El almacenista captura lo que recibe de producción, producto por producto.
// Rollout 2026-04-10: LIVE contra backend.
//   POST /api/pt/reception/create (gf.packing.entry + gf.inventory.posting)
// Persistencia local se mantiene como fallback si el backend falla.
// NO depende de gf.pallet (0 registros en producción).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getInventory,
  confirmReception,
  saveReceptionLocal,
  getTodayReceptionsLocal,
  KNOWN_PRODUCTS,
  fmtNum,
  DEFAULT_WAREHOUSE_ID,
} from './ptService'

export default function ScreenRecepcion() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID

  // Form state
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [qtyReported, setQtyReported] = useState('')
  const [qtyReceived, setQtyReceived] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  // History
  const [todayReceptions, setTodayReceptions] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const inv = await getInventory(warehouseId)
      // Build product list from inventory (real stock) + known products
      const seen = new Set()
      const prods = []
      for (const item of inv) {
        const pid = item.product_id || 0
        if (pid && !seen.has(pid)) {
          seen.add(pid)
          prods.push({
            id: pid,
            name: item.product || item.product_name || 'Producto',
            weight: item.weight_per_unit || 1,
            current_qty: item.quantity || 0,
          })
        }
      }
      // Add known products not in inventory
      for (const kp of KNOWN_PRODUCTS) {
        if (!seen.has(kp.id)) {
          prods.push({ id: kp.id, name: kp.name, weight: kp.weight, current_qty: 0 })
        }
      }
      setProducts(prods)
    } catch {
      setProducts(KNOWN_PRODUCTS.map(p => ({ ...p, current_qty: 0 })))
    }
    setTodayReceptions(getTodayReceptionsLocal())
    setLoading(false)
  }

  const diff = qtyReported && qtyReceived ? Number(qtyReceived) - Number(qtyReported) : null
  const diffPct = diff !== null && Number(qtyReported) > 0 ? ((diff / Number(qtyReported)) * 100) : null
  const hasDiff = diff !== null && diff !== 0
  const needsNotes = hasDiff && Math.abs(diffPct) > 5
  const selectedProd = products.find(p => p.id === selectedProduct)
  const totalKg = selectedProd && qtyReceived ? Number(qtyReceived) * selectedProd.weight : 0

  const [error, setError] = useState('')

  async function handleSave() {
    if (!selectedProduct || !qtyReceived) return
    if (needsNotes && !notes.trim()) return
    setSaving(true)
    setError('')

    const payload = {
      product_id: selectedProduct,
      product_name: selectedProd?.name || '',
      qty_reported: Number(qtyReported) || 0,
      qty_received: Number(qtyReceived),
      difference: diff || 0,
      difference_pct: diffPct || 0,
      total_kg: totalKg,
      notes: notes.trim(),
      employee_id: session?.employee_id || 0,
      employee_name: session?.name || '',
      warehouse_id: warehouseId,
    }

    try {
      // LIVE backend call (Sebastián rollout 2026-04-10)
      const backendResult = await confirmReception(payload)
      // Guardar localmente también para el historial inmediato (UX)
      saveReceptionLocal({ ...payload, backend_id: backendResult?.id || backendResult?.packing_entry_id || null })
      setSuccess(`Recepción registrada: ${fmtNum(payload.qty_received)} × ${selectedProd?.name}`)
      setSelectedProduct(null)
      setQtyReported('')
      setQtyReceived('')
      setNotes('')
      setTodayReceptions(getTodayReceptionsLocal())
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(e?.message || 'Error al registrar la recepción. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = selectedProduct && Number(qtyReceived) > 0 && (!needsNotes || notes.trim()) && !saving

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
        input, select, textarea { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/almacen-pt')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Recepción de Producción</span>
          </div>
          {todayReceptions.length > 0 && (
            <div style={{
              padding: '4px 10px', borderRadius: TOKENS.radius.pill,
              background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.success }}>{todayReceptions.length} hoy</span>
            </div>
          )}
        </div>

        {/* Live backend indicator (Sebastián rollout 2026-04-10) */}
        <div style={{
          padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 16,
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: TOKENS.colors.success }} />
          <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: 0 }}>
            Conectado al backend — Se registra en gf.packing.entry e inventario Odoo.
          </p>
        </div>

        {error && (
          <div style={{
            padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
            background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
          }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Product selector */}
            <div>
              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Producto recibido</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {products.slice(0, 12).map(p => (
                  <button key={p.id} onClick={() => setSelectedProduct(p.id === selectedProduct ? null : p.id)}
                    style={{
                      padding: '10px 14px', borderRadius: TOKENS.radius.md,
                      background: selectedProduct === p.id ? 'rgba(43,143,224,0.15)' : TOKENS.colors.surfaceSoft,
                      border: `1px solid ${selectedProduct === p.id ? 'rgba(43,143,224,0.35)' : TOKENS.colors.border}`,
                      transition: `all ${TOKENS.motion.fast}`,
                    }}>
                    <p style={{ ...typo.caption, color: selectedProduct === p.id ? TOKENS.colors.blue2 : TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>
                      {p.name}
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                      Stock: {fmtNum(p.current_qty)}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {selectedProduct && (
              <>
                {/* Qty reported by production */}
                <div>
                  <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
                    Producción dice que salieron (opcional)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setQtyReported(String(Math.max(0, (Number(qtyReported) || 0) - 1)))} style={btnPM}>−</button>
                    <input type="number" inputMode="numeric" value={qtyReported}
                      onChange={e => setQtyReported(e.target.value)}
                      placeholder="0"
                      style={{ ...inputStyle, flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700 }}
                    />
                    <button onClick={() => setQtyReported(String((Number(qtyReported) || 0) + 1))} style={btnPM}>+</button>
                  </div>
                </div>

                {/* Qty received (mandatory) */}
                <div>
                  <label style={{ ...typo.caption, color: TOKENS.colors.text, display: 'block', marginBottom: 6, fontWeight: 700 }}>
                    ¿Cuántas recibiste? (obligatorio)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setQtyReceived(String(Math.max(0, (Number(qtyReceived) || 0) - 1)))} style={btnPM}>−</button>
                    <input type="number" inputMode="numeric" value={qtyReceived}
                      onChange={e => setQtyReceived(e.target.value)}
                      placeholder="0"
                      style={{ ...inputStyle, flex: 1, textAlign: 'center', fontSize: 24, fontWeight: 700, borderColor: 'rgba(43,143,224,0.3)' }}
                    />
                    <button onClick={() => setQtyReceived(String((Number(qtyReceived) || 0) + 1))} style={btnPM}>+</button>
                  </div>
                  {/* Quick buttons */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {[10, 20, 50, 100].map(n => (
                      <button key={n} onClick={() => setQtyReceived(String(n))} style={{
                        flex: 1, padding: '8px 0', borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                        color: TOKENS.colors.textMuted, fontSize: 12, fontWeight: 600,
                      }}>{n}</button>
                    ))}
                  </div>
                </div>

                {/* Kg total */}
                {totalKg > 0 && (
                  <div style={{
                    padding: 12, borderRadius: TOKENS.radius.md,
                    background: 'rgba(43,143,224,0.06)', border: '1px solid rgba(43,143,224,0.2)',
                    textAlign: 'center',
                  }}>
                    <span style={{ ...typo.body, color: TOKENS.colors.blue2, fontWeight: 700 }}>
                      {Number(qtyReceived)} × {selectedProd?.weight || 1} kg = {fmtNum(totalKg)} kg
                    </span>
                  </div>
                )}

                {/* Difference alert */}
                {hasDiff && (
                  <div style={{
                    padding: 12, borderRadius: TOKENS.radius.md,
                    background: Math.abs(diffPct) > 5 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                    border: `1px solid ${Math.abs(diffPct) > 5 ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                  }}>
                    <p style={{
                      ...typo.body, margin: 0, fontWeight: 700,
                      color: Math.abs(diffPct) > 5 ? TOKENS.colors.error : TOKENS.colors.warning,
                    }}>
                      Diferencia: {diff > 0 ? '+' : ''}{diff} ({diffPct > 0 ? '+' : ''}{diffPct?.toFixed(1)}%)
                    </p>
                    {needsNotes && (
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
                        Diferencia mayor a 5% — notas obligatorias
                      </p>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
                    Notas {needsNotes ? '(obligatorias)' : '(opcional)'}
                  </label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Observaciones de la recepción..."
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 56, borderColor: needsNotes && !notes.trim() ? 'rgba(239,68,68,0.3)' : undefined }}
                  />
                </div>

                {/* Submit */}
                <button onClick={handleSave} disabled={!canSave}
                  style={{
                    width: '100%', padding: '16px', borderRadius: TOKENS.radius.lg,
                    background: canSave ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                    color: canSave ? 'white' : TOKENS.colors.textLow,
                    fontSize: 15, fontWeight: 700, opacity: saving ? 0.6 : 1,
                    boxShadow: canSave ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                  }}>
                  {saving ? 'Guardando...' : 'CONFIRMAR RECEPCIÓN'}
                </button>
              </>
            )}

            {/* Success */}
            {success && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                textAlign: 'center',
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.success, margin: 0, fontWeight: 600 }}>{success}</p>
              </div>
            )}

            {/* Today history */}
            {todayReceptions.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 8 }}>RECEPCIONES DE HOY</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {todayReceptions.map(r => {
                    const rDiff = r.qty_reported > 0 ? r.qty_received - r.qty_reported : null
                    const time = r.timestamp ? new Date(r.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
                    return (
                      <div key={r.id} style={{
                        padding: '10px 14px', borderRadius: TOKENS.radius.md,
                        background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.product_name}
                          </p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                            {time} · {fmtNum(r.qty_received)} uds · {fmtNum(r.total_kg)} kg
                          </p>
                        </div>
                        {rDiff !== null && rDiff !== 0 && (
                          <div style={{
                            padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                            background: rDiff < 0 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            border: `1px solid ${rDiff < 0 ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: rDiff < 0 ? TOKENS.colors.error : TOKENS.colors.warning }}>
                              {rDiff > 0 ? '+' : ''}{rDiff}
                            </span>
                          </div>
                        )}
                        {(rDiff === null || rDiff === 0) && (
                          <div style={{
                            padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: TOKENS.colors.success }}>OK</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <div style={{ height: 32 }} />
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 14,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
  color: 'white', fontSize: 15, fontWeight: 600, outline: 'none',
}

const btnPM = {
  width: 48, height: 48, borderRadius: 14,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
}
