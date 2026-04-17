// ScreenTanqueLista — selector de tanques de salmuera
// Lista todos los gf.production.machine con machine_type='tanque_salmuera'.
// El operador elige en cuál va a trabajar → navega a /produccion/tanque/:id

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { listTanks } from './barraService'

export default function ScreenTanqueLista() {
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tanks, setTanks] = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await listTanks()
      setTanks(Array.isArray(res?.tanks) ? res.tanks : [])
    } catch (e) {
      setError(e.message || 'Error al cargar tanques')
    } finally {
      setLoading(false)
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
        button { border: none; background: none; cursor: pointer; font-family: 'DM Sans', sans-serif; }
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Selecciona tu tanque</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{
            padding: 14, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
            color: TOKENS.colors.error, ...typo.caption, textAlign: 'center',
          }}>{error}</div>
        ) : tanks.length === 0 ? (
          <div style={{
            padding: 20, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center',
          }}>
            No hay tanques de salmuera configurados
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 4 }}>
              {tanks.length === 1
                ? 'Entra al tanque para ver las canastillas.'
                : `${tanks.length} tanques disponibles. Elige uno para trabajar.`}
            </p>
            {tanks.map(t => (
              <TankCard key={t.id} tank={t} typo={typo} onClick={() => navigate(`/produccion/tanque/${t.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TankCard({ tank, typo, onClick }) {
  const saltPct = Math.round((Number(tank.salt_level) || 0) * 100) / 100
  const temp = Number(tank.brine_temp) || 0
  return (
    <button onClick={onClick} style={{
      padding: 16, borderRadius: TOKENS.radius.lg, textAlign: 'left',
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.borderBlue}`,
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: TOKENS.shadow.md,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.blueGlow, border: `1px solid ${TOKENS.colors.borderBlue}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#61b2ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2"/>
            <line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="4" x2="12" y2="20"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ ...typo.h2, color: 'white', margin: 0 }}>{tank.display_name || tank.name}</p>
          {tank.line_name && (
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{tank.line_name}</p>
          )}
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: TOKENS.radius.pill,
          background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)',
          color: TOKENS.colors.success, fontSize: 11, fontWeight: 700,
        }}>
          {tank.ready_slots_count} listas
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        paddingTop: 8, borderTop: `1px solid ${TOKENS.colors.border}`,
      }}>
        <MiniStat label="Canastillas" value={tank.total_slots || '—'} typo={typo} />
        <MiniStat label="Barras/cnst" value={tank.bars_per_basket || '—'} typo={typo} />
        <MiniStat label="Kg/barra" value={tank.kg_per_bar || '—'} typo={typo} />
        <MiniStat label="°C" value={temp ? temp.toFixed(1) : '—'} typo={typo} alert={tank.brine_temp_alert} />
      </div>
      {tank.product_name && (
        <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: 0, marginTop: 2 }}>
          Producto: <span style={{ color: TOKENS.colors.textSoft, fontWeight: 600 }}>{tank.product_name}</span>
        </p>
      )}
    </button>
  )
}

function MiniStat({ label, value, typo, alert }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{
        fontSize: 16, fontWeight: 800,
        color: alert ? TOKENS.colors.warning : 'white',
        margin: 0, lineHeight: 1,
      }}>{value}</p>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0, marginTop: 4 }}>{label}</p>
    </div>
  )
}
