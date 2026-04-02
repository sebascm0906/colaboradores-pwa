import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getReadyPallets, getCedisList, createDispatch } from './api'

export default function ScreenDespacho() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [pallets, setPallets] = useState([])
  const [cedisList, setCedisList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [selectedPallets, setSelectedPallets] = useState(new Set())
  const [selectedCedis, setSelectedCedis] = useState(null)

  const warehouseId = session?.warehouse_id || 76

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([
        getReadyPallets(warehouseId).catch(() => []),
        getCedisList().catch(() => []),
      ])
      setPallets(p || [])
      setCedisList(c || [])
    } catch { /* fallback empty */ }
    finally { setLoading(false) }
  }

  function togglePallet(id) {
    setSelectedPallets(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    if (selectedPallets.size === pallets.length) {
      setSelectedPallets(new Set())
    } else {
      setSelectedPallets(new Set(pallets.map(p => p.id)))
    }
  }

  const selectedKg = pallets.filter(p => selectedPallets.has(p.id)).reduce((s, p) => s + (p.kg_total || 0), 0)

  async function handleDispatch() {
    if (!selectedCedis || selectedPallets.size === 0) return
    setError('')
    setSaving(true)
    try {
      await createDispatch({
        warehouse_id: warehouseId,
        cedis_id: selectedCedis,
        pallet_ids: Array.from(selectedPallets),
      })
      setSuccess(`Traspaso creado: ${selectedPallets.size} tarimas → ${cedisList.find(c => c.id === selectedCedis)?.name || 'CEDIS'}`)
      setSelectedPallets(new Set())
      setSelectedCedis(null)
      const p = await getReadyPallets(warehouseId).catch(() => [])
      setPallets(p || [])
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) {
      setError(e.message || 'Error al crear traspaso')
    } finally { setSaving(false) }
  }

  const canDispatch = selectedPallets.size > 0 && selectedCedis && !saving

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
        select { font-family: 'DM Sans', sans-serif; }
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Despacho a CEDIS</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Seleccionar CEDIS destino */}
            <div>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>DESTINO</p>
              <select value={selectedCedis || ''} onChange={e => setSelectedCedis(parseInt(e.target.value) || null)}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: TOKENS.radius.md,
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                  color: 'white', fontSize: 15, fontWeight: 600, outline: 'none',
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'10\' height=\'6\' viewBox=\'0 0 10 6\' fill=\'none\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M1 1L5 5L9 1\' stroke=\'rgba(255,255,255,0.4)\' stroke-width=\'1.5\' stroke-linecap=\'round\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: 36,
                }}>
                <option value="">Seleccionar CEDIS...</option>
                {cedisList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Tarimas disponibles */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>TARIMAS DISPONIBLES</p>
                {pallets.length > 0 && (
                  <button onClick={selectAll} style={{ ...typo.caption, color: TOKENS.colors.blue2, fontWeight: 600 }}>
                    {selectedPallets.size === pallets.length ? 'Deseleccionar' : 'Seleccionar todas'}
                  </button>
                )}
              </div>

              {pallets.length === 0 ? (
                <div style={{
                  padding: 20, borderRadius: TOKENS.radius.lg,
                  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                  textAlign: 'center',
                }}>
                  <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>No hay tarimas listas para despacho</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pallets.map(p => {
                    const selected = selectedPallets.has(p.id)
                    return (
                      <button key={p.id} onClick={() => togglePallet(p.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: TOKENS.radius.md,
                        background: selected ? 'rgba(34,197,94,0.08)' : TOKENS.colors.surfaceSoft,
                        border: `1px solid ${selected ? 'rgba(34,197,94,0.25)' : TOKENS.colors.border}`,
                        width: '100%', textAlign: 'left',
                        transition: `border-color ${TOKENS.motion.fast}, background ${TOKENS.motion.fast}`,
                      }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: 6,
                          background: selected ? TOKENS.colors.success : 'transparent',
                          border: `2px solid ${selected ? TOKENS.colors.success : 'rgba(255,255,255,0.2)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {selected && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{p.product || p.name}</p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{p.qty || 0} unidades</p>
                        </div>
                        <span style={{ ...typo.body, color: TOKENS.colors.blue2, fontWeight: 700 }}>{p.kg_total || 0} kg</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Resumen */}
            {selectedPallets.size > 0 && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.lg,
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ ...typo.body, color: TOKENS.colors.textSoft }}>{selectedPallets.size} tarimas seleccionadas</span>
                <span style={{ ...typo.body, color: TOKENS.colors.success, fontWeight: 700 }}>{selectedKg.toFixed(0)} kg</span>
              </div>
            )}

            {error && <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: TOKENS.colors.error, fontSize: 13, textAlign: 'center' }}>{error}</div>}
            {success && <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: TOKENS.colors.success, fontSize: 13, textAlign: 'center' }}>{success}</div>}

            {/* Botón despachar */}
            <button onClick={handleDispatch} disabled={!canDispatch}
              style={{
                width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
                background: canDispatch ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: canDispatch ? 'white' : TOKENS.colors.textLow,
                fontSize: 15, fontWeight: 600, opacity: saving ? 0.6 : 1,
                boxShadow: canDispatch ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
              }}>
              {saving ? 'Creando traspaso...' : 'Despachar a CEDIS'}
            </button>

            <div style={{ height: 24 }} />
          </div>
        )}
      </div>
    </div>
  )
}
