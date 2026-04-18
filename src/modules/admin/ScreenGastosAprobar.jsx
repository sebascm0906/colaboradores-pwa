// ─── ScreenGastosAprobar — Inbox de gastos pendientes (gerente) ─────────────
// Endpoint: GET /pwa-admin/expenses-pending-approval?company_id=
// Acciones: POST /pwa-admin/expense-approve | /expense-reject
//
// Guía de pruebas sección 2d/2e/2f. Solo el gerente (allow_authorize_cash_closing
// o similar) ve estos items; backend valida permiso y devuelve 403 si no.
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { useToast } from '../../components/Toast'
import { Loader, EmptyState, ErrorState } from '../../components/Loader'
import { AdminProvider, useAdmin } from './AdminContext'
import AdminShell from './components/AdminShell'
import {
  getExpensesPendingApproval,
  approveExpense,
  rejectExpense,
} from './api'
import { logScreenError } from '../shared/logScreenError'

const fmt = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function unwrap(res) {
  if (res && typeof res === 'object' && 'data' in res) return res.data
  return res
}

function GastosAprobarInner() {
  const { companyId, companyLabel } = useAdmin()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(null)    // expense_id en proceso
  const [rejectDialog, setRejectDialog] = useState(null) // {expense}
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return }
    setLoading(true); setError('')
    try {
      const res = await getExpensesPendingApproval({ companyId, limit: 50 })
      const payload = unwrap(res) ?? {}
      const list = Array.isArray(payload.expenses) ? payload.expenses
                 : Array.isArray(payload)          ? payload
                 : []
      setItems(list)
    } catch (e) {
      logScreenError('ScreenGastosAprobar', 'load', e)
      setError(e?.message || 'Error cargando gastos pendientes')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  async function doApprove(exp) {
    if (processing) return
    setProcessing(exp.id)
    try {
      const res = await approveExpense(exp.id)
      if (res?.ok === false || res?.error) {
        toast.error(res?.error || res?.message || 'No se pudo aprobar')
      } else {
        toast.success(`Gasto "${exp.name || exp.description}" aprobado`)
        await load()
      }
    } catch (e) {
      logScreenError('ScreenGastosAprobar', 'approve', e)
      toast.error(e?.message || 'Error al aprobar')
    } finally {
      setProcessing(null)
    }
  }

  function openReject(exp) {
    setRejectDialog({ expense: exp })
    setRejectReason('')
  }

  async function doReject() {
    if (!rejectDialog?.expense || !rejectReason.trim() || processing) return
    const exp = rejectDialog.expense
    setProcessing(exp.id)
    try {
      const res = await rejectExpense(exp.id, rejectReason.trim())
      if (res?.ok === false || res?.error) {
        toast.error(res?.error || res?.message || 'No se pudo rechazar')
      } else {
        toast.success(`Gasto rechazado`)
        setRejectDialog(null)
        setRejectReason('')
        await load()
      }
    } catch (e) {
      logScreenError('ScreenGastosAprobar', 'reject', e)
      toast.error(e?.message || 'Error al rechazar')
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, margin: 0,
        }}>
          APROBACIÓN DE GASTOS · {(companyLabel || '').toUpperCase()}
        </p>
        <h1 style={{
          fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em',
          color: TOKENS.colors.text, margin: '4px 0 0',
        }}>
          Inbox de aprobaciones
        </h1>
        {items.length > 0 && (
          <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: '6px 0 0' }}>
            {items.length} gasto{items.length === 1 ? '' : 's'} pendiente{items.length === 1 ? '' : 's'} de revisión
          </p>
        )}
      </div>

      {loading ? (
        <Loader label="Cargando gastos pendientes…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState icon="✓" title="Todo al día" subtitle="No hay gastos pendientes de aprobación" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(exp => (
            <ExpenseCard
              key={exp.id}
              expense={exp}
              isProcessing={processing === exp.id}
              onApprove={() => doApprove(exp)}
              onReject={() => openReject(exp)}
            />
          ))}
        </div>
      )}

      {rejectDialog && (
        <RejectModal
          expense={rejectDialog.expense}
          reason={rejectReason}
          setReason={setRejectReason}
          onCancel={() => { setRejectDialog(null); setRejectReason('') }}
          onConfirm={doReject}
          submitting={processing === rejectDialog.expense?.id}
        />
      )}
    </div>
  )
}

function ExpenseCard({ expense, isProcessing, onApprove, onReject }) {
  const amount = Number(expense.total_amount ?? expense.unit_amount ?? expense.amount ?? 0)
  const date = expense.date || expense.create_date || ''
  const employee = Array.isArray(expense.employee_id) ? expense.employee_id[1] : (expense.employee_name || '')
  const name = expense.name || expense.description || `Gasto #${expense.id}`
  const hasAttachment = Boolean(expense.attachment_ids?.length || expense.x_has_attachment)

  return (
    <div style={{
      padding: 14, borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 14, fontWeight: 700, color: TOKENS.colors.text,
            margin: 0, marginBottom: 4,
          }}>{name}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: TOKENS.colors.textMuted }}>
            {date && <span>📅 {String(date).slice(0, 10)}</span>}
            {employee && <span>👤 {employee}</span>}
            {hasAttachment && <span style={{ color: TOKENS.colors.success }}>📎 Comprobante</span>}
            {!hasAttachment && <span style={{ color: TOKENS.colors.warning }}>⚠ Sin comprobante</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: TOKENS.colors.text, margin: 0 }}>
            {fmt(amount)}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button
          onClick={onApprove}
          disabled={isProcessing}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.sm,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)',
            color: '#22c55e', fontSize: 12, fontWeight: 700,
            cursor: isProcessing ? 'wait' : 'pointer',
            opacity: isProcessing ? 0.6 : 1,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {isProcessing ? 'Procesando…' : '✓ Aprobar'}
        </button>
        <button
          onClick={onReject}
          disabled={isProcessing}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.sm,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)',
            color: '#ef4444', fontSize: 12, fontWeight: 700,
            cursor: isProcessing ? 'wait' : 'pointer',
            opacity: isProcessing ? 0.6 : 1,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          ✕ Rechazar
        </button>
      </div>
    </div>
  )
}

function RejectModal({ expense, reason, setReason, onCancel, onConfirm, submitting }) {
  const canConfirm = reason.trim().length >= 5
  return (
    <div
      onClick={() => !submitting && onCancel()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 400, width: '100%',
          padding: 20, borderRadius: TOKENS.radius.xl,
          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
        }}
      >
        <p style={{ fontSize: 16, fontWeight: 700, color: TOKENS.colors.text, margin: '0 0 4px' }}>
          Rechazar gasto
        </p>
        <p style={{ fontSize: 12, color: TOKENS.colors.textMuted, margin: '0 0 14px' }}>
          {expense?.name || `Gasto #${expense?.id}`}
        </p>

        <label style={{ fontSize: 11, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
          Motivo * (mínimo 5 caracteres)
        </label>
        <textarea
          autoFocus
          rows={4}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ej: Falta factura original, no corresponde a gasto operativo, etc."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.text, fontSize: 13, outline: 'none',
            fontFamily: "'DM Sans', sans-serif", resize: 'vertical',
          }}
          maxLength={500}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.textSoft, fontSize: 13, fontWeight: 600,
            }}
          >Cancelar</button>
          <button
            onClick={onConfirm}
            disabled={submitting || !canConfirm}
            style={{
              flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
              background: canConfirm ? 'linear-gradient(135deg,#991b1b,#dc2626)' : TOKENS.colors.surfaceSoft,
              color: 'white', fontSize: 13, fontWeight: 700,
              opacity: (submitting || !canConfirm) ? 0.5 : 1,
              cursor: (submitting || !canConfirm) ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Rechazando…' : 'Confirmar rechazo'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ScreenGastosAprobar() {
  return (
    <AdminProvider>
      <AdminShell activeBlock="gastos-aprobar" title="Aprobar gastos">
        <GastosAprobarInner />
      </AdminShell>
    </AdminProvider>
  )
}
