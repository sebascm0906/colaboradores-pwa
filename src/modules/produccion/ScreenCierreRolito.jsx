// ScreenCierreRolito.jsx — V2 Cierre de Turno Guiado
// Muestra resumen del dia + cuadratura de bolsas + checklist entrega.
// Backend confirmado:
//   x_bags_received, x_bags_remaining → EXISTEN en gf.production.shift
//   action_close → se intenta, con fallback a state='done'
//   Checklist entrega: local-only (template no existe en Odoo aun)
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import {
  getShiftOverview,
  closeShift,
  saveBagReconciliation,
} from './rolitoService'

export default function ScreenCierreRolito() {
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [data, setData] = useState({ shift: null, cycles: [], packing: [], kpis: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [closing, setClosing] = useState(false)

  // Bag reconciliation — persisted to x_bags_received / x_bags_remaining
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

      await closeShift(shift.id)
      setSuccess('Turno cerrado')
      setTimeout(() => navigate('/'), 2000)
    } catch (e) {
      setError(e.message || 'Error al cerrar turno')
    } finally {
      setClosing(false)
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
                <SummaryItem label="Producido" value={kpis ? `${kpis.totalKgProduced} kg` : '0'} accent={TOKENS.colors.blue2} typo={typo} />
                <SummaryItem label="Empacado" value={kpis ? `${kpis.totalKgPacked} kg` : '0'} accent={TOKENS.colors.success} typo={typo} />
                <SummaryItem label="Merma" value={kpis ? `${kpis.mermaKg} kg (${kpis.mermaPct}%)` : '0'}
                  accent={kpis?.mermaPct > 5 ? TOKENS.colors.error : TOKENS.colors.success} typo={typo} />
              </div>
            </div>

            {/* ── CUADRATURA BOLSAS ───────────────────────────── */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>CUADRATURA DE BOLSAS</p>
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
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: TOKENS.radius.md, marginTop: 4,
                    background: bagsDiff === 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${bagsDiff === 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  }}>
                    <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600 }}>Diferencia</span>
                    <span style={{
                      ...typo.body, fontWeight: 700,
                      color: bagsDiff === 0 ? TOKENS.colors.success : TOKENS.colors.error,
                    }}>
                      {bagsDiff === 0 ? 'Cuadra' : `${bagsDiff > 0 ? '+' : ''}${bagsDiff} bolsas`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── CHECKLIST ENTREGA ───────────────────────────── */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>CHECKLIST DE ENTREGA</p>
                <span style={{
                  ...typo.caption, padding: '2px 8px', borderRadius: TOKENS.radius.pill,
                  background: 'rgba(43,143,224,0.1)', color: TOKENS.colors.blue2, fontWeight: 700,
                }}>
                  Local
                </span>
              </div>
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

            {/* Close button */}
            <button
              onClick={handleClose}
              disabled={closing || !allChecked}
              style={{
                width: '100%', padding: '16px',
                borderRadius: TOKENS.radius.lg,
                background: allChecked ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: allChecked ? 'white' : TOKENS.colors.textLow,
                fontSize: 16, fontWeight: 700,
                boxShadow: allChecked ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                opacity: closing ? 0.6 : 1,
              }}
            >
              {closing ? 'Cerrando...' : allChecked ? 'CERRAR TURNO' : 'Completa el checklist para cerrar'}
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
