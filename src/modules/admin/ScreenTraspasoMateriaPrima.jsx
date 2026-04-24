import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { useSession } from '../../App'
import { logScreenError } from '../shared/logScreenError'
import { getDispatchConfig, createDispatchTransfer, getMaterialCatalog } from '../almacen-pt/materialsService'
import { getEnabledDispatchDestinations } from '../almacen-pt/materialDispatchConfig'
import { AdminProvider } from './AdminContext'
import AdminShell from './components/AdminShell'

export default function ScreenTraspasoMateriaPrima() {
  const [sw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  if (sw < 1024) {
    return (
      <AdminProvider>
        <MobileTraspasoMP />
      </AdminProvider>
    )
  }
  return (
    <AdminProvider>
      <AdminShell activeBlock="traspaso-mp" title="Traspaso Materia Prima">
        <TraspasoMPForm />
      </AdminShell>
    </AdminProvider>
  )
}

function MobileTraspasoMP() {
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>TRASPASO MATERIA PRIMA</span>
        </div>
        <TraspasoMPForm />
      </div>
    </div>
  )
}

function TraspasoMPForm() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = session?.warehouse_id || null

  const [config, setConfig] = useState(null)
  const [configError, setConfigError] = useState('')
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState('destination') // 'destination' | 'form'
  const [selectedDest, setSelectedDest] = useState(null)

  const [materialId, setMaterialId] = useState('')
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!warehouseId) {
      setConfigError('No se encontró warehouse en la sesión')
      setLoading(false)
      return
    }
    let alive = true
    async function load() {
      try {
        const [cfg, mats] = await Promise.all([
          getDispatchConfig({ warehouseId }),
          getMaterialCatalog({}).catch(() => ({ items: [] })),
        ])
        if (!alive) return
        setConfig(cfg)
        setMaterials(mats.items || [])
        const dests = getEnabledDispatchDestinations(cfg)
        if (dests.length === 0) setConfigError('Sin destinos configurados en Odoo para este almacén')
      } catch (e) {
        logScreenError('ScreenTraspasoMateriaPrima', 'loadConfig', e)
        if (alive) setConfigError('Error cargando configuración de Odoo')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [warehouseId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedDest || !materialId || !(Number(qty) > 0)) return
    setSubmitting(true)
    setError('')
    try {
      await createDispatchTransfer({
        warehouseId,
        destinationKey: selectedDest.key,
        materialId: Number(materialId),
        qtyIssued: Number(qty),
        issuedBy: session?.employee_id,
        notes,
      })
      setSuccess(true)
    } catch (e) {
      logScreenError('ScreenTraspasoMateriaPrima', 'createDispatchTransfer', e)
      setError(e?.message || 'Error al crear el traspaso')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Spinner />

  if (configError) {
    return (
      <div style={{ padding: '32px 0' }}>
        <div style={{
          padding: '20px', borderRadius: TOKENS.radius.lg,
          background: `${TOKENS.colors.error}14`, border: `1px solid ${TOKENS.colors.error}30`,
        }}>
          <p style={{ ...typo.title, color: TOKENS.colors.error, margin: '0 0 6px' }}>Configuración faltante</p>
          <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>{configError}</p>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '10px 0 0' }}>
            Configura los destinos de materia prima en Odoo → Almacén → Traspaso MP
          </p>
        </div>
      </div>
    )
  }

  const destinations = getEnabledDispatchDestinations(config)

  if (success) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `${TOKENS.colors.success}20`, border: `1px solid ${TOKENS.colors.success}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 6px' }}>Traspaso registrado</p>
        <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: '0 0 24px' }}>
          Material enviado a {selectedDest?.location_name || selectedDest?.label || selectedDest?.key}
        </p>
        <button
          onClick={() => { setSuccess(false); setStep('destination'); setSelectedDest(null); setMaterialId(''); setQty(''); setNotes('') }}
          style={{
            width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            ...typo.title, color: TOKENS.colors.text, cursor: 'pointer',
          }}
        >
          Nuevo traspaso
        </button>
        <button
          onClick={() => navigate('/admin')}
          style={{
            width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
            background: 'transparent', border: 'none',
            ...typo.body, color: TOKENS.colors.textMuted, cursor: 'pointer', marginTop: 8,
          }}
        >
          Volver al panel
        </button>
      </div>
    )
  }

  if (step === 'destination') {
    return (
      <div style={{ paddingTop: 8 }}>
        <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 12 }}>SELECCIONA DESTINO</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {destinations.map(dest => (
            <button
              key={dest.key}
              onClick={() => { setSelectedDest(dest); setStep('form') }}
              style={{
                padding: '18px 20px', borderRadius: TOKENS.radius.lg,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                boxShadow: TOKENS.shadow.soft,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div>
                <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>
                  {dest.label || (dest.key === 'rolito' ? 'Rolito' : 'Almacenista PT')}
                </p>
                {dest.location_name && (
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    {dest.location_name}
                  </p>
                )}
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ paddingTop: 8 }}>
      <button
        type="button"
        onClick={() => { setStep('destination'); setSelectedDest(null) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
          background: 'transparent', border: 'none', cursor: 'pointer',
          ...typo.caption, color: TOKENS.colors.blue3,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
        </svg>
        {selectedDest?.label || selectedDest?.key}
        {selectedDest?.location_name && ` · ${selectedDest.location_name}`}
      </button>

      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 12 }}>MATERIAL</p>

      {materials.length > 0 ? (
        <select
          required
          value={materialId}
          onChange={e => setMaterialId(e.target.value)}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            color: materialId ? TOKENS.colors.text : TOKENS.colors.textMuted,
            fontSize: 15, marginBottom: 12,
          }}
        >
          <option value="">Selecciona material...</option>
          {materials.map(m => (
            <option key={m.id} value={m.id}>{m.name || m.product_name}</option>
          ))}
        </select>
      ) : (
        <div style={{
          padding: '12px 16px', borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
          ...typo.body, color: TOKENS.colors.textMuted, marginBottom: 12,
        }}>
          Sin catálogo disponible — ingresa ID de material
        </div>
      )}

      <input
        type="number"
        required
        min="0.01"
        step="any"
        placeholder="Cantidad"
        value={qty}
        onChange={e => setQty(e.target.value)}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
          color: TOKENS.colors.text, fontSize: 15, marginBottom: 12,
        }}
      />

      <textarea
        placeholder="Notas (opcional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
          color: TOKENS.colors.text, fontSize: 14, resize: 'none', marginBottom: 20,
        }}
      />

      {error && (
        <p style={{ ...typo.caption, color: TOKENS.colors.error, marginBottom: 12 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || !materialId || !(Number(qty) > 0)}
        style={{
          width: '100%', padding: '16px', borderRadius: TOKENS.radius.lg,
          background: submitting ? TOKENS.colors.surface : 'linear-gradient(90deg, #15499B, #2B8FE0)',
          border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
          ...typo.title, color: 'white', opacity: (submitting || !materialId || !(Number(qty) > 0)) ? 0.5 : 1,
        }}
      >
        {submitting ? 'Registrando...' : 'Confirmar traspaso'}
      </button>
    </form>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}
