// ScreenEmpaqueRolito.jsx — V2 Empaque Simplificado Operador de Rolito
// UX optimizada para operador con baja escolaridad:
// - Botones grandes de producto (no dropdown)
// - Botones +/- para cantidad (no input numerico directo)
// - Total kg calculado en grande
// - Vinculo con cycle_id (se envia, backend puede o no persistirlo)
// - Historial del turno visible
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getShiftOverview,
  getLastDumpedCycle,
  getProducts,
  registerPacking,
  FALLBACK_PRODUCTS,
} from './rolitoService'
import { getPackingEntries } from './api'

export default function ScreenEmpaqueRolito() {
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [shift, setShift] = useState(null)
  const [products, setProducts] = useState(FALLBACK_PRODUCTS)
  const [entries, setEntries] = useState([])
  const [lastCycleId, setLastCycleId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [qtyBags, setQtyBags] = useState(0)

  const loadData = useCallback(async () => {
    try {
      setError('')
      const [overview, prods] = await Promise.all([
        getShiftOverview(),
        getProducts(),
      ])
      setShift(overview.shift)
      setProducts(prods)
      setEntries([])

      if (overview.shift?.id) {
        const ents = await getPackingEntries(overview.shift.id).catch(() => [])
        setEntries(ents || [])
      }

      // Get last dumped cycle for linking
      const lastDumped = getLastDumpedCycle(overview.cycles)
      setLastCycleId(lastDumped?.id || null)
    } catch {
      setError('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const productWeight = selectedProduct?.weight || selectedProduct?.kg_per_bag || 0
  const totalKg = (qtyBags * productWeight).toFixed(1)
  const totalPackedKg = entries.reduce((s, e) => s + (e.total_kg || 0), 0)

  async function handleSubmit() {
    if (!selectedProduct || qtyBags <= 0 || !shift?.id) return
    setSaving(true)
    setError('')
    try {
      // cycle_id se envia — backend puede o no vincularlo
      await registerPacking(shift.id, selectedProduct.id, qtyBags, lastCycleId)
      setSuccess(`${qtyBags} bolsas registradas (${totalKg} kg)`)
      setQtyBags(0)
      // Reload entries
      const ents = await getPackingEntries(shift.id).catch(() => [])
      setEntries(ents || [])
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(e.message || 'Error al registrar empaque')
    } finally {
      setSaving(false)
    }
  }

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
        input { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Empaque de Bolsas</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Total packed today */}
            <div style={{
              padding: 14, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              textAlign: 'center',
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>TOTAL EMPACADO HOY</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: TOKENS.colors.success, margin: 0 }}>
                {totalPackedKg.toFixed(0)} <span style={{ fontSize: 14, fontWeight: 500, color: TOKENS.colors.textMuted }}>kg</span>
              </p>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 2 }}>{entries.length} registros</p>
            </div>

            {/* cycle_id linkage notice */}
            {lastCycleId && (
              <div style={{
                padding: 8, borderRadius: TOKENS.radius.md,
                background: 'rgba(43,143,224,0.06)', border: '1px solid rgba(43,143,224,0.15)',
                textAlign: 'center',
              }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.blue2, margin: 0 }}>
                  Vinculado al ciclo #{lastCycleId}
                  <span style={{ color: TOKENS.colors.textLow }}> (si backend lo acepta)</span>
                </p>
              </div>
            )}

            {/* Product selection — big buttons */}
            <div>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>TIPO DE BOLSA</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {products.map(p => {
                  const isSelected = selectedProduct?.id === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedProduct(p); if (qtyBags === 0) setQtyBags(1) }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 16px', borderRadius: TOKENS.radius.md,
                        background: isSelected ? 'rgba(43,143,224,0.14)' : TOKENS.colors.surface,
                        border: `2px solid ${isSelected ? 'rgba(43,143,224,0.5)' : TOKENS.colors.border}`,
                        transition: `border-color ${TOKENS.motion.fast}`,
                        width: '100%',
                      }}
                    >
                      <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600, fontSize: 15 }}>
                        {p.name}
                      </span>
                      <span style={{
                        ...typo.body, fontWeight: 700, fontSize: 15,
                        color: isSelected ? TOKENS.colors.blue2 : TOKENS.colors.textMuted,
                      }}>
                        {p.weight || p.kg_per_bag} kg
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quantity with +/- buttons */}
            {selectedProduct && (
              <div>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>CANTIDAD DE BOLSAS</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <button
                    onClick={() => setQtyBags(q => Math.max(0, q - 1))}
                    style={{
                      width: 56, height: 56, borderRadius: TOKENS.radius.md,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 28, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >-</button>
                  <div style={{ textAlign: 'center', minWidth: 80 }}>
                    <p style={{ fontSize: 40, fontWeight: 700, color: TOKENS.colors.text, margin: 0, letterSpacing: '-0.04em' }}>
                      {qtyBags}
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>bolsas</p>
                  </div>
                  <button
                    onClick={() => setQtyBags(q => q + 1)}
                    style={{
                      width: 56, height: 56, borderRadius: TOKENS.radius.md,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 28, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >+</button>
                </div>

                {/* Quick quantity buttons */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10 }}>
                  {[5, 10, 20, 50].map(n => (
                    <button key={n} onClick={() => setQtyBags(n)}
                      style={{
                        padding: '6px 14px', borderRadius: TOKENS.radius.pill,
                        background: qtyBags === n ? 'rgba(43,143,224,0.15)' : TOKENS.colors.surfaceSoft,
                        border: `1px solid ${qtyBags === n ? 'rgba(43,143,224,0.3)' : TOKENS.colors.border}`,
                        color: qtyBags === n ? TOKENS.colors.blue2 : TOKENS.colors.textMuted,
                        fontSize: 12, fontWeight: 700,
                      }}>
                      {n}
                    </button>
                  ))}
                </div>

                {/* Total kg */}
                {qtyBags > 0 && (
                  <div style={{ textAlign: 'center', marginTop: 12 }}>
                    <p style={{ fontSize: 22, fontWeight: 700, color: TOKENS.colors.success, margin: 0 }}>
                      = {totalKg} kg
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
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

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!selectedProduct || qtyBags <= 0 || saving}
              style={{
                width: '100%', padding: '16px',
                borderRadius: TOKENS.radius.lg,
                background: (selectedProduct && qtyBags > 0) ? 'linear-gradient(90deg, #15803d, #22c55e)' : TOKENS.colors.surface,
                color: (selectedProduct && qtyBags > 0) ? 'white' : TOKENS.colors.textLow,
                fontSize: 16, fontWeight: 700,
                boxShadow: (selectedProduct && qtyBags > 0) ? '0 10px 24px rgba(34,197,94,0.25)' : 'none',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Guardando...' : 'CONFIRMAR EMPAQUE'}
            </button>

            {/* History */}
            {entries.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 8, marginBottom: 8 }}>REGISTROS DEL TURNO</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {entries.slice().reverse().map((e, i) => (
                    <div key={e.id || i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: TOKENS.radius.sm,
                      background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                    }}>
                      <div>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>
                          {e.product_name || e.product_id?.[1] || 'Bolsa'}
                        </p>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 1 }}>
                          {e.qty_bags} bolsas
                          {e.cycle_id ? ` · Ciclo #${Array.isArray(e.cycle_id) ? e.cycle_id[0] : e.cycle_id}` : ''}
                        </p>
                      </div>
                      <span style={{ ...typo.body, color: TOKENS.colors.success, fontWeight: 700 }}>
                        {(e.total_kg || 0).toFixed(0)} kg
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ height: 24 }} />
          </div>
        )}
      </div>
    </div>
  )
}
