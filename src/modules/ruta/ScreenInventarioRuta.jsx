// ScreenInventarioRuta.jsx — V2 Inventario de ruta
// Muestra: carga inicial vs ventas vs devoluciones vs restante por producto.
// Base: gf.dispatch.reconciliation (LIVE) o stock.move/load_lines como fallback.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getReconciliation, getLoadLines } from './api'
import { buildInventoryView, fmtNum } from './routeControlService'
import { logScreenError } from '../shared/logScreenError'

export default function ScreenInventarioRuta() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [invView, setInvView] = useState(null)
  const [planName, setPlanName] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const plan = await getMyRoutePlan(session?.employee_id)
      setPlanName(plan?.name || '')
      if (!plan) { setInvView(null); setLoading(false); return }

      let reconciliation = null
      if (plan.reconciliation_id) {
        try { reconciliation = await getReconciliation(plan.id) } catch (e) { logScreenError('ScreenInventarioRuta', 'getReconciliation', e) }
      }

      let loadLinesData = []
      if (plan.load_picking_id) {
        const pickingId = Array.isArray(plan.load_picking_id) ? plan.load_picking_id[0] : plan.load_picking_id
        try { loadLinesData = await getLoadLines(pickingId) } catch (e) { logScreenError('ScreenInventarioRuta', 'getLoadLines', e) }
      }

      setInvView(buildInventoryView(reconciliation, loadLinesData))
    } catch (e) { logScreenError('ScreenInventarioRuta', 'loadData', e); setInvView(null) }
    setLoading(false)
  }

  const totals = invView?.totals || {}
  const lines = invView?.lines || []

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
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/ruta')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Inventario de Ruta</span>
          <button onClick={loadData} style={{
            marginLeft: 'auto', width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !invView || invView.source === 'empty' ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F4E6;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Sin datos de carga</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0 0' }}>
              Acepta tu carga primero o espera a que Kold Field registre entregas.
            </p>
          </div>
        ) : (
          <>
            {/* Source badge */}
            <div style={{ marginBottom: 12 }}>
              <span style={{
                padding: '3px 10px', borderRadius: TOKENS.radius.pill, fontSize: 10, fontWeight: 700,
                background: invView.source === 'reconciliation' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                color: invView.source === 'reconciliation' ? '#22c55e' : '#f59e0b',
                border: `1px solid ${invView.source === 'reconciliation' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
              }}>
                {invView.source === 'reconciliation' ? 'Datos de conciliacion' : 'Solo carga (sin entregas aun)'}
              </span>
            </div>

            {/* Totals */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <TotalCard label="Cargado" value={totals.loaded} color={TOKENS.colors.blue2} typo={typo} />
              <TotalCard label="Entregado" value={totals.delivered} color="#22c55e" typo={typo} />
              <TotalCard label="Devuelto" value={totals.returned} color="#f59e0b" typo={typo} />
              <TotalCard label="Merma" value={totals.scrap} color="#ef4444" typo={typo} />
            </div>

            {/* Difference alert */}
            {totals.difference !== 0 && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 16,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                textAlign: 'center',
              }}>
                <p style={{ ...typo.body, color: '#ef4444', margin: 0, fontWeight: 700 }}>
                  Diferencia: {totals.difference > 0 ? '+' : ''}{fmtNum(totals.difference)} unidades
                </p>
              </div>
            )}

            {/* Product lines */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>DETALLE POR PRODUCTO</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lines.map((line, i) => {
                const remaining = line.remaining
                const hasIssue = remaining !== 0 && invView.source === 'reconciliation'
                return (
                  <div key={i} style={{
                    padding: '12px 14px', borderRadius: TOKENS.radius.lg,
                    background: hasIssue ? 'rgba(239,68,68,0.04)' : TOKENS.glass.panelSoft,
                    border: `1px solid ${hasIssue ? 'rgba(239,68,68,0.2)' : TOKENS.colors.border}`,
                  }}>
                    <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600, marginBottom: 6 }}>
                      {line.product}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <MiniTag label="Carga" value={line.loaded} color={TOKENS.colors.blue2} typo={typo} />
                      <MiniTag label="Entreg." value={line.delivered} color="#22c55e" typo={typo} />
                      <MiniTag label="Devuel." value={line.returned} color="#f59e0b" typo={typo} />
                      {line.scrap > 0 && <MiniTag label="Merma" value={line.scrap} color="#ef4444" typo={typo} />}
                      {invView.source === 'reconciliation' && (
                        <MiniTag label="Resta" value={remaining} color={remaining === 0 ? '#22c55e' : '#ef4444'} typo={typo} bold />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {lines.length === 0 && (
              <div style={{ padding: 20, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Sin lineas de detalle</p>
              </div>
            )}

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function TotalCard({ label, value, color, typo }) {
  return (
    <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}` }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 4 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color, letterSpacing: '-0.03em' }}>{fmtNum(value)}</p>
    </div>
  )
}

function MiniTag({ label, value, color, typo, bold }) {
  return (
    <div style={{
      padding: '2px 8px', borderRadius: TOKENS.radius.pill,
      background: `${color}12`, border: `1px solid ${color}25`,
    }}>
      <span style={{ fontSize: 10, color: TOKENS.colors.textMuted }}>{label} </span>
      <span style={{ fontSize: 11, fontWeight: bold ? 700 : 600, color }}>{fmtNum(value)}</span>
    </div>
  )
}
