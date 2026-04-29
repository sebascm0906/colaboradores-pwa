// ScreenCierreRolito.jsx - V2 Cierre de Turno Guiado
// El conteo de bolsas ahora se toma del flujo real del turno:
//   - bolsas recibidas: material.issue visibles en "Materiales del turno"
//   - bolsas usadas: packing entries del turno
//   - bolsas sobrantes utiles / merma: declaracion de bolsas del operador
// Backend canonico al cerrar: POST /api/production/shift/bag-reconciliation
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getModuleById } from '../registry'
import { resolveModuleContextRole } from '../../lib/roleContext'
import { getShiftOverview, saveBagReconciliation } from './rolitoService'
import { getBagReturnDeclaration, matchesBagReturnDeclaration } from './bagReturnDeclarationStore'
import { notifyOperatorClose } from './api'
import { computeRolitoBagDifference, sumRolitoUsedBags } from './rolitoBagMath'
import { computePackingCoherence, getCoherenceHeadline } from '../shared/packingCoherence'
import { isOperatorTurnClosed, markOperatorTurnClosed, normalizeOperatorCloseRole } from '../shared/operatorTurnCloseStore'

export default function ScreenCierreRolito() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const activeOperatorRole = normalizeOperatorCloseRole(
    resolveModuleContextRole(
      session,
      getModuleById('registro_produccion'),
      location.state?.selected_role,
    ) || session?.role
  )
  const isBarraOperator = activeOperatorRole === 'operador_barra'

  const [data, setData] = useState({ shift: null, cycles: [], packing: [], kpis: null, bagMaterials: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [closing, setClosing] = useState(false)
  const [alreadyClosed, setAlreadyClosed] = useState(false)
  const [checks, setChecks] = useState([
    { id: 'limpia', label: 'Maquina limpia', done: false },
    { id: 'despejada', label: 'Area despejada', done: false },
    { id: 'guardada', label: 'Herramienta guardada', done: false },
    { id: 'sin_prod', label: 'Sin producto en piso', done: false },
  ])

  const loadData = useCallback(async () => {
    try {
      setError('')
      const result = await getShiftOverview()
      setData(result)
      setAlreadyClosed(Boolean(result.shift && isOperatorTurnClosed(result.shift, activeOperatorRole)))
    } catch {
      setError('Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [activeOperatorRole])

  useEffect(() => { loadData() }, [loadData])

  const { shift, kpis } = data
  const totalBagsUsed = sumRolitoUsedBags(data.packing)
  const totalBagsReceived = data.bagMaterials.reduce((sum, item) => sum + (Number(item.issued) || 0), 0)
  const totalBagsSystemRemaining = data.bagMaterials.reduce((sum, item) => sum + (Number(item.remaining) || 0), 0)
  const bagDeclaration = shift?.id ? getBagReturnDeclaration(shift) : null
  const bagDeclarationRequired = !isBarraOperator && totalBagsReceived > 0
  const bagDeclarationReady = !bagDeclarationRequired || matchesBagReturnDeclaration(bagDeclaration, {
    bagsReceived: totalBagsReceived,
    bagsUsed: totalBagsUsed,
    bagsRemaining: totalBagsSystemRemaining,
  })
  const totalBagsReturned = bagDeclarationRequired
    ? (bagDeclarationReady
        ? Number(bagDeclaration?.total_returned ?? totalBagsSystemRemaining) || 0
        : totalBagsSystemRemaining)
    : 0
  const totalBagsDamaged = bagDeclarationReady
    ? Number(bagDeclaration?.total_damaged || 0) || 0
    : 0
  const bagsDiff = totalBagsReceived > 0
    ? computeRolitoBagDifference({
        bagsReceived: totalBagsReceived,
        bagsUsed: totalBagsUsed,
        bagsRemaining: totalBagsReturned,
        bagsDamaged: totalBagsDamaged,
      })
    : null
  const allChecked = checks.every((check) => check.done)
  const hasBlockers = false
  const canClose = allChecked && !alreadyClosed && bagDeclarationReady

  const coherence = useMemo(
    () => computePackingCoherence(data.cycles, data.packing),
    [data.cycles, data.packing]
  )
  const coherenceHeadline = useMemo(() => getCoherenceHeadline(coherence), [coherence])

  function toggleCheck(id) {
    setChecks((prev) => prev.map((check) => (
      check.id === id ? { ...check, done: !check.done } : check
    )))
  }

  async function handleClose() {
    if (!shift?.id) return
    if (bagDeclarationRequired && !bagDeclarationReady) {
      setError('Declara la merma de bolsas antes de entregar el cierre')
      return
    }

    setClosing(true)
    setError('')
    try {
      if (!isBarraOperator && totalBagsReceived > 0) {
        await saveBagReconciliation(shift.id, totalBagsReceived, totalBagsReturned)
      }

      markOperatorTurnClosed(shift, activeOperatorRole, {
        employee_name: session?.employee_name || session?.name || session?.user_name || '',
      })
      notifyOperatorClose({
        shift_id: shift.id,
        role: activeOperatorRole,
        employee_id: session?.employee_id || 0,
        closed_at: new Date().toISOString(),
      }).catch(() => {})
      setAlreadyClosed(true)
      setSuccess('Tu cierre fue entregado al supervisor. El cierre final del turno lo realiza supervision.')
      setTimeout(() => navigate('/produccion'), 1800)
    } catch (e) {
      setError(e?.message || 'Error al cerrar turno')
    } finally {
      setClosing(false)
    }
  }

  return (
    <div style={pageStyle}>
      <style>{globalCss}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/produccion')} style={iconBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
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
            <div style={heroCard}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 12 }}>RESUMEN DEL DIA</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <SummaryItem label="Ciclos" value={kpis ? `${kpis.completedCycles}` : '0'} typo={typo} />
                <SummaryItem
                  label="Producido"
                  value={kpis?.totalKgProduced != null ? `${kpis.totalKgProduced} kg` : '-'}
                  accent={TOKENS.colors.blue2}
                  typo={typo}
                />
                <SummaryItem
                  label="Empacado"
                  value={kpis?.totalKgPacked != null ? `${kpis.totalKgPacked} kg` : '-'}
                  accent={TOKENS.colors.success}
                  typo={typo}
                />
                <SummaryItem
                  label="Merma"
                  value={kpis?.mermaKg != null && kpis?.mermaPct != null ? `${kpis.mermaKg} kg (${kpis.mermaPct}%)` : '-'}
                  accent={kpis?.mermaExceeded ? TOKENS.colors.error : TOKENS.colors.success}
                  typo={typo}
                />
              </div>
            </div>

            {!isBarraOperator && coherenceHeadline && (
              <div style={warningCard}>
                <p style={{ ...typo.body, color: TOKENS.colors.warning, margin: 0, fontWeight: 600 }}>
                  {coherenceHeadline}
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                  Producido {Math.round(coherence.summary.totalProduced)} kg · Empacado {Math.round(coherence.summary.totalPacked)} kg
                </p>
              </div>
            )}

            {!isBarraOperator && (
              <div style={panelCard}>
                <div style={{ marginBottom: 12 }}>
                  <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>CONTEO DE BOLSAS</p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    Este conteo se calcula automaticamente con materiales del turno y la declaracion final.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ReadOnlyRow label="Bolsas recibidas" value={totalBagsReceived} typo={typo} />
                  <ReadOnlyRow label="Bolsas usadas" value={totalBagsUsed} typo={typo} />
                  <ReadOnlyRow label="Bolsas sobrantes" value={totalBagsReturned} typo={typo} />
                  <ReadOnlyRow label="Bolsas merma" value={totalBagsDamaged} typo={typo} accent={TOKENS.colors.warning} />

                  {bagsDiff !== null && (
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: TOKENS.radius.md,
                      marginTop: 4,
                      background: bagsDiff === 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                      border: `1px solid ${bagsDiff === 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600 }}>Diferencia</span>
                        <span style={{
                          ...typo.body,
                          fontWeight: 700,
                          color: bagsDiff === 0 ? TOKENS.colors.success : TOKENS.colors.error,
                        }}>
                          {bagsDiff === 0 ? 'Todo cuadra' : `${bagsDiff > 0 ? '+' : ''}${bagsDiff} bolsas`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isBarraOperator && (
              <button
                onClick={() => navigate('/produccion/declaracion-bolsas', {
                  state: {
                    bagsReceived: totalBagsReceived,
                    bagsUsed: totalBagsUsed,
                    bagsRemaining: totalBagsSystemRemaining,
                    backTo: '/produccion/cierre',
                  },
                })}
              style={declarationBtn}
            >
              <div>
                  <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Declarar merma de bolsas</p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '3px 0 0' }}>
                    {bagDeclarationReady
                      ? `Merma lista: ${totalBagsDamaged} bolsas quedaran como merma y ${totalBagsReturned} regresaran al cierre`
                      : 'Registra cuantas bolsas fueron merma. La devolucion util regresara automaticamente al cierre.'}
                  </p>
              </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}

            {!isBarraOperator && bagDeclarationRequired && !bagDeclarationReady && (
              <div style={warningCard}>
                <p style={{ ...typo.body, color: TOKENS.colors.warning, margin: '0 0 4px', fontWeight: 700 }}>
                  Falta declarar la merma de bolsas
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                  Antes de entregar el cierre al supervisor registra cuantas bolsas fueron merma. La devolucion util se preparara automaticamente con el saldo restante.
                </p>
              </div>
            )}

            <div style={panelCard}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 12px' }}>CHECKLIST DE ENTREGA</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {checks.map((check) => (
                  <button
                    key={check.id}
                    onClick={() => toggleCheck(check.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: TOKENS.radius.md,
                      background: check.done ? 'rgba(34,197,94,0.08)' : TOKENS.colors.surface,
                      border: `1px solid ${check.done ? 'rgba(34,197,94,0.25)' : TOKENS.colors.border}`,
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: check.done ? TOKENS.colors.success : 'transparent',
                      border: `2px solid ${check.done ? TOKENS.colors.success : TOKENS.colors.textMuted}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {check.done && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                    <span style={{
                      ...typo.body,
                      fontWeight: 600,
                      color: check.done ? TOKENS.colors.success : TOKENS.colors.textSoft,
                    }}>
                      {check.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && <MessageBox kind="error" text={error} typo={typo} />}
            {success && <MessageBox kind="success" text={success} typo={typo} />}

            <button
              onClick={handleClose}
              disabled={closing || !canClose}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: TOKENS.radius.lg,
                background: canClose ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: canClose ? 'white' : TOKENS.colors.textLow,
                fontSize: 16,
                fontWeight: 700,
                boxShadow: canClose ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                opacity: closing ? 0.6 : 1,
              }}
            >
              {closing
                ? 'Entregando...'
                : canClose
                  ? 'ENTREGAR CIERRE AL SUPERVISOR'
                  : hasBlockers
                    ? 'Corrige los pendientes para cerrar'
                    : bagDeclarationRequired && !bagDeclarationReady
                      ? 'Declara la merma de bolsas para cerrar'
                      : alreadyClosed
                        ? 'TURNO YA ENTREGADO'
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
      padding: '10px',
      borderRadius: TOKENS.radius.md,
      background: 'rgba(255,255,255,0.04)',
    }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: accent || TOKENS.colors.text, margin: 0 }}>{value}</p>
    </div>
  )
}

function ReadOnlyRow({ label, value, typo, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ ...typo.body, color: TOKENS.colors.textSoft }}>{label}</span>
      <span style={{ ...typo.body, color: accent || TOKENS.colors.text, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function MessageBox({ kind, text, typo }) {
  const isError = kind === 'error'
  return (
    <div style={{
      padding: 12,
      borderRadius: TOKENS.radius.md,
      background: isError ? TOKENS.colors.errorSoft : 'rgba(34,197,94,0.08)',
      border: isError ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(34,197,94,0.25)',
      color: isError ? TOKENS.colors.error : TOKENS.colors.success,
      ...typo.caption,
      textAlign: 'center',
    }}>
      {text}
    </div>
  )
}

const pageStyle = {
  minHeight: '100dvh',
  background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
  paddingTop: 'env(safe-area-inset-top)',
  paddingBottom: 'env(safe-area-inset-bottom)',
}

const heroCard = {
  padding: 16,
  borderRadius: TOKENS.radius.xl,
  background: TOKENS.glass.hero,
  border: `1px solid ${TOKENS.colors.borderBlue}`,
}

const panelCard = {
  padding: 16,
  borderRadius: TOKENS.radius.xl,
  background: TOKENS.glass.panel,
  border: `1px solid ${TOKENS.colors.border}`,
}

const warningCard = {
  padding: '12px 14px',
  borderRadius: TOKENS.radius.md,
  background: 'rgba(245,158,11,0.08)',
  border: '1px solid rgba(245,158,11,0.25)',
}

const declarationBtn = {
  width: '100%',
  padding: '14px 18px',
  borderRadius: TOKENS.radius.lg,
  background: TOKENS.glass.panel,
  border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  textAlign: 'left',
}

const iconBtn = {
  width: 38,
  height: 38,
  borderRadius: TOKENS.radius.md,
  background: TOKENS.colors.surface,
  border: `1px solid ${TOKENS.colors.border}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
  * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
  button { border: none; background: none; cursor: pointer; }
  input { font-family: 'DM Sans', sans-serif; }
  @keyframes spin { to { transform: rotate(360deg); } }
`
