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
  const [requiresChecklist, setRequiresChecklist] = useState(false)
  // checklist_state viene del backend cuando code=vehicle_checklist_required.
  // Valores esperados: 'missing' | 'draft' | 'in_progress' | null.
  // Lo usamos sólo para escoger el texto del CTA; el screen /ruta/checklist
  // sigue siendo la fuente de verdad y se encarga de crear/inicializar.
  const [checklistState, setChecklistState] = useState(null)

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
          // Si getMyLoad lanza, NO degradamos a "Sin carga" silenciosa —
          // mostramos error real. Antes el catch silencioso hacía que un
          // 404 backend pareciera "no hay carga asignada hoy".
          let l = null
          try {
            l = await getMyLoad(p.id)
          } catch (e) {
            logScreenError('ScreenAceptarCarga', 'getMyLoad', e)
            setError('No se pudo cargar la información de tu carga. Reintenta o reporta a soporte.')
          }
          setLoad(l)
          if (l?.load_picking_id) {
            const ll = await getLoadLines(l.load_picking_id).catch((err) => {
              logScreenError('ScreenAceptarCarga', 'getLoadLines', err)
              return []
            })
            setLines(ll || [])
          }
        }
      } catch (e) {
        logScreenError('ScreenAceptarCarga', 'fetchData', e)
        setError('No se pudo cargar tu plan de ruta. Reintenta o reporta a soporte.')
      }
      finally { setLoading(false) }
    }
    fetchData()
  }, [])

  async function handleAccept() {
    if (!plan?.id || submitting) return
    setSubmitting(true)
    setError('')
    setRequiresChecklist(false)
    setChecklistState(null)
    try {
      const res = await acceptLoad(plan.id)
      const ok = res?.ok === true || res?.success === true

      if (!ok) {
        // Caso especial: backend pide completar el checklist de unidad antes
        // de aceptar carga. Sebastián fix ba9de46 → el code llega en data.code
        // (también aceptamos res.code como fallback por si el backend evoluciona).
        const code = res?.data?.code || res?.code || null
        if (code === 'vehicle_checklist_required') {
          setRequiresChecklist(true)
          setChecklistState(res?.data?.checklist_state || null)
          setError(res?.message || 'Antes de aceptar la carga, debes completar el checklist de unidad.')
          return
        }

        // Backend respondió HTTP 200 pero con ok:false (acceso, validación,
        // endpoint no deployado que devuelve shape vacío, etc.).
        // NO marcamos load_sealed en falso; mostramos el message del backend
        // si vino, sino mensaje genérico.
        const err = new Error(`accept-load no confirmó la aceptación`)
        err.context = {
          plan_id: plan.id,
          employee_id: session?.employee_id,
          code,
          status: res?.status ?? res?.case ?? null,
          body: JSON.stringify(res ?? null).slice(0, 500),
        }
        logScreenError('ScreenAceptarCarga', 'acceptLoad.invalidResponse', err)
        setError(res?.message || 'No se pudo aceptar la carga. Intenta de nuevo o reporta a soporte.')
        return
      }

      // Éxito confirmado: reflejamos load_sealed real desde el backend.
      const data = res?.data || {}
      setLoad(prev => prev
        ? {
            ...prev,
            state: data.state || prev.state,
            load_sealed: data.load_sealed === true ? true : prev.load_sealed,
            load_sealed_at: data.load_sealed_at || prev.load_sealed_at,
            load_sealed_by: data.load_sealed_by || prev.load_sealed_by,
          }
        : prev)
    } catch (e) {
      // Network error, 404, 5xx, JSON parse error.
      e.context = {
        plan_id: plan.id,
        employee_id: session?.employee_id,
        endpoint: '/pwa-ruta/accept-load',
      }
      logScreenError('ScreenAceptarCarga', 'acceptLoad.networkError', e)
      setError('No se pudo aceptar la carga. Intenta de nuevo o reporta a soporte.')
    } finally {
      setSubmitting(false)
    }
  }

  // load_sealed es la fuente de verdad — viene del backend en getMyLoad y se
  // actualiza solo cuando handleAccept confirma con res.ok === true.
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
                marginTop: 10, marginBottom: requiresChecklist ? 8 : 16, padding: 16, borderRadius: TOKENS.radius.lg,
                background: requiresChecklist ? 'rgba(245,158,11,0.10)' : TOKENS.colors.errorSoft,
                border: `1px solid ${requiresChecklist ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                color: requiresChecklist ? TOKENS.colors.warning : TOKENS.colors.error,
                ...typo.body, textAlign: 'center',
              }}>
                {error}
              </div>
            )}

            {requiresChecklist && (
              <div style={{ marginBottom: 16 }}>
                <button
                  onClick={() => navigate('/ruta/checklist')}
                  style={{
                    width: '100%', padding: '14px',
                    borderRadius: TOKENS.radius.lg,
                    background: 'linear-gradient(90deg, #b45309, #f59e0b)',
                    color: 'white', fontSize: 15, fontWeight: 600,
                    boxShadow: '0 10px 24px rgba(245,158,11,0.25)',
                  }}
                >
                  {checklistState === 'missing'
                    ? 'Realizar inspección de unidad'
                    : (checklistState === 'draft' || checklistState === 'in_progress')
                      ? 'Continuar inspección de unidad'
                      : 'Ir a checklist de unidad'}
                </button>
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
