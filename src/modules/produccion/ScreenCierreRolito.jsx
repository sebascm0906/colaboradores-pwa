// ScreenCierreRolito.jsx — V2 Cierre de Turno Guiado
// Muestra resumen del dia + cuadratura de bolsas + checklist entrega.
// Backend: POST /api/production/shift/bag-reconciliation (contrato canonico)
//   Campos internos x_bags_* son responsabilidad de Odoo, no del frontend.
//   action_close → se intenta, con fallback a state='done'
//   Checklist entrega: local-only (template no existe en Odoo aun)
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getShiftOverview,
  saveBagReconciliation,
} from './rolitoService'
import { loadShiftReadiness } from '../shared/shiftReadiness'
import { closeShiftServerSide } from '../shared/supervisorAuth'
import { computePackingCoherence, getCoherenceHeadline } from '../shared/packingCoherence'

export default function ScreenCierreRolito() {
  const navigate = useNavigate()
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [data, setData] = useState({ shift: null, cycles: [], packing: [], kpis: null })
  const [readiness, setReadiness] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [closing, setClosing] = useState(false)

  // Bag reconciliation — persisted via POST /api/production/shift/bag-reconciliation
  const [bagsReceived, setBagsReceived] = useState('')
  const [bagsRemaining, setBagsRemaining] = useState('')

  // Entrega checklist — local-only (no backend template yet)
  const [checks, setChecks] = useState([
    { id: 'limpia',     label: 'Maquina limpia',       done: false },
    { id: 'despejada',  label: 'Area despejada',       done: false },
    { id: 'guardada',   label: 'Herramienta guardada', done: false },
    { id: 'sin_prod',   label: 'Sin producto en piso', done: false },
  ])

  const loadData = useCallback(async () => {
    try {
      const result = await getShiftOverview()
      setData(result)
      // Readiness centralizado (servicio compartido, no duplica logica)
      if (result.shift?.id) {
        const { readiness: r } = await loadShiftReadiness(result.shift.id)
        setReadiness(r)
      }
    } catch {
      setError('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const { shift, kpis } = data
  const totalBagsUsed = data.packing.reduce((s, p) => s + (p.qty_bags || 0), 0)
  const bagsReceivedNum = parseInt(bagsReceived) || 0
  const bagsRemainingNum = parseInt(bagsRemaining) || 0
  const bagsDiff = bagsReceivedNum > 0 ? bagsReceivedNum - totalBagsUsed - bagsRemainingNum : null
  const allChecked = checks.every(c => c.done)
  // Autoridad de cierre: backend (_get_close_readiness). Frontend solo refleja.
  const backendCanClose = readiness?.canClose === true
  const hasBlockers = (readiness?.blockers?.length || 0) > 0
  const canClose = allChecked && backendCanClose && !hasBlockers

  // Coherencia ciclos <-> empaque (Fase 3) — aviso UX-friendly
  const coherence = useMemo(
    () => computePackingCoherence(data.cycles, data.packing),
    [data.cycles, data.packing]
  )
  const coherenceHeadline = useMemo(() => getCoherenceHeadline(coherence), [coherence])

  function toggleCheck(id) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, done: !c.done } : c))
  }

  async function handleClose() {
    if (!shift?.id) return
    setClosing(true)
    setError('')
    try {
      // Save bag reconciliation if operator entered data
      if (bagsReceivedNum > 0) {
        await saveBagReconciliation(shift.id, bagsReceivedNum, bagsRemainingNum)
      }

      const result = await closeShiftServerSide({ shift_id: shift.id })
      if (!result.ok) {
        setError(result.error || 'No se pudo cerrar el turno')
        return
      }
      setSuccess('Turno cerrado correctamente')
      setTimeout(() => navigate('/'), 2000)
    } catch (e) {
      setError(e.message || 'Error al cerrar turno')
    } finally {
      setClosing(false)
    }
  }

  // Mapear bloqueadores a rutas para CTAs accionables.
  // Acepta objeto {code, message} (contrato real) o string (legacy).
  function blockerRoute(b) {
    const code = (b && typeof b === 'object' ? b.code : '') || ''
    const energyRoute = String(session?.role || '').includes('rolito')
      ? '/supervision/energia'
      : '/supervision/energia'
    // Mapeo por code (autoridad backend — evita heuristicas de texto)
    const byCode = {
      energy_end: energyRoute,
      energy_start: energyRoute,
      open_downtime: '/supervision/paros',
      open_cycles: '/produccion/ciclo',
      open_incidents: '/supervision/paros',
      balance: '/supervision/merma',
      checklist: '/produccion/checklist',
      shift_state: null,
    }
    if (code && byCode[code] !== undefined) return byCode[code]
    // Fallback por texto (para codes no mapeados)
    const t = ((b && typeof b === 'object' ? b.message : b) || '').toString().toLowerCase()
    if (t.includes('checklist') || t.includes('inspecci')) return '/produccion/checklist'
    if (t.includes('balance') || t.includes('merma')) return '/supervision/merma'
    if (t.includes('empaque') || t.includes('bolsa') || t.includes('packing')) return '/produccion/empaque'
    if (t.includes('ciclo') || t.includes('producci') || t.includes('congela')) return '/produccion/ciclo'
    if (t.includes('energ')) return energyRoute
    if (t.includes('paro')) return '/supervision/paros'
    if (t.includes('turno')) return '/supervision/turno'
    return null
  }
  function blockerText(b) {
    if (!b) return ''
    if (typeof b === 'string') return b
    return b.message || b.code || ''
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Cierre de Turno</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── RESUMEN DEL DIA ─────────────────────────────── */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 12 }}>RESUMEN DEL DIA</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <SummaryItem label="Ciclos" value={kpis ? `${kpis.completedCycles}` : '0'} typo={typo} />
                <SummaryItem
                  label="Producido"
                  value={kpis?.totalKgProduced !== null && kpis?.totalKgProduced !== undefined
                    ? `${kpis.totalKgProduced} kg`
                    : '—'}
                  accent={TOKENS.colors.blue2} typo={typo} />
                <SummaryItem
                  label="Empacado"
                  value={kpis?.totalKgPacked !== null && kpis?.totalKgPacked !== undefined
                    ? `${kpis.totalKgPacked} kg`
                    : '—'}
                  accent={TOKENS.colors.success} typo={typo} />
                <SummaryItem
                  label="Merma"
                  value={kpis?.mermaKg !== null && kpis?.mermaPct !== null && kpis?.mermaKg !== undefined
                    ? `${kpis.mermaKg} kg (${kpis.mermaPct}%)`
                    : '—'}
                  accent={kpis?.mermaExceeded ? TOKENS.colors.error : TOKENS.colors.success} typo={typo} />
              </div>
            </div>

            {/* ── AVISOS OPERATIVOS (no bloquean) ─────────────── */}
            {coherenceHeadline && (
              <div style={{
                padding: '12px 14px', borderRadius: TOKENS.radius.md,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.warning, margin: 0, fontWeight: 600 }}>
                  {coherenceHeadline}
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                  Producido {Math.round(coherence.summary.totalProduced)} kg · Empacado {Math.round(coherence.summary.totalPacked)} kg
                </p>
              </div>
            )}

            {/* ── AVISOS BACKEND (no bloquean, solo informan) ──── */}
            {readiness && readiness.warnings && readiness.warnings.length > 0 && (
              <div style={{
                padding: '12px 14px', borderRadius: TOKENS.radius.md,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.warning, margin: '0 0 6px', fontWeight: 700 }}>
                  Avisos antes de cerrar
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {readiness.warnings.map((w, i) => (
                    <span key={i} style={{ ...typo.caption, color: TOKENS.colors.textSoft }}>• {blockerText(w)}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── BLOQUEOS DE CIERRE (desde readiness) ────────── */}
            {readiness && readiness.blockers && readiness.blockers.length > 0 && (
              <div style={{
                padding: '12px 14px', borderRadius: TOKENS.radius.md,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.error, margin: '0 0 8px', fontWeight: 700 }}>
                  Faltan cosas para cerrar
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {readiness.blockers.map((b, i) => {
                    const route = blockerRoute(b)
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ ...typo.caption, color: TOKENS.colors.textSoft, flex: 1 }}>• {blockerText(b)}</span>
                        {route && (
                          <button onClick={() => navigate(route, { state: { backTo: '/produccion/cierre' } })} style={{
                            padding: '4px 10px', borderRadius: TOKENS.radius.pill,
                            background: 'rgba(43,143,224,0.12)', border: '1px solid rgba(43,143,224,0.25)',
                            color: TOKENS.colors.blue2, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                          }}>
                            Ir a corregir
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── CUADRATURA BOLSAS ───────────────────────────── */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <div style={{ marginBottom: 12 }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>CONTEO DE BOLSAS</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                  Revisa cuantas bolsas te dieron y cuantas te quedan
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ ...typo.body, color: TOKENS.colors.textSoft }}>Bolsas recibidas</span>
                  <input
                    type="number" inputMode="numeric"
                    value={bagsReceived} onChange={e => setBagsReceived(e.target.value)}
                    placeholder="0"
                    style={{
                      width: 80, padding: '8px', borderRadius: TOKENS.radius.sm,
                      background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                      color: 'white', fontSize: 16, fontWeight: 700, outline: 'none', textAlign: 'center',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ ...typo.body, color: TOKENS.colors.textSoft }}>Bolsas usadas</span>
                  <span style={{ ...typo.body, color: TOKENS.colors.text, fontWeight: 700 }}>{totalBagsUsed}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ ...typo.body, color: TOKENS.colors.textSoft }}>Bolsas sobrantes</span>
                  <input
                    type="number" inputMode="numeric"
                    value={bagsRemaining} onChange={e => setBagsRemaining(e.target.value)}
                    placeholder="0"
                    style={{
                      width: 80, padding: '8px', borderRadius: TOKENS.radius.sm,
                      background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                      color: 'white', fontSize: 16, fontWeight: 700, outline: 'none', textAlign: 'center',
                    }}
                  />
                </div>
                {bagsDiff !== null && (
                  <div style={{
                    padding: '10px 12px', borderRadius: TOKENS.radius.md, marginTop: 4,
                    background: bagsDiff === 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${bagsDiff === 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600 }}>Diferencia</span>
                      <span style={{
                        ...typo.body, fontWeight: 700,
                        color: bagsDiff === 0 ? TOKENS.colors.success : TOKENS.colors.error,
                      }}>
                        {bagsDiff === 0 ? 'Todo cuadra' : `${bagsDiff > 0 ? '+' : ''}${bagsDiff} bolsas`}
                      </span>
                    </div>
                    {bagsDiff !== 0 && (
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 0' }}>
                        {bagsDiff > 0
                          ? 'Faltan bolsas — revisa si hubo alguna rota o perdida'
                          : 'Sobran bolsas — revisa si alguien mas registro empaque'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── CHECKLIST ENTREGA ───────────────────────────── */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 12px' }}>CHECKLIST DE ENTREGA</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checks.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggleCheck(c.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: TOKENS.radius.md,
                      background: c.done ? 'rgba(34,197,94,0.08)' : TOKENS.colors.surface,
                      border: `1px solid ${c.done ? 'rgba(34,197,94,0.25)' : TOKENS.colors.border}`,
                      width: '100%', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: c.done ? TOKENS.colors.success : 'transparent',
                      border: `2px solid ${c.done ? TOKENS.colors.success : TOKENS.colors.textMuted}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {c.done && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                      )}
                    </div>
                    <span style={{
                      ...typo.body, fontWeight: 600,
                      color: c.done ? TOKENS.colors.success : TOKENS.colors.textSoft,
                    }}>
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

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

            {/* Close button — autoridad: backend readiness.canClose + checklist local */}
            <button
              onClick={handleClose}
              disabled={closing || !canClose}
              style={{
                width: '100%', padding: '16px',
                borderRadius: TOKENS.radius.lg,
                background: canClose ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: canClose ? 'white' : TOKENS.colors.textLow,
                fontSize: 16, fontWeight: 700,
                boxShadow: canClose ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                opacity: closing ? 0.6 : 1,
              }}
            >
              {closing
                ? 'Cerrando...'
                : canClose
                  ? 'CERRAR TURNO'
                  : hasBlockers
                    ? 'Corrige los pendientes para cerrar'
                    : !backendCanClose
                      ? 'Cargando estado del turno...'
                      : 'Completa el checklist para cerrar'}
            </button>

            <div style={{ height: 24 }} />
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryItem({ label, value, accent, typo }) {
  return (
    <div style={{
      padding: '10px', borderRadius: TOKENS.radius.md,
      background: 'rgba(255,255,255,0.04)',
    }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: accent || TOKENS.colors.text, margin: 0 }}>{value}</p>
    </div>
  )
}
