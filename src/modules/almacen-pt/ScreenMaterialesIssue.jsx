// ScreenMaterialesIssue.jsx — Vista de materiales entregados al turno
// ───────────────────────────────────────────────────────────────────────────
// GET /api/production/materials/issues?shift_id=X
// Agrupado por línea (BARRA/ROLITO). Muestra lo que ya se entregó y su estado.
// Desde aquí el operador puede entrar a reportar consumo de un item.
// ───────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift } from '../supervision/api'
import { getMaterialIssues, stateLabel, lineOf } from './materialsService'
import { buildMaterialesNavState, resolveMaterialesBackTo } from './materialsNavigation'
import { fmtNum, DEFAULT_WAREHOUSE_ID } from './ptService'
import { logScreenError } from '../shared/logScreenError'

const LINE_ORDER = ['BARRA', 'ROLITO', 'OTRO']

function colorForState(state) {
  if (state === 'validated') return TOKENS.colors.success
  if (state === 'rejected')  return TOKENS.colors.error
  if (state === 'disputed')  return TOKENS.colors.warning
  if (state === 'reported')  return TOKENS.colors.blue2
  return TOKENS.colors.textMuted
}

export default function ScreenMaterialesIssue() {
  const { session } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const plantId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID
  const backTo = resolveMaterialesBackTo(location.state, '/almacen-pt', session?.role)

  const [shift, setShift] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const s = await getActiveShift(plantId)
      setShift(s)
      if (!s?.id) {
        setError('No hay turno activo.')
        setLoading(false)
        return
      }
      const res = await getMaterialIssues({ shiftId: s.id, plantId })
      setItems(res.items)
    } catch (e) {
      logScreenError('ScreenMaterialesIssue', 'loadData', e)
      setError(e?.message || 'No se pudieron cargar los materiales.')
    }
    setLoading(false)
  }

  const groups = useMemo(() => {
    const g = {}
    for (const it of items) {
      const line = lineOf(it)
      if (!g[line]) g[line] = []
      g[line].push(it)
    }
    const ordered = []
    for (const l of LINE_ORDER) if (g[l]) ordered.push({ line: l, items: g[l] })
    for (const k of Object.keys(g)) {
      if (!LINE_ORDER.includes(k)) ordered.push({ line: k, items: g[k] })
    }
    return ordered
  }, [items])

  return (
    <div style={pageStyle}>
      <GlobalStyles />
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <Header title="Materiales del turno" subtitle={shift?.id ? `Turno #${shift.id}` : ''} onBack={() => navigate(backTo)} onReload={loadData} typo={typo} />

        {shift?.id && (
          <button
            onClick={() => navigate('/almacen-pt/materiales/crear', {
              state: buildMaterialesNavState(location.state, '/almacen-pt/materiales', session?.role),
            })}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: TOKENS.radius.lg,
              background: 'linear-gradient(90deg, #15499B, #2B8FE0)',
              color: 'white', fontSize: 14, fontWeight: 700, marginBottom: 12,
              boxShadow: '0 8px 18px rgba(21,73,155,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Entregar nuevo material
          </button>
        )}

        {error && (
          <div style={errorBox}>
            <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <Loader />
        ) : items.length === 0 && !error ? (
          <div style={{ padding: 24, textAlign: 'center', color: TOKENS.colors.textMuted, ...typo.body }}>
            No hay materiales entregados para este turno.
          </div>
        ) : (
          groups.map(g => (
            <div key={g.line} style={{ marginTop: 16 }}>
              <div style={lineHeader}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, fontWeight: 700, letterSpacing: '0.08em' }}>{g.line}</span>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{g.items.length} material{g.items.length === 1 ? '' : 'es'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.items.map(it => {
                  const st = it.settlement_state || it.state || 'draft'
                  const canReport = st === 'draft' || st === 'issued'
                  return (
                  <button
                    key={it.id || it.issue_id}
                    onClick={() => canReport && navigate(`/almacen-pt/materiales/report/${it.id || it.issue_id}`, {
                      state: buildMaterialesNavState({ ...location.state, issue: it }, '/almacen-pt/materiales', session?.role),
                    })}
                    style={{ ...rowStyle, opacity: canReport ? 1 : 0.7, cursor: canReport ? 'pointer' : 'default' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.product_name || it.material_name || '—'}
                      </p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                        Entregado: <b style={{ color: TOKENS.colors.textSoft }}>{fmtNum(it.qty_issued)}</b> {it.uom || ''}
                        {it.qty_used != null && <> · Usado: <b>{fmtNum(it.qty_used)}</b></>}
                        {it.qty_remaining != null && <> · Sobrante: <b>{fmtNum(it.qty_remaining)}</b></>}
                      </p>
                    </div>
                    <span style={{
                      ...typo.caption,
                      padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                      background: `${colorForState(it.settlement_state || it.state)}14`,
                      color: colorForState(it.settlement_state || it.state),
                      border: `1px solid ${colorForState(it.settlement_state || it.state)}40`,
                      fontWeight: 700, flexShrink: 0, marginLeft: 8,
                    }}>
                      {stateLabel(it.settlement_state || it.state)}
                    </span>
                  </button>
                  )
                })}
              </div>
            </div>
          ))
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

// Shared styles and small components
const pageStyle = {
  minHeight: '100dvh',
  background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
  paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
}
const errorBox = {
  padding: 10, borderRadius: TOKENS.radius.md, marginBottom: 12,
  background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
}
const lineHeader = {
  padding: '8px 12px', borderRadius: TOKENS.radius.sm,
  background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
}
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
  borderRadius: TOKENS.radius.md, textAlign: 'left', width: '100%',
  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
      * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
      button { border: none; background: none; cursor: pointer; }
      input, textarea { font-family: 'DM Sans', sans-serif; }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  )
}

function Header({ title, subtitle, onBack, onReload, typo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
      <button onClick={onBack} style={iconBtn}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <div style={{ flex: 1 }}>
        <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>{title}</span>
        {subtitle && <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{subtitle}</p>}
      </div>
      {onReload && (
        <button onClick={onReload} style={iconBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
          </svg>
        </button>
      )}
    </div>
  )
}

function Loader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

const iconBtn = {
  width: 38, height: 38, borderRadius: TOKENS.radius.md,
  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
