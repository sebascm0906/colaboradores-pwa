import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getModuleById } from '../registry'
import { resolveModuleContextRole } from '../../lib/roleContext'
import { getMyShift, getPackingProducts, createPackingEntry, getPackingEntries } from './api'

// V2: Rolito users get the new simplified packing flow
import ScreenEmpaqueRolito from './ScreenEmpaqueRolito'

const FALLBACK_ROLITO = [
  { id: 758, name: 'Rolito 15 KG', weight: 15 },
  { id: 761, name: 'Rolito 5.5 KG', weight: 5.5 },
  { id: 760, name: 'Rolito 3.8 KG', weight: 3.8 },
]

const FALLBACK_BARRAS = [
  { id: 724, name: 'Barra Grande (75 kg)', weight: 75 },
  { id: 725, name: 'Barra Chica (50 kg)', weight: 50 },
  { id: 727, name: '1/2 Barra Grande (35 kg)', weight: 35 },
  { id: 728, name: '1/2 Barra Chica (25 kg)', weight: 25 },
  { id: 726, name: '1/4 Barra Grande (15 kg)', weight: 15 },
]

export default function ScreenEmpaque() {
  const { session } = useSession()
  const location = useLocation()
  const activeRole = resolveModuleContextRole(
    session,
    getModuleById('registro_produccion'),
    location.state?.selected_role,
  ) || session?.role || ''

  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const isBarras = activeRole === 'operador_barra'
  const FALLBACK_PRODUCTS = isBarras ? FALLBACK_BARRAS : FALLBACK_ROLITO
  const [shift, setShift] = useState(null)
  const [products, setProducts] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Formulario
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [qtyBags, setQtyBags] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (activeRole === 'operador_rolito') return
    loadData()
  }, [activeRole])

  // V2: Rolito operators get the new simplified packing
  if (activeRole === 'operador_rolito') {
    return <ScreenEmpaqueRolito />
  }

  async function loadData() {
    setLoading(true)
    try {
      const s = await getMyShift()
      setShift(s)
      if (!s?.id) { setError('Sin turno activo'); return }

      const [prods, ents] = await Promise.all([
        getPackingProducts({
          shift_id: s.id,
          line_type: isBarras ? 'barras' : 'rolito',
        }).catch(() => FALLBACK_PRODUCTS),
        getPackingEntries(s.id).catch(() => []),
      ])
      setProducts(prods?.length ? prods : FALLBACK_PRODUCTS)
      setEntries(ents || [])
    } catch {
      setError('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }

  const totalKg = selectedProduct && qtyBags
    ? (parseFloat(qtyBags) * (selectedProduct.weight || selectedProduct.kg_per_bag || 0)).toFixed(1)
    : '0'

  const totalPackedKg = entries.reduce((s, e) => s + (e.total_kg || 0), 0)

  // Requiere cantidad > 0 para evitar registros fantasma
  const qtyParsed = qtyBags === '' ? 0 : parseInt(qtyBags)
  const canSubmit = !!selectedProduct && qtyParsed > 0 && !saving

  async function handleSubmit() {
    if (!selectedProduct || !qtyParsed || qtyParsed <= 0 || !shift?.id) return
    setError('')
    setSaving(true)
    try {
      await createPackingEntry({
        shift_id: shift.id,
        product_id: selectedProduct.id,
        qty_bags: parseInt(qtyBags),
        timestamp: (() => { const d = new Date(); const p = (n) => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; })(),
      })
      setSuccess(`${qtyBags} ${isBarras ? 'piezas' : 'bolsas'} registradas (${totalKg} kg)`)
      setQtyBags('')
      // Recargar entradas
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>{isBarras ? 'Registro de Barras' : 'Empaque de Bolsas'}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Total empacado del turno */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              textAlign: 'center',
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>TOTAL EMPACADO HOY</p>
              <p style={{ fontSize: 32, fontWeight: 700, color: TOKENS.colors.success, margin: 0, letterSpacing: '-0.03em' }}>
                {totalPackedKg.toFixed(0)} <span style={{ fontSize: 16, fontWeight: 500, color: TOKENS.colors.textMuted }}>kg</span>
              </p>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>{entries.length} registros</p>
            </div>

            {/* Selección de producto */}
            <div>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>{isBarras ? 'TIPO DE PRODUCTO' : 'TIPO DE BOLSA'}</p>
              {/* Buscador — visible cuando hay muchos productos */}
              {products.length > 8 && (
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar producto..."
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                    color: 'white', fontSize: 14, fontWeight: 500, outline: 'none',
                    marginBottom: 10,
                  }}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: products.length > 8 ? 340 : 'none', overflowY: products.length > 8 ? 'auto' : 'visible' }}>
                {products.filter(p => {
                  if (!searchTerm.trim()) return true
                  // Búsqueda por palabras: todas las palabras deben coincidir
                  const words = searchTerm.toLowerCase().split(/\s+/).filter(Boolean)
                  const haystack = ((p.name || '') + ' ' + String(p.weight || p.kg_per_bag || '')).toLowerCase()
                  return words.every(w => haystack.includes(w))
                }).map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProduct(p)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', borderRadius: TOKENS.radius.md,
                      background: selectedProduct?.id === p.id ? 'rgba(43,143,224,0.12)' : TOKENS.colors.surface,
                      border: `1px solid ${selectedProduct?.id === p.id ? 'rgba(43,143,224,0.35)' : TOKENS.colors.border}`,
                      transition: `border-color ${TOKENS.motion.fast}`,
                      width: '100%',
                    }}
                  >
                    <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600 }}>
                      {p.name}
                    </span>
                    <span style={{ ...typo.caption, color: TOKENS.colors.blue2, fontWeight: 700 }}>
                      {p.weight || p.kg_per_bag} kg
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cantidad de bolsas */}
            <div>
              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
                {isBarras ? 'Cantidad de piezas' : 'Cantidad de bolsas'}
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={qtyBags}
                onChange={e => setQtyBags(e.target.value)}
                placeholder="0"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: TOKENS.radius.md,
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                  color: 'white', fontSize: 22, fontWeight: 700, outline: 'none',
                  textAlign: 'center', letterSpacing: '-0.02em',
                }}
              />
              {selectedProduct && qtyBags && (
                <p style={{ ...typo.body, color: TOKENS.colors.blue2, textAlign: 'center', marginTop: 8, fontWeight: 600 }}>
                  = {totalKg} kg
                </p>
              )}
            </div>

            {/* Último registro */}
            {success && entries.length > 0 && (() => {
              const last = entries[entries.length - 1]
              return (
                <div style={{
                  padding: '12px 16px', borderRadius: TOKENS.radius.md,
                  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: 0, fontWeight: 700 }}>
                    {success}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
                      {last.product_name || last.product_id?.[1] || 'Producto'}
                    </span>
                    <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 600 }}>
                      {last.qty_bags} {isBarras ? 'pzas' : 'bolsas'} &middot; {(last.total_kg || 0).toFixed(1)} kg
                    </span>
                  </div>
                  {/* Placeholder: botón deshacer se puede agregar aquí */}
                </div>
              )
            })()}

            {/* Mensajes */}
            {error && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
                color: TOKENS.colors.error, ...typo.caption, textAlign: 'center',
              }}>{error}</div>
            )}
            {success && !entries.length && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                color: TOKENS.colors.success, ...typo.caption, textAlign: 'center',
              }}>{success}</div>
            )}

            {/* Botón registrar */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '14px',
                borderRadius: TOKENS.radius.lg,
                background: canSubmit ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: canSubmit ? 'white' : TOKENS.colors.textLow,
                fontSize: 15, fontWeight: 600,
                opacity: saving ? 0.6 : 1,
                boxShadow: canSubmit ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
              }}
            >
              {saving ? 'Guardando...' : 'Registrar Empaque'}
            </button>

            {/* Historial del turno */}
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
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                          {e.qty_bags} {isBarras ? 'pzas' : 'bolsas'}
                        </p>
                      </div>
                      <span style={{ ...typo.body, color: TOKENS.colors.success, fontWeight: 700 }}>
                        {(e.total_kg || 0).toFixed(1)} kg
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
