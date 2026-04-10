import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getMyLoad, acceptLoad, getLoadLines } from './api'
import { logScreenError } from '../shared/logScreenError'

export default function ScreenAceptarCarga() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [load, setLoad] = useState(null)
  const [lines, setLines] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    async function fetchData() {
      try {
        const p = await getMyRoutePlan(session?.employee_id)
        setPlan(p)
        if (p?.id) {
          const l = await getMyLoad(p.id).catch(() => null)
          setLoad(l)
          // Si hay picking asignado, cargar líneas con SKU/cantidades
          if (l?.load_picking_id) {
            const ll = await getLoadLines(l.load_picking_id).catch(() => [])
            setLines(ll || [])
          }
        }
      } catch (e) { logScreenError('ScreenAceptarCarga', 'fetchData', e) }
      finally { setLoading(false) }
    }
    fetchData()
  }, [])

  async function handleAccept() {
    if (!plan?.id) return
    setSubmitting(true)
    try {
      await acceptLoad(plan.id)
      setLoad(prev => prev ? { ...prev, state: 'accepted' } : prev)
    } catch (e) {
      logScreenError('ScreenAceptarCarga', 'acceptLoad', e)
      setError('No se pudo aceptar la carga')
    } finally {
      setSubmitting(false)
    }
  }

  const isAccepted = load?.load_sealed === true
  const products = lines.length > 0 ? lines : (load?.products || load?.lines || [])

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/ruta')} style={{ width: 38, height: 38, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Carga Asignada</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {error && (
              <div style={{
                marginTop: 10, marginBottom: 16, padding: 16, borderRadius: TOKENS.radius.lg,
                background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
                color: TOKENS.colors.error, ...typo.body, textAlign: 'center',
              }}>
                {error}
              </div>
            )}

            {load && products.length > 0 ? (
              <>
                {/* Status badge */}
                <div style={{
                  display: 'flex', justifyContent: 'center', marginBottom: 16,
                }}>
                  <span style={{
                    padding: '6px 16px', borderRadius: TOKENS.radius.pill,
                    fontSize: 12, fontWeight: 700,
                    background: isAccepted ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                    color: isAccepted ? TOKENS.colors.success : TOKENS.colors.warning,
                    border: `1px solid ${isAccepted ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  }}>
                    {isAccepted ? 'Carga aceptada' : 'Pendiente de aceptar'}
                  </span>
                </div>

                {/* Product list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {products.map((p, i) => (
                    <div key={p.id || i} style={{
                      padding: '12px 16px', borderRadius: TOKENS.radius.lg,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>{p.product_name || p.name}</p>
                        {p.uom && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{p.uom}</p>}
                      </div>
                      <span style={{ ...typo.h2, color: TOKENS.colors.text, marginLeft: 12 }}>
                        {p.quantity ?? p.qty}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Accept button */}
                {!isAccepted && (
                  <div style={{ padding: '24px 0 32px' }}>
                    <button
                      onClick={handleAccept}
                      disabled={submitting}
                      style={{
                        width: '100%', padding: '14px',
                        borderRadius: TOKENS.radius.lg,
                        background: 'linear-gradient(90deg, #15803d, #22c55e)',
                        color: 'white', fontSize: 15, fontWeight: 600,
                        opacity: submitting ? 0.6 : 1,
                        boxShadow: '0 10px 24px rgba(34,197,94,0.25)',
                        transition: `opacity ${TOKENS.motion.fast}`,
                      }}
                    >
                      {submitting ? 'Aceptando...' : 'Aceptar Carga'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{
                marginTop: 20, padding: 24, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                textAlign: 'center',
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin carga asignada</p>
              </div>
            )}

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}
