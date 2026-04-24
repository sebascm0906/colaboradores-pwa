import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { useSession } from '../../App'
import { logScreenError } from '../shared/logScreenError'
import { getPendingBagCustody, validateBagCustody, computeBagDifference } from '../almacen-pt/bagCustodyService'
import { AdminProvider } from './AdminContext'
import AdminShell from './components/AdminShell'

export default function ScreenValidacionBolsas() {
  const [sw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  if (sw < 1024) {
    return (
      <AdminProvider>
        <MobileValidacionBolsas />
      </AdminProvider>
    )
  }
  return (
    <AdminProvider>
      <AdminShell activeBlock="bolsas-validar" title="Validación de Bolsas">
        <ValidacionBolsasContent />
      </AdminShell>
    </AdminProvider>
  )
}

function MobileValidacionBolsas() {
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

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
      `}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/admin')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Validación de Bolsas</span>
        </div>
        <ValidacionBolsasContent />
      </div>
    </div>
  )
}

function ValidacionBolsasContent() {
  const { session } = useSession()
  const [sw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = session?.warehouse_id || null
  const employeeId = session?.employee_id || null

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [bagsValidated, setBagsValidated] = useState('')
  const [managerNotes, setManagerNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!warehouseId) {
      setError('Sin warehouse en sesión')
      setLoading(false)
      return
    }
    let alive = true
    async function load() {
      try {
        const res = await getPendingBagCustody({ warehouseId })
        if (!alive) return
        const pending = (res.items || []).filter(r =>
          r.state === 'declared_by_worker' || r.state === 'issued'
        )
        setItems(pending)
      } catch (e) {
        logScreenError('ScreenValidacionBolsas', 'getPendingBagCustody', e)
        if (alive) setError('Error cargando custodias pendientes')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [warehouseId])

  const preview = useMemo(() => {
    if (!selected || bagsValidated === '') return null
    return computeBagDifference({
      bagsIssued: selected.bags_issued,
      bagsValidatedByManager: Number(bagsValidated),
      bagUnitCost: selected.bag_unit_cost,
    })
  }, [selected, bagsValidated])

  async function handleValidate(e) {
    e.preventDefault()
    if (!selected?.id || bagsValidated === '') return
    if (preview?.debtRequired && !managerNotes.trim()) {
      setError('Se requiere nota cuando hay faltante')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await validateBagCustody({
        custodyId: selected.id,
        bagsValidatedByManager: Number(bagsValidated),
        employeeId,
        notes: managerNotes,
      })
      setResult(res)
      setItems(prev => prev.filter(r => r.id !== selected.id))
      setSelected(null)
    } catch (e) {
      logScreenError('ScreenValidacionBolsas', 'validateBagCustody', e)
      setError(e?.message || 'Error al validar custodia')
    } finally {
      setSubmitting(false)
    }
  }

  const fmtMXN = (n) => `$${Number(n || 0).toFixed(2)}`

  if (loading) return <Spinner />

  if (error && !selected) {
    return (
      <div style={{ padding: '16px', borderRadius: TOKENS.radius.lg, background: `${TOKENS.colors.error}14`, border: `1px solid ${TOKENS.colors.error}30`, marginTop: 8 }}>
        <p style={{ ...typo.body, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
      </div>
    )
  }

  if (result) {
    return (
      <div style={{ paddingTop: 32 }}>
        <div style={{
          padding: '20px', borderRadius: TOKENS.radius.lg,
          background: result.debt_created ? `${TOKENS.colors.warning}14` : `${TOKENS.colors.success}14`,
          border: `1px solid ${result.debt_created ? TOKENS.colors.warning : TOKENS.colors.success}30`,
          marginBottom: 20,
        }}>
          <p style={{ ...typo.title, color: result.debt_created ? TOKENS.colors.warning : TOKENS.colors.success, margin: '0 0 12px' }}>
            {result.debt_created ? 'Validado con faltante' : 'Validado sin diferencia'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row label="Entregadas" value={result.bags_issued} typo={typo} />
            <Row label="Validadas" value={result.bags_validated_by_manager} typo={typo} />
            {result.difference_bags > 0 && (
              <>
                <Row label="Faltante" value={`${result.difference_bags} bolsas`} typo={typo} accent={TOKENS.colors.error} />
                <Row label="Monto adeudo" value={fmtMXN(result.difference_amount)} typo={typo} accent={TOKENS.colors.error} />
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => setResult(null)}
          style={{
            width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            ...typo.title, color: TOKENS.colors.text, cursor: 'pointer',
          }}
        >
          {items.length > 0 ? 'Ver siguiente pendiente' : 'Cerrar'}
        </button>
      </div>
    )
  }

  if (selected) {
    return (
      <form onSubmit={handleValidate} style={{ paddingTop: 8 }}>
        <button
          type="button"
          onClick={() => { setSelected(null); setBagsValidated(''); setManagerNotes(''); setError('') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
            background: 'transparent', border: 'none', cursor: 'pointer',
            ...typo.caption, color: TOKENS.colors.blue3,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
          </svg>
          Lista
        </button>

        <div style={{ padding: '16px', borderRadius: TOKENS.radius.lg, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, marginBottom: 16 }}>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 10px' }}>RESUMEN DE ENTREGA</p>
          <Row label="Destino" value={selected.destination_key === 'rolito' ? 'Rolito' : 'Almacenista PT'} typo={typo} />
          <Row label="Bolsas entregadas" value={selected.bags_issued} typo={typo} />
          {selected.state === 'declared_by_worker' && (
            <Row label="Declaradas por trabajador" value={selected.bags_declared_by_worker} typo={typo} />
          )}
        </div>

        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>CONTEO FÍSICO GERENTE</p>
        <input
          type="number"
          required
          min="0"
          placeholder={`Bolsas contadas físicamente (entregadas: ${selected.bags_issued})`}
          value={bagsValidated}
          onChange={e => setBagsValidated(e.target.value)}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.text, fontSize: 18, fontWeight: 600, marginBottom: 12,
          }}
        />

        {preview && (
          <div style={{
            padding: '12px 16px', borderRadius: TOKENS.radius.md, marginBottom: 12,
            background: preview.debtRequired ? `${TOKENS.colors.error}10` : `${TOKENS.colors.success}10`,
            border: `1px solid ${preview.debtRequired ? TOKENS.colors.error : TOKENS.colors.success}30`,
          }}>
            {preview.debtRequired ? (
              <>
                <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '0 0 2px', fontWeight: 700 }}>
                  Faltante: {preview.differenceBags} bolsas
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>
                  Adeudo: {fmtMXN(preview.differenceAmount)}
                </p>
              </>
            ) : (
              <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: 0, fontWeight: 600 }}>
                Sin faltante
              </p>
            )}
          </div>
        )}

        <textarea
          placeholder={preview?.debtRequired ? 'Nota requerida cuando hay faltante' : 'Notas (opcional)'}
          value={managerNotes}
          onChange={e => setManagerNotes(e.target.value)}
          required={preview?.debtRequired}
          rows={2}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.text, fontSize: 14, resize: 'none', marginBottom: 20,
          }}
        />

        {error && <p style={{ ...typo.caption, color: TOKENS.colors.error, marginBottom: 12 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting || bagsValidated === ''}
          style={{
            width: '100%', padding: '16px', borderRadius: TOKENS.radius.lg,
            background: submitting ? TOKENS.colors.surface : 'linear-gradient(90deg, #15499B, #2B8FE0)',
            border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
            ...typo.title, color: 'white',
            opacity: (submitting || bagsValidated === '') ? 0.5 : 1,
          }}
        >
          {submitting ? 'Validando...' : 'Confirmar validación'}
        </button>
      </form>
    )
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 60 }}>
        <p style={{ ...typo.title, color: TOKENS.colors.textSoft, margin: '0 0 8px' }}>Sin validaciones pendientes</p>
        <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>
          Todos los registros de bolsas están al corriente
        </p>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 12 }}>PENDIENTES DE VALIDAR ({items.length})</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => { setSelected(item); setBagsValidated(''); setManagerNotes(''); setError('') }}
            style={{
              padding: '16px', borderRadius: TOKENS.radius.lg,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
              boxShadow: TOKENS.shadow.soft,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div>
              <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 4px' }}>
                {item.destination_key === 'rolito' ? 'Rolito' : 'Almacenista PT'}
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
                  Entregadas: {item.bags_issued}
                </span>
                {item.state === 'declared_by_worker' && (
                  <span style={{ ...typo.caption, color: TOKENS.colors.warning }}>
                    Declaradas: {item.bags_declared_by_worker}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                padding: '3px 8px', borderRadius: 4,
                background: item.state === 'declared_by_worker' ? `${TOKENS.colors.success}20` : `${TOKENS.colors.warning}20`,
                color: item.state === 'declared_by_worker' ? TOKENS.colors.success : TOKENS.colors.warning,
              }}>
                {item.state === 'declared_by_worker' ? 'DECLARADO' : 'EMITIDO'}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function Row({ label, value, typo, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{label}</span>
      <span style={{ ...typo.caption, fontWeight: 600, color: accent || TOKENS.colors.textSoft }}>{value}</span>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}
