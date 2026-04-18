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
  getProducts,
  registerPacking,
  FALLBACK_PRODUCTS,
} from './rolitoService'
import { getPackingEntries } from './api'
import { computePackingCoherence } from '../shared/packingCoherence'
import { getMaterialIssues } from '../almacen-pt/materialsService'

function getUnpackedCycles(cycles, entries) {
  const coherence = computePackingCoherence(cycles, entries)
  const pendingIds = new Set(
    coherence.perCycle
      .filter(c => c.status === 'unpacked' || c.status === 'partial')
      .map(c => c.cycleId)
  )
  return (cycles || [])
    .filter(c => pendingIds.has(c.id))
    .sort((a, b) => (b.cycle_number || 0) - (a.cycle_number || 0))
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractKgHints(value) {
  const text = normalizeName(value)
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*kg/g)]
  return matches.map(m => Number(m[1])).filter(n => Number.isFinite(n) && n > 0)
}

function filterPackingProductsByIssues(products, issues) {
  const validIssues = (issues || []).filter(it => {
    const state = String(it?.settlement_state || it?.state || '').toLowerCase()
    return state !== 'rejected' && state !== 'cancelled' && state !== 'abandoned'
  })
  if (!validIssues.length) return products

  const issueNames = validIssues.map(it => normalizeName(it.product_name || it.material_name || ''))
  const issueWeights = validIssues.flatMap(it => extractKgHints(it.product_name || it.material_name || ''))
  const filtered = (products || []).filter(p => {
    const productName = normalizeName(p.name)
    const productWeight = Number(p.weight || p.kg_per_bag || 0)
    const nameMatch = issueNames.some(name => name && (name.includes(productName) || productName.includes(name)))
    const weightMatch = issueWeights.some(w => Math.abs(w - productWeight) <= 0.6)
    return nameMatch || weightMatch
  })

  return filtered.length ? filtered : products
}

export default function ScreenEmpaqueRolito() {
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [shift, setShift] = useState(null)
  const [products, setProducts] = useState(FALLBACK_PRODUCTS)
  const [entries, setEntries] = useState([])
  const [cycles, setCycles] = useState([])
  const [selectedCycleId, setSelectedCycleId] = useState(null)
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
      setEntries([])
      setCycles(overview.cycles || [])

      if (overview.shift?.id) {
        const [ents, issues] = await Promise.all([
          getPackingEntries(overview.shift.id).catch(() => []),
          getMaterialIssues({ shiftId: overview.shift.id, lineId: 2 }).catch(() => ({ items: [] })),
        ])
        setEntries(ents || [])
        setProducts(filterPackingProductsByIssues(prods, issues?.items || []))
      } else {
        setProducts(prods)
      }

      setSelectedCycleId(prev => {
        if (prev && (overview.cycles || []).some(c => c.id === prev)) return prev
        const pending = getUnpackedCycles(overview.cycles || [], overview.shift?.id ? (overview.packing || []) : [])
        return pending[0]?.id || null
      })
    } catch {
      setError('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [])

  const unpackedCycles = useMemo(() => getUnpackedCycles(cycles, entries), [cycles, entries])
  const selectedCycle = useMemo(
    () => cycles.find(c => c.id === selectedCycleId) || null,
    [cycles, selectedCycleId]
  )

  // Coherencia ciclos vs empaque — warnings no bloqueantes (Fase 3)
  const coherence = useMemo(
    () => computePackingCoherence(cycles, entries),
    [cycles, entries]
  )
  const selectedCycleCoherence = useMemo(
    () => selectedCycleId
      ? coherence.perCycle.find(x => x.cycleId === selectedCycleId) || null
      : null,
    [coherence, selectedCycleId]
  )

  useEffect(() => { loadData() }, [loadData])

  const productWeight = selectedProduct?.weight || selectedProduct?.kg_per_bag || 0
  const totalKg = (qtyBags * productWeight).toFixed(1)
  const totalPackedKg = entries.reduce((s, e) => s + (e.total_kg || 0), 0)

  async function handleSubmit() {
    if (!selectedProduct || qtyBags <= 0 || !shift?.id) return
    // Bloqueo duro: ciclo obligatorio
    if (!selectedCycleId) {
      setError('Selecciona el ciclo al que pertenece este empaque')
      return
    }
    setSaving(true)
    setError('')
    try {
      // cycle_id se envia siempre — backend debe persistirlo
      await registerPacking(shift.id, selectedProduct.id, qtyBags, selectedCycleId)
      setSuccess(`${qtyBags} bolsas registradas (${totalKg} kg)`)
      setQtyBags(0)
      // Reload entries
      const ents = await getPackingEntries(shift.id).catch(() => [])
      setEntries(ents || [])
      setSelectedProduct(null)
      const pendingAfterSave = getUnpackedCycles(cycles, ents || [])
      setSelectedCycleId(pendingAfterSave[0]?.id || null)
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

            {/* Cycle selector — obligatorio */}
            <div>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>
                CICLO DE ESTE EMPAQUE <span style={{ color: TOKENS.colors.error }}>*</span>
              </p>
              {unpackedCycles.length === 0 ? (
                <div style={{
                  padding: 12, borderRadius: TOKENS.radius.md,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                  textAlign: 'center',
                }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0, fontWeight: 600 }}>
                    No hay ciclos terminados todavia
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    Termina un ciclo de congelacion antes de empacar
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                  {unpackedCycles.map(c => {
                    const active = selectedCycleId === c.id
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCycleId(c.id)}
                        style={{
                          flexShrink: 0, padding: '10px 14px', borderRadius: TOKENS.radius.md,
                          background: active ? 'rgba(43,143,224,0.16)' : TOKENS.colors.surface,
                          border: `2px solid ${active ? 'rgba(43,143,224,0.5)' : TOKENS.colors.border}`,
                          color: active ? TOKENS.colors.blue2 : TOKENS.colors.textSoft,
                          fontSize: 13, fontWeight: 700,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        }}
                      >
                        <span>Ciclo #{c.cycle_number || c.id}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>
                          {Math.round(c.kg_dumped || 0)} kg
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {selectedCycle && (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 0', textAlign: 'center' }}>
                  Seleccionado: Ciclo #{selectedCycle.cycle_number || selectedCycle.id} — {Math.round(selectedCycle.kg_dumped || 0)} kg producidos
                </p>
              )}

              {/* Alerta de coherencia (no bloquea) */}
              {selectedCycleCoherence && selectedCycleCoherence.status !== 'ok' && (
                <div style={{
                  marginTop: 8, padding: '10px 12px', borderRadius: TOKENS.radius.md,
                  background: selectedCycleCoherence.status === 'over'
                    ? 'rgba(239,68,68,0.08)'
                    : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${selectedCycleCoherence.status === 'over'
                    ? 'rgba(239,68,68,0.25)'
                    : 'rgba(245,158,11,0.25)'}`,
                }}>
                  <p style={{
                    ...typo.caption, margin: 0, fontWeight: 600,
                    color: selectedCycleCoherence.status === 'over'
                      ? TOKENS.colors.error
                      : TOKENS.colors.warning,
                  }}>
                    {selectedCycleCoherence.status === 'over'
                      ? 'Ya empacaste mas de lo producido en este ciclo'
                      : selectedCycleCoherence.status === 'partial'
                        ? 'Aun falta empacar producto de este ciclo'
                        : 'Este ciclo aun no se ha empacado'}
                  </p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    Producido {Math.round(selectedCycleCoherence.produced)} kg · Empacado {Math.round(selectedCycleCoherence.packed)} kg
                  </p>
                </div>
              )}
            </div>

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
            {(() => {
              const canSubmit = selectedProduct && qtyBags > 0 && selectedCycleId
              const labelBlocked = !selectedCycleId ? 'SELECCIONA UN CICLO' :
                !selectedProduct ? 'SELECCIONA UNA BOLSA' :
                qtyBags <= 0 ? 'INGRESA CANTIDAD' : 'CONFIRMAR EMPAQUE'
              return (
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || saving}
                  style={{
                    width: '100%', padding: '16px',
                    borderRadius: TOKENS.radius.lg,
                    background: canSubmit ? 'linear-gradient(90deg, #15803d, #22c55e)' : TOKENS.colors.surface,
                    color: canSubmit ? 'white' : TOKENS.colors.textLow,
                    fontSize: 16, fontWeight: 700,
                    boxShadow: canSubmit ? '0 10px 24px rgba(34,197,94,0.25)' : 'none',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? 'Guardando...' : labelBlocked}
                </button>
              )
            })()}

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
