// ScreenMaterialesReconcile.jsx — Reconciliación de materiales del turno
// ───────────────────────────────────────────────────────────────────────────
// GET /api/production/materials/reconcile?shift_id=X
// Respuesta: { shift, plant, by_line[], summary, incidents[], consistent }
// Backend es fuente de verdad: aquí sólo se presenta.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift } from '../supervision/api'
import { getMaterialsReconcile, colorForSeverity, colorForState, stateLabel } from './materialsService'
import { resolveMaterialesBackTo } from './materialsNavigation'
import { fmtNum, DEFAULT_WAREHOUSE_ID } from './ptService'
import { logScreenError } from '../shared/logScreenError'

const STATE_ORDER = [
  'draft', 'reported', 'validated', 'disputed', 'rejected',
  'force_closed', 'abandoned',
]

export default function ScreenMaterialesReconcile() {
  const { session } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const plantId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID
  const backTo = resolveMaterialesBackTo(location.state, '/almacen-pt', session?.role)

  const [shift, setShift] = useState(null)
  const [data, setData] = useState({
    shift: null, plant: null, byLine: [], summary: {}, incidents: [], consistent: false,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const s = await getActiveShift()
      setShift(s)
      if (!s?.id) { setError('Sin turno activo.'); setLoading(false); return }
      const res = await getMaterialsReconcile({ shiftId: s.id, plantId })
      setData(res)
    } catch (e) {
      logScreenError('ScreenMaterialesReconcile', 'loadData', e)
      setError(e?.message || 'Error obteniendo reconciliación.')
    }
    setLoading(false)
  }

  const totalItems = useMemo(
    () => (data.byLine || []).reduce((acc, l) => {
      const rows = Array.isArray(l.settlements) ? l.settlements
        : Array.isArray(l.materials) ? l.materials
        : []
      return acc + rows.length
    }, 0),
    [data.byLine]
  )

  const stateCounts = useMemo(() => {
    const raw = data.summary?.settlements_by_state || {}
    const entries = STATE_ORDER
      .map(k => ({ k, n: Number(raw[k] || 0) }))
      .filter(x => x.n > 0)
    // Agrega otros estados no listados
    for (const k of Object.keys(raw)) {
      if (!STATE_ORDER.includes(k) && Number(raw[k] || 0) > 0) {
        entries.push({ k, n: Number(raw[k]) })
      }
    }
    return entries
  }, [data.summary])

  const legacyCount = Number(data.summary?.legacy_issues_without_moves_count || 0)

  return (
    <div style={pageStyle}>
      <GlobalStyles />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate(backTo)} style={iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Reconciliar materiales</span>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
              {data.shift?.id || shift?.id ? `Turno #${data.shift?.id || shift.id}` : 'Sin turno'}
              {data.plant?.name ? ` · ${data.plant.name}` : ''}
            </p>
          </div>
          <button onClick={loadData} style={iconBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
        </div>

        {error && <div style={errorBox}><p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p></div>}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Consistent banner */}
            <div style={{
              padding: 12, borderRadius: TOKENS.radius.lg, marginBottom: 12,
              background: data.consistent ? TOKENS.colors.successSoft : 'rgba(239,68,68,0.08)',
              border: `1px solid ${data.consistent ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
              textAlign: 'center',
            }}>
              <p style={{ ...typo.body, color: data.consistent ? TOKENS.colors.success : TOKENS.colors.error, margin: 0, fontWeight: 700 }}>
                {data.consistent ? 'Materiales cuadran' : 'Diferencias detectadas'}
              </p>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                {totalItems} material{totalItems === 1 ? '' : 'es'} · {(data.incidents || []).length} incidencia{(data.incidents || []).length === 1 ? '' : 's'}
              </p>
            </div>

            {/* Conteo por estado (desde summary.settlements_by_state) */}
            {stateCounts.length > 0 && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.lg, marginBottom: 12,
                background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0, marginBottom: 8 }}>SETTLEMENTS</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {stateCounts.map(({ k, n }) => {
                    const c = colorForState(k)
                    return (
                      <span key={k} style={{
                        ...typo.caption,
                        padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                        background: `${c}14`, color: c,
                        border: `1px solid ${c}40`, fontWeight: 700,
                      }}>
                        {stateLabel(k)}: {n}
                      </span>
                    )
                  })}
                </div>
                {legacyCount > 0 && (
                  <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: '8px 0 0', fontWeight: 600 }}>
                    {legacyCount} issue{legacyCount === 1 ? '' : 's'} legacy sin moves (feature flag off).
                  </p>
                )}
              </div>
            )}

            {/* Incidents */}
            {(data.incidents || []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '4px 0 8px' }}>INCIDENCIAS</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.incidents.map((inc, i) => (
                    <div key={inc.code || i} style={{
                      padding: '10px 12px', borderRadius: TOKENS.radius.md,
                      background: `${colorForSeverity(inc.severity)}0F`,
                      border: `1px solid ${colorForSeverity(inc.severity)}40`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          ...typo.caption,
                          padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                          background: colorForSeverity(inc.severity),
                          color: 'white', fontWeight: 700, fontSize: 10,
                        }}>
                          {String(inc.severity || '').toUpperCase() || 'INFO'}
                        </span>
                        <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 600 }}>
                          {inc.code || 'incident'}
                        </span>
                      </div>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: '6px 0 0' }}>
                        {inc.message || inc.description || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By line */}
            {(data.byLine || []).length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: TOKENS.colors.textMuted, ...typo.body }}>
                No hay materiales del turno.
              </div>
            ) : (
              (data.byLine || []).map((lineBlock, idx) => {
                const lineName = lineBlock.line_name || lineBlock.line_type || lineBlock.line || `Línea ${idx + 1}`
                const rows = Array.isArray(lineBlock.settlements)
                  ? lineBlock.settlements
                  : Array.isArray(lineBlock.materials)
                    ? lineBlock.materials
                    : []
                return (
                  <div key={lineBlock.line_id || lineName} style={{ marginTop: 12 }}>
                    <div style={lineHeader}>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 700, letterSpacing: '0.08em' }}>
                        {String(lineName).toUpperCase()}
                      </span>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
                        {rows.length} ítem{rows.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {rows.map((r, i) => (
                        <ReconcileRow key={r.material_id || r.id || i} row={r} typo={typo} />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

function ReconcileRow({ row, typo }) {
  const sev = row.severity
  const state = row.settlement_state || row.state
  const sevColor = sev ? colorForSeverity(sev) : null
  const stateColor = state ? colorForState(state) : null
  const borderColor = sevColor || stateColor || TOKENS.colors.border
  const qtyIssued    = Number(row.qty_issued ?? 0)
  const qtyUsed      = Number(row.qty_used ?? row.qty_consumed ?? 0)
  const qtyRemaining = Number(row.qty_remaining ?? row.qty_returned ?? 0)
  const qtyMerma     = Number(row.qty_merma ?? row.qty_damaged ?? 0)
  const difference   = row.difference !== undefined && row.difference !== null
    ? Number(row.difference)
    : qtyIssued - qtyUsed - qtyRemaining - qtyMerma
  const inTolerance  = row.in_tolerance !== undefined ? Boolean(row.in_tolerance) : null
  return (
    <div style={{
      padding: '12px 14px', borderRadius: TOKENS.radius.md,
      background: TOKENS.glass.panel,
      border: `1px solid ${sev || state ? borderColor + '40' : TOKENS.colors.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.material_name || row.product_name || '—'}
        </p>
        {state && (
          <span style={{
            ...typo.caption,
            padding: '2px 8px', borderRadius: TOKENS.radius.pill,
            background: `${stateColor}14`, color: stateColor,
            border: `1px solid ${stateColor}40`,
            fontWeight: 700, fontSize: 10,
          }}>
            {stateLabel(state)}
          </span>
        )}
        {sev && (
          <span style={{
            ...typo.caption,
            padding: '2px 8px', borderRadius: TOKENS.radius.pill,
            background: `${sevColor}14`, color: sevColor,
            border: `1px solid ${sevColor}40`,
            fontWeight: 700, fontSize: 10,
          }}>
            {String(sev).toUpperCase()}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 8 }}>
        <Cell label="Entreg." value={fmtNum(qtyIssued)} typo={typo} />
        <Cell label="Usado" value={fmtNum(qtyUsed)} typo={typo} />
        <Cell label="Sobr." value={fmtNum(qtyRemaining)} typo={typo} />
        <Cell
          label="Merma"
          value={fmtNum(qtyMerma)}
          typo={typo}
          accent={qtyMerma > 0 ? TOKENS.colors.warning : undefined}
        />
        <Cell
          label="Dif."
          value={fmtNum(difference)}
          typo={typo}
          accent={Math.abs(difference) > 0
            ? (inTolerance ? TOKENS.colors.warning : (sevColor || stateColor || TOKENS.colors.error))
            : undefined}
        />
      </div>
    </div>
  )
}

function Cell({ label, value, typo, accent }) {
  return (
    <div>
      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0, fontSize: 10 }}>{label}</p>
      <p style={{ ...typo.caption, color: accent || TOKENS.colors.textSoft, margin: 0, fontWeight: 700, marginTop: 2 }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

const pageStyle = {
  minHeight: '100dvh',
  background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
  paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
}
const errorBox = {
  padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
  background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
}
const iconBtn = {
  width: 38, height: 38, borderRadius: TOKENS.radius.md,
  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const lineHeader = {
  padding: '8px 12px', borderRadius: TOKENS.radius.sm,
  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
      * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
      button { border: none; background: none; cursor: pointer; }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  )
}
