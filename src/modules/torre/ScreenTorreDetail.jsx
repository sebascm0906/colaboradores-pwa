// ─── ScreenTorreDetail — Operador Torre · Completar y confirmar requisición ───
// El Operador Torre llena los campos faltantes por línea:
//   • Precio unitario
//   • Plaza (analytic_distribution del plan "PL")
//
// Al confirmar llama a `POST /pwa-admin/torre/requisition-confirm` que:
//   1. Ejecuta `po.button_confirm()` en Odoo (crea stock pickings)
//   2. Actualiza gf.pwa.requisition.approval_state = 'approved'
//   3. El gerente verá la requisición como "Aprobado" en su historial.
//
// Req 2, 4, 5, 6 del sprint 2026-04-24.
import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TOKENS } from '../../tokens'
import {
  getTorreRequisitionDetail,
  updateTorreRequisitionLines,
  confirmTorreRequisition,
  getTorrePlazas,
} from '../admin/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) =>
  '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const fmtDate = (d) => {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  } catch { return d }
}

// Extrae el account_id principal de un analytic_distribution
function primaryAccountId(dist) {
  if (!dist || typeof dist !== 'object') return null
  const keys = Object.keys(dist)
  return keys.length ? Number(keys[0]) : null
}

// Convierte account_id → analytic_distribution {[id]: 100}
function toDistribution(accountId) {
  if (!accountId) return null
  return { [String(accountId)]: 100.0 }
}

const STATE_MAP = {
  draft:    { label: 'Borrador',    color: TOKENS.colors.textMuted },
  sent:     { label: 'Enviado',     color: '#2B8FE0' },
  purchase: { label: 'Confirmado',  color: '#10B981' },
  done:     { label: 'Completo',    color: '#10B981' },
  cancel:   { label: 'Cancelado',   color: '#EF4444' },
}

// ─── PlazaPicker — selector de cuenta analítica del plan PL ──────────────────

function PlazaPicker({ value, onChange, plazas, loading }) {
  const [open, setOpen] = useState(false)
  const selected = plazas.find((p) => p.id === value) || null

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '8px 12px',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
          color: selected ? 'rgba(255,255,255,0.9)' : TOKENS.colors.textMuted,
          fontSize: 13, fontFamily: 'inherit',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span>{loading ? 'Cargando...' : (selected ? `${selected.code ? '['+selected.code+'] ' : ''}${selected.name}` : 'Selecciona plaza')}</span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>

      {open && !loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#0D1829', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false) }}
            style={{
              width: '100%', textAlign: 'left', padding: '10px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: TOKENS.colors.textMuted, fontSize: 12, fontFamily: 'inherit',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            Sin plaza
          </button>
          {plazas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(p.id); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                background: value === p.id ? 'rgba(43,143,224,0.12)' : 'none',
                border: 'none', cursor: 'pointer',
                color: value === p.id ? '#2B8FE0' : 'rgba(255,255,255,0.82)',
                fontSize: 13, fontFamily: 'inherit',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {p.code ? `[${p.code}] ` : ''}{p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── LineRow — una línea de la orden con campos editables ────────────────────

function LineRow({ line, plazas, plazasLoading, localState, onPriceChange, onPlazaChange }) {
  const priceVal = localState.price_unit !== undefined ? localState.price_unit : line.price_unit
  const plazaId  = localState.plaza_id  !== undefined ? localState.plaza_id  : primaryAccountId(line.analytic_distribution)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: TOKENS.radius.card,
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Producto */}
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          {line.product_name}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: TOKENS.colors.textMuted }}>
          Cantidad: {line.qty} {line.uom}
        </p>
      </div>

      {/* Precio unitario */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
          Precio unitario *
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: TOKENS.colors.textMuted }}>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceVal === 0 ? '' : priceVal}
            onChange={(e) => onPriceChange(line.id, Number(e.target.value) || 0)}
            placeholder="0.00"
            style={{
              flex: 1, padding: '8px 10px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, color: 'rgba(255,255,255,0.9)',
              fontSize: 13, fontFamily: 'inherit',
            }}
          />
        </div>
        {priceVal > 0 && (
          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#10B981' }}>
            Subtotal estimado: {fmt(priceVal * line.qty)}
          </p>
        )}
      </div>

      {/* Plaza */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
          Plaza (distribución analítica)
        </label>
        <PlazaPicker
          value={plazaId}
          onChange={(id) => onPlazaChange(line.id, id)}
          plazas={plazas}
          loading={plazasLoading}
        />
      </div>
    </div>
  )
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function ScreenTorreDetail() {
  const { poId } = useParams()
  const navigate = useNavigate()

  const [detail, setDetail]         = useState(null)
  const [plazas, setPlazas]         = useState([])
  const [plazasLoading, setPlazasLoading] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  // Estado local por línea: { [lineId]: { price_unit?, plaza_id? } }
  const [lineState, setLineState]   = useState({})

  const [saving, setSaving]         = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [toast, setToast]           = useState(null)
  const [confirmed, setConfirmed]   = useState(false)

  // Carga detalle
  const loadDetail = useCallback(async () => {
    if (!poId) return
    setLoading(true)
    setError('')
    try {
      const res = await getTorreRequisitionDetail(Number(poId))
      const d = res?.data || res
      if (!d?.id) throw new Error('Requisición no encontrada')
      setDetail(d)

      // Pre-poblar lineState con precios existentes
      const initial = {}
      for (const l of (d.lines || [])) {
        initial[l.id] = {
          price_unit: l.price_unit || 0,
          plaza_id:   primaryAccountId(l.analytic_distribution),
        }
      }
      setLineState(initial)

      // Cargar plazas usando el company_id de la requisición
      if (d.company_id) {
        setPlazasLoading(true)
        try {
          const pr = await getTorrePlazas(d.company_id)
          setPlazas(pr?.data?.plazas ?? pr?.data ?? [])
        } catch { setPlazas([]) }
        finally { setPlazasLoading(false) }
      }
    } catch (e) {
      setError(e?.message || 'Error al cargar la requisición')
    } finally {
      setLoading(false)
    }
  }, [poId])

  useEffect(() => { loadDetail() }, [loadDetail])

  const handlePriceChange = useCallback((lineId, value) => {
    setLineState((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], price_unit: value },
    }))
  }, [])

  const handlePlazaChange = useCallback((lineId, accountId) => {
    setLineState((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], plaza_id: accountId },
    }))
  }, [])

  // Guarda cambios en líneas y luego confirma
  const handleConfirm = async () => {
    if (!detail) return

    // Validar que todas las líneas tengan precio > 0
    const lines = detail.lines || []
    const missingPrice = lines.filter((l) => {
      const s = lineState[l.id] || {}
      const price = s.price_unit !== undefined ? s.price_unit : l.price_unit
      return !price || price <= 0
    })
    if (missingPrice.length > 0) {
      setToast({ type: 'error', msg: `Faltan precios en ${missingPrice.length} línea(s). Ingresa el precio unitario de cada producto.` })
      setTimeout(() => setToast(null), 4000)
      return
    }

    setConfirming(true)
    setError('')
    try {
      // Paso 1: guardar cambios en líneas
      const updatedLines = lines.map((l) => {
        const s = lineState[l.id] || {}
        const price = s.price_unit !== undefined ? s.price_unit : l.price_unit
        const plazaId = s.plaza_id !== undefined ? s.plaza_id : primaryAccountId(l.analytic_distribution)
        return {
          id: l.id,
          price_unit: price,
          analytic_distribution: plazaId ? toDistribution(plazaId) : (l.analytic_distribution || null),
        }
      })

      await updateTorreRequisitionLines(detail.id, updatedLines)

      // Paso 2: confirmar la orden
      const res = await confirmTorreRequisition(detail.id)
      if (res?.ok === false || res?.error) {
        throw new Error(res?.error || res?.message || 'No se pudo confirmar la requisición')
      }

      setConfirmed(true)
      setToast({ type: 'success', msg: '¡Requisición confirmada! La orden de compra ha sido generada.' })
      setTimeout(() => {
        navigate('/torres')
      }, 2000)
    } catch (e) {
      const msg = e?.message || 'Error al confirmar la requisición'
      setError(msg)
      setToast({ type: 'error', msg })
      setTimeout(() => setToast(null), 5000)
    } finally {
      setConfirming(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh', background: TOKENS.colors.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>
        <div style={{
          width: 32, height: 32,
          border: '2px solid rgba(255,255,255,0.12)',
          borderTop: '2px solid #2B8FE0',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error && !detail) {
    return (
      <div style={{
        minHeight: '100dvh', background: TOKENS.colors.bg,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, gap: 16, fontFamily: "'DM Sans', system-ui, sans-serif",
      }}>
        <p style={{ color: '#EF4444', fontSize: 15, fontWeight: 600, textAlign: 'center' }}>{error}</p>
        <button
          onClick={() => navigate('/torres')}
          style={{
            padding: '10px 24px', borderRadius: 999,
            background: 'linear-gradient(90deg,#15499B,#2B8FE0)',
            border: 'none', cursor: 'pointer',
            color: 'white', fontSize: 14, fontWeight: 700,
          }}
        >
          Volver
        </button>
      </div>
    )
  }

  const stateInfo = STATE_MAP[detail?.state] || { label: detail?.state, color: TOKENS.colors.textMuted }
  const title     = (detail?.origin || '').replace(/^PWA-Admin:\s*/i, '').trim() || detail?.name
  const lines     = detail?.lines || []

  // Subtotal estimado con precios editados
  const totalEstimado = lines.reduce((acc, l) => {
    const s = lineState[l.id] || {}
    const p = s.price_unit !== undefined ? s.price_unit : l.price_unit
    return acc + (Number(p) || 0) * Number(l.qty || 0)
  }, 0)

  return (
    <div style={{
      minHeight: '100dvh', background: TOKENS.colors.bg,
      fontFamily: "'DM Sans', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, background: toast.type === 'success' ? '#0F4A2A' : '#4A0F0F',
          border: `1px solid ${toast.type === 'success' ? '#10B981' : '#EF4444'}40`,
          borderRadius: 10, padding: '10px 20px',
          color: toast.type === 'success' ? '#10B981' : '#EF4444',
          fontSize: 13, fontWeight: 600, maxWidth: '90vw', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(3,8,17,0.95)',
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => navigate('/torres')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 4, color: 'rgba(255,255,255,0.6)', fontSize: 20,
          }}
          aria-label="Volver"
        >
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detail?.name}
          </h1>
          <p style={{ margin: 0, fontSize: 11, color: TOKENS.colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </p>
        </div>
        {/* Badge de estado */}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 8px',
          borderRadius: 999, background: `${stateInfo.color}18`,
          border: `1px solid ${stateInfo.color}35`, color: stateInfo.color,
          flexShrink: 0,
        }}>
          {stateInfo.label}
        </span>
      </div>

      {/* Info de la requisición */}
      <div style={{ padding: '12px 16px 0', maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: TOKENS.radius.card, padding: '12px 16px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, color: TOKENS.colors.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Empresa</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#2B8FE0', fontWeight: 600 }}>{detail?.company_name || '—'}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 10, color: TOKENS.colors.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Fecha</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>{fmtDate(detail?.date_order)}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 10, color: TOKENS.colors.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Proveedor</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>{detail?.partner_name || '—'}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 10, color: TOKENS.colors.textMuted, fontWeight: 600, textTransform: 'uppercase' }}>Total estimado</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{fmt(totalEstimado)}</p>
          </div>
        </div>

        {detail?.notes && (
          <div style={{
            marginTop: 10, background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8, padding: '8px 12px',
          }}>
            <p style={{ margin: 0, fontSize: 11, color: TOKENS.colors.textMuted, fontWeight: 600 }}>Notas</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{detail.notes}</p>
          </div>
        )}
      </div>

      {/* Líneas */}
      <div style={{ flex: 1, padding: '12px 16px 100px', maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: TOKENS.colors.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {lines.length} Línea{lines.length !== 1 ? 's' : ''} · Completa los campos
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              plazas={plazas}
              plazasLoading={plazasLoading}
              localState={lineState[line.id] || {}}
              onPriceChange={handlePriceChange}
              onPlazaChange={handlePlazaChange}
            />
          ))}
        </div>

        {error && (
          <div style={{
            marginTop: 16, background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8, padding: '10px 14px',
          }}>
            <p style={{ margin: 0, fontSize: 13, color: '#EF4444' }}>{error}</p>
          </div>
        )}
      </div>

      {/* Botón confirmar — fijo al fondo */}
      {!confirmed && detail?.state !== 'purchase' && detail?.state !== 'done' && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'rgba(3,8,17,0.96)',
          borderTop: '1px solid rgba(255,255,255,0.09)',
          padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 8,
          backdropFilter: 'blur(8px)',
        }}>
          {/* Resumen de total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 }}>
            <span style={{ fontSize: 12, color: TOKENS.colors.textMuted }}>Total de la orden</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{fmt(totalEstimado)}</span>
          </div>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            style={{
              width: '100%', padding: '14px',
              background: confirming ? 'rgba(43,143,224,0.4)' : 'linear-gradient(90deg,#15499B,#2B8FE0)',
              border: 'none', borderRadius: 12,
              color: 'white', fontSize: 15, fontWeight: 700,
              cursor: confirming ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: confirming ? 0.7 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {confirming ? 'Confirmando...' : 'Confirmar y generar orden de compra'}
          </button>
        </div>
      )}

      {/* Estado ya confirmado */}
      {(confirmed || detail?.state === 'purchase' || detail?.state === 'done') && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'rgba(3,8,17,0.96)',
          borderTop: '1px solid rgba(16,185,129,0.25)',
          padding: '16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#10B981' }}>
            ✓ Orden confirmada
          </p>
          <button
            onClick={() => navigate('/torres')}
            style={{
              padding: '10px 32px', borderRadius: 999,
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.3)',
              color: '#10B981', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Volver a la lista
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
