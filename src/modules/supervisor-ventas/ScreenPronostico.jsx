import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getForecastProducts, createForecast, getForecasts } from './api'

const CHANNELS = ['Van', 'Mostrador']

export default function ScreenPronostico() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [products, setProducts] = useState([])
  const [forecasts, setForecasts] = useState([])
  const [lines, setLines] = useState([{ product_id: '', channel: 'Van', qty: '' }])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [p, f] = await Promise.all([
        getForecastProducts().catch(() => []),
        getForecasts().catch(() => []),
      ])
      setProducts(p || [])
      setForecasts(f || [])
    } catch { /* empty */ }
    finally { setLoading(false) }
  }

  function updateLine(idx, field, value) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function addLine() {
    setLines(prev => [...prev, { product_id: '', channel: 'Van', qty: '' }])
  }

  function removeLine(idx) {
    if (lines.length <= 1) return
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    const validLines = lines.filter(l => l.product_id && l.qty > 0)
    if (validLines.length === 0) { setMsg('Agrega al menos un producto'); return }

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateTarget = tomorrow.toISOString().split('T')[0]

    setSubmitting(true)
    setMsg(null)
    try {
      await createForecast({
        date_target: dateTarget,
        lines: validLines.map(l => ({ product_id: Number(l.product_id), channel: l.channel, qty: Number(l.qty) })),
        sucursal: session?.sucursal_id || session?.sucursal,
      })
      setMsg('Pronostico guardado')
      setLines([{ product_id: '', channel: 'Van', qty: '' }])
      const f = await getForecasts().catch(() => [])
      setForecasts(f || [])
    } catch (e) {
      setMsg(e.message || 'Error al guardar')
    } finally { setSubmitting(false) }
  }

  function statusColor(status) {
    if (status === 'confirmed' || status === 'done') return TOKENS.colors.success
    if (status === 'draft') return TOKENS.colors.warning
    return TOKENS.colors.textMuted
  }

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
        select, input { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/equipo')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Pronostico</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Form */}
            <div style={{
              marginTop: 8, padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 14 }}>PRONOSTICO PARA MANANA</p>

              {lines.map((line, idx) => (
                <div key={idx} style={{
                  padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 10,
                  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  {/* Product selector */}
                  <select
                    value={line.product_id}
                    onChange={e => updateLine(idx, 'product_id', e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 14, marginBottom: 8, outline: 'none',
                    }}
                  >
                    <option value="">Seleccionar producto...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.display_name}</option>
                    ))}
                  </select>

                  {/* Channel pills */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {CHANNELS.map(ch => (
                      <button key={ch} onClick={() => updateLine(idx, 'channel', ch)} style={{
                        flex: 1, padding: '8px 0', borderRadius: TOKENS.radius.pill, fontSize: 13, fontWeight: 600,
                        background: line.channel === ch ? `${TOKENS.colors.blue2}22` : TOKENS.colors.surface,
                        border: `1px solid ${line.channel === ch ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                        color: line.channel === ch ? TOKENS.colors.blue2 : TOKENS.colors.textMuted,
                      }}>{ch}</button>
                    ))}
                  </div>

                  {/* Qty + remove */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Cantidad"
                      value={line.qty}
                      onChange={e => updateLine(idx, 'qty', e.target.value)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        color: TOKENS.colors.text, fontSize: 14, outline: 'none',
                      }}
                    />
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(idx)} style={{
                        width: 36, height: 36, borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.errorSoft, border: `1px solid rgba(239,68,68,0.25)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.error} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add product */}
              <button onClick={addLine} style={{
                width: '100%', padding: '10px 0', borderRadius: TOKENS.radius.md, marginBottom: 12,
                background: TOKENS.colors.surface, border: `1px dashed ${TOKENS.colors.border}`,
                color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Agregar producto
              </button>

              {/* Submit */}
              <button onClick={handleSubmit} disabled={submitting} style={{
                width: '100%', padding: '12px 0', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.blue2, color: '#fff', fontSize: 14, fontWeight: 700,
                opacity: submitting ? 0.6 : 1,
              }}>
                {submitting ? 'Guardando...' : 'Guardar Pronostico'}
              </button>

              {msg && (
                <p style={{
                  ...typo.caption, textAlign: 'center', marginTop: 10,
                  color: msg.includes('guardado') ? TOKENS.colors.success : TOKENS.colors.error,
                }}>{msg}</p>
              )}
            </div>

            {/* Recent forecasts */}
            {forecasts.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>PRONOSTICOS RECIENTES</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {forecasts.map((f, i) => (
                    <div key={f.id || i} style={{
                      padding: '12px 16px', borderRadius: TOKENS.radius.lg,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div>
                        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, fontSize: 14 }}>{f.date_target || f.date}</p>
                        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{f.line_count || f.lines?.length || 0} productos</p>
                      </div>
                      <div style={{
                        padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                        background: `${statusColor(f.state || f.status)}14`,
                        border: `1px solid ${statusColor(f.state || f.status)}30`,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(f.state || f.status) }}>{f.state || f.status || 'draft'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}
