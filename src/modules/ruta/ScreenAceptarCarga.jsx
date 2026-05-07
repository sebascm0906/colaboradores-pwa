import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getMyLoad, acceptLoad, acceptRefill, getLoadLines } from './api'
import { buildLoadState } from './loadState'
import { logScreenError } from '../shared/logScreenError'

function getLineKey(line) {
  if (Array.isArray(line?.product_id)) return `id:${line.product_id[0]}`
  if (line?.product_id) return `id:${line.product_id}`
  return `name:${line?.product_name || line?.name || ''}`
}

function getLineName(line) {
  if (line?.product_name || line?.name) return line.product_name || line.name
  if (Array.isArray(line?.product_id)) return line.product_id[1] || `Producto ${line.product_id[0]}`
  return 'Producto'
}

function getLineQty(line) {
  return Number(line?.quantity ?? line?.qty ?? 0) || 0
}

function aggregateLines(groups) {
  const totals = new Map()
  for (const group of groups) {
    for (const line of group.lines || []) {
      const key = getLineKey(line)
      const current = totals.get(key) || {
        key,
        product_name: getLineName(line),
        uom: line?.uom || '',
        quantity: 0,
      }
      current.quantity += getLineQty(line)
      totals.set(key, current)
    }
  }
  return Array.from(totals.values()).filter((line) => line.quantity > 0)
}

export default function ScreenAceptarCarga() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [load, setLoad] = useState(null)
  const [loadCards, setLoadCards] = useState([])
  const [pendingLoads, setPendingLoads] = useState([])
  const [selectedLoadId, setSelectedLoadId] = useState(null)
  const [lines, setLines] = useState([])
  const [linesByPicking, setLinesByPicking] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [requiresChecklist, setRequiresChecklist] = useState(false)
  const [checklistState, setChecklistState] = useState(null)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const refreshData = useCallback(async ({ keepLoading = false } = {}) => {
    if (!keepLoading) setLoading(true)
    try {
      const p = await getMyRoutePlan(session?.employee_id)
      setPlan(p)
      setError('')
      setLines([])
      setLinesByPicking({})

      if (!p?.id) {
        setLoad(null)
        setLoadCards([])
        setPendingLoads([])
        setSelectedLoadId(null)
        return
      }

      let l = null
      try {
        l = await getMyLoad(p.id)
      } catch (e) {
        logScreenError('ScreenAceptarCarga', 'getMyLoad', e)
        setError('No se pudo cargar la informacion de tu carga. Reintenta o reporta a soporte.')
      }

      const { loadCards: nextCards, pendingLoads: nextPending } = buildLoadState(p, l)
      const nextSelected = nextPending[0] || nextCards[0] || null

      setLoad(l)
      setLoadCards(nextCards)
      setPendingLoads(nextPending)
      setSelectedLoadId(nextSelected?.picking_id || null)

      if (import.meta.env.DEV) {
        for (const refill of nextPending.filter((card) => card.isRefill)) {
          console.info(`[PWA-Security] Refill detected for Plan ID: ${p.id}, Picking ID: ${refill.picking_id}`)
        }
      }

      if (nextCards.length > 0) {
        const entries = await Promise.all(nextCards.map(async (card) => {
          const ll = await getLoadLines(card.picking_id).catch((err) => {
            logScreenError('ScreenAceptarCarga', 'getLoadLines', err)
            return []
          })
          return [card.picking_id, ll || []]
        }))
        const byPicking = Object.fromEntries(entries)
        setLinesByPicking(byPicking)
        setLines(nextSelected?.picking_id ? (byPicking[nextSelected.picking_id] || []) : [])
      }
    } catch (e) {
      logScreenError('ScreenAceptarCarga', 'fetchData', e)
      setError('No se pudo cargar tu plan de ruta. Reintenta o reporta a soporte.')
    } finally {
      setLoading(false)
    }
  }, [session?.employee_id])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  async function handleSelectLoad(loadCard) {
    if (!loadCard?.picking_id) return
    setSelectedLoadId(loadCard.picking_id)
    if (linesByPicking[loadCard.picking_id]) {
      setLines(linesByPicking[loadCard.picking_id])
      return
    }
    const ll = await getLoadLines(loadCard.picking_id).catch((err) => {
      logScreenError('ScreenAceptarCarga', 'getLoadLines.select', err)
      return []
    })
    setLinesByPicking((prev) => ({ ...prev, [loadCard.picking_id]: ll || [] }))
    setLines(ll || [])
  }

  async function handleAccept() {
    if (!session?.employee_id) {
      setError('Sesion no activa. Vuelve a iniciar sesion para aceptar la carga.')
      return
    }

    const selectedLoad = loadCards.find((card) => card.picking_id === selectedLoadId) || pendingLoads[0] || null
    if (!plan?.id || submitting || !selectedLoad?.picking_id) return

    setSubmitting(true)
    setError('')
    setRequiresChecklist(false)
    setChecklistState(null)
    try {
      const res = selectedLoad.isRefill
        ? await acceptRefill(plan.id, selectedLoad.picking_id)
        : await acceptLoad(plan.id, selectedLoad.picking_id)
      const ok = res?.ok === true || res?.success === true

      if (!ok) {
        const code = res?.data?.code || res?.code || null
        if (code === 'vehicle_checklist_required') {
          setRequiresChecklist(true)
          setChecklistState(res?.data?.checklist_state || null)
          setError(res?.message || 'Antes de aceptar la carga, debes completar el checklist de unidad.')
          return
        }
        const message = String(res?.message || res?.error || '')
        const alreadyAccepted = code === 'load_already_accepted' || message.toLowerCase().includes('ya fue aceptado')
        if (alreadyAccepted) {
          setLoadCards((prev) => prev.map((card) => (
            card.picking_id === selectedLoad.picking_id
              ? { ...card, accepted: true, gf_route_load_accepted: true }
              : card
          )))
          setPendingLoads((prev) => prev.filter((card) => card.picking_id !== selectedLoad.picking_id))
          setError('')
          return
        }

        const err = new Error('accept-load no confirmo la aceptacion')
        err.context = {
          plan_id: plan.id,
          picking_id: selectedLoad.picking_id,
          employee_id: session?.employee_id,
          code,
          status: res?.status ?? res?.case ?? null,
          body: JSON.stringify(res ?? null).slice(0, 500),
        }
        logScreenError('ScreenAceptarCarga', 'acceptLoad.invalidResponse', err)
        setError(res?.message || 'No se pudo aceptar la carga. Intenta de nuevo o reporta a soporte.')
        return
      }

      await refreshData({ keepLoading: true })
    } catch (e) {
      e.context = {
        plan_id: plan.id,
        picking_id: selectedLoad.picking_id,
        employee_id: session?.employee_id,
        endpoint: selectedLoad.isRefill ? '/pwa-ruta/accept-refill' : '/pwa-ruta/accept-load',
      }
      logScreenError('ScreenAceptarCarga', 'acceptLoad.networkError', e)
      setError('No se pudo aceptar la carga. Intenta de nuevo o reporta a soporte.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedLoad = loadCards.find((card) => card.picking_id === selectedLoadId) || null
  const hasPendingLoad = pendingLoads.length > 0
  const isAccepted = !hasPendingLoad && loadCards.length > 0 && loadCards.every((card) => card.accepted === true)
  const acceptLabel = selectedLoad?.isRefill ? 'Confirmar Recarga' : 'Confirmar Recepcion'
  const selectedProducts = selectedLoad?.picking_id
    ? (linesByPicking[selectedLoad.picking_id] || lines || [])
    : []
  const products = selectedProducts.length > 0 ? selectedProducts : (load?.products || load?.lines || [])
  const loadLineGroups = loadCards.map((card) => ({
    card,
    lines: linesByPicking[card.picking_id] || [],
  }))
  const hasGroupedLines = loadLineGroups.some((group) => group.lines.length > 0)
  const combinedProducts = loadLineGroups.length > 1 ? aggregateLines(loadLineGroups) : []
  const showSeparatedLines = loadCards.length > 1 && hasGroupedLines

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
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
                    ? 'Realizar inspeccion de unidad'
                    : (checklistState === 'draft' || checklistState === 'in_progress')
                      ? 'Continuar inspeccion de unidad'
                      : 'Ir a checklist de unidad'}
                </button>
              </div>
            )}

            {loadCards.length > 0 || products.length > 0 ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <span style={{
                    padding: '6px 16px', borderRadius: TOKENS.radius.pill,
                    fontSize: 12, fontWeight: 700,
                    background: hasPendingLoad ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)',
                    color: hasPendingLoad ? TOKENS.colors.warning : TOKENS.colors.success,
                    border: `1px solid ${hasPendingLoad ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
                  }}>
                    {hasPendingLoad ? `${pendingLoads.length} carga(s) pendiente(s)` : (isAccepted ? 'Cargas aceptadas' : 'Carga asignada')}
                  </span>
                </div>

                {loadCards.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {loadCards.map((card) => {
                      const selected = card.picking_id === selectedLoadId
                      const pending = pendingLoads.some((pendingCard) => pendingCard.picking_id === card.picking_id)
                      const stateLabel = card.accepted
                        ? 'Aceptada'
                        : pending
                          ? 'Pendiente'
                          : card.state === 'done'
                            ? 'Ejecutada'
                            : 'Asignada'
                      return (
                        <button
                          key={card.picking_id}
                          onClick={() => handleSelectLoad(card)}
                          style={{
                            width: '100%',
                            padding: '12px 14px',
                            borderRadius: TOKENS.radius.lg,
                            background: selected ? 'rgba(43,143,224,0.14)' : TOKENS.glass.panel,
                            border: `1px solid ${selected ? 'rgba(43,143,224,0.55)' : TOKENS.colors.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>
                              {card.isRefill ? 'Recarga' : 'Carga inicial'} - {card.name}
                            </p>
                            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                              {card.scheduled_date || 'Sin hora registrada'}
                            </p>
                          </div>
                          <span style={{
                            marginLeft: 12,
                            padding: '4px 10px',
                            borderRadius: TOKENS.radius.pill,
                            fontSize: 11,
                            fontWeight: 700,
                            color: card.accepted ? TOKENS.colors.success : (pending ? TOKENS.colors.warning : TOKENS.colors.textMuted),
                            background: card.accepted ? 'rgba(34,197,94,0.10)' : (pending ? 'rgba(245,158,11,0.10)' : 'rgba(148,163,184,0.10)'),
                            border: `1px solid ${card.accepted ? 'rgba(34,197,94,0.25)' : (pending ? 'rgba(245,158,11,0.25)' : 'rgba(148,163,184,0.20)')}`,
                            flexShrink: 0,
                          }}>
                            {stateLabel}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {showSeparatedLines ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {loadLineGroups.map(({ card, lines: cardLines }) => (
                      <section key={card.picking_id}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontWeight: 700 }}>
                            {card.isRefill ? 'Recarga' : 'Carga inicial'} - {card.name}
                          </p>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0 }}>
                            {cardLines.length} prod.
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {cardLines.length > 0 ? cardLines.map((p, i) => (
                            <div key={p.id || `${card.picking_id}-${i}`} style={{
                              padding: '12px 16px', borderRadius: TOKENS.radius.lg,
                              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>{getLineName(p)}</p>
                                {p.uom && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{p.uom}</p>}
                              </div>
                              <span style={{ ...typo.h2, color: TOKENS.colors.text, marginLeft: 12 }}>
                                {getLineQty(p)}
                              </span>
                            </div>
                          )) : (
                            <div style={{
                              padding: '12px 16px', borderRadius: TOKENS.radius.lg,
                              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                            }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Sin desglose registrado</p>
                            </div>
                          )}
                        </div>
                      </section>
                    ))}

                    {combinedProducts.length > 0 && (
                      <section style={{ paddingTop: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, fontWeight: 700 }}>
                            Total combinado
                          </p>
                          <span style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0 }}>
                            {combinedProducts.length} prod.
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {combinedProducts.map((p) => (
                            <div key={p.key} style={{
                              padding: '12px 16px', borderRadius: TOKENS.radius.lg,
                              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)',
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>{p.product_name}</p>
                                {p.uom && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{p.uom}</p>}
                              </div>
                              <span style={{ ...typo.h2, color: TOKENS.colors.text, marginLeft: 12 }}>
                                {p.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {products.map((p, i) => (
                      <div key={p.id || i} style={{
                        padding: '12px 16px', borderRadius: TOKENS.radius.lg,
                        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>{getLineName(p)}</p>
                          {p.uom && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{p.uom}</p>}
                        </div>
                        <span style={{ ...typo.h2, color: TOKENS.colors.text, marginLeft: 12 }}>
                          {getLineQty(p)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {hasPendingLoad && (
                  <div style={{ padding: '24px 0 32px' }}>
                    <button
                      onClick={handleAccept}
                      disabled={submitting || !selectedLoad || selectedLoad.accepted === true}
                      style={{
                        width: '100%', padding: '14px',
                        borderRadius: TOKENS.radius.lg,
                        background: 'linear-gradient(90deg, #15803d, #22c55e)',
                        color: 'white', fontSize: 15, fontWeight: 600,
                        opacity: submitting || !selectedLoad || selectedLoad.accepted === true ? 0.6 : 1,
                        boxShadow: '0 10px 24px rgba(34,197,94,0.25)',
                        transition: `opacity ${TOKENS.motion.fast}`,
                      }}
                    >
                      {submitting ? 'Aceptando...' : acceptLabel}
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
