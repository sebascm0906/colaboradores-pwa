// ─── ScreenTareasSupervisor — gestión de tareas del supervisor a su equipo ──
// Permite: crear tarea, asignar a vendedor, prioridad, fecha, seguimiento.
//
// ⚠️ STUB MODE: los datos viven en localStorage hasta que backend exponga
// /pwa-supv/tasks/*. Se muestra banner informativo al usuario.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { useToast } from '../../components/Toast'
import { Loader, EmptyState, ErrorState } from '../../components/Loader'
import AuthBanner from '../../components/AuthBanner'
import { getTeam } from './api'
import {
  listTasks,
  createTask,
  completeTask,
  cancelTask,
  TASK_STATES,
  TASK_PRIORITIES,
  isStubMode,
} from './tareasService'

export default function ScreenTareasSupervisor() {
  const { session } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [tasks, setTasks] = useState([])
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterState, setFilterState] = useState('all')
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [assigneeId, setAssigneeId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [tasksData, teamData] = await Promise.all([
        listTasks(),
        getTeam().catch(() => []),
      ])
      setTasks(tasksData || [])
      setTeam(Array.isArray(teamData) ? teamData : [])
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar tareas')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (filterState === 'all') return tasks
    return tasks.filter(t => t.state === filterState)
  }, [tasks, filterState])

  const stats = useMemo(() => ({
    pending: tasks.filter(t => t.state === 'pending').length,
    in_progress: tasks.filter(t => t.state === 'in_progress').length,
    done: tasks.filter(t => t.state === 'done').length,
  }), [tasks])

  async function handleCreate() {
    const trimmedTitle = title.trim()
    if (!trimmedTitle || trimmedTitle.length < 3) {
      toast.error('El título debe tener al menos 3 caracteres')
      return
    }
    if (!assigneeId) {
      toast.error('Selecciona un vendedor')
      return
    }
    setSubmitting(true)
    try {
      const assignee = team.find(v => v.id === Number(assigneeId))
      await createTask({
        title: trimmedTitle,
        description: description.trim(),
        assignee_id: Number(assigneeId),
        assignee_name: assignee?.name || '',
        priority,
        due_date: dueDate || null,
      })
      toast.success('Tarea creada')
      setShowForm(false)
      setTitle(''); setDescription(''); setAssigneeId(''); setPriority('medium'); setDueDate('')
      await loadData()
    } catch (e) {
      toast.error(e.message || 'Error al crear tarea')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleComplete(task) {
    if (!confirm(`¿Marcar como completada: "${task.title}"?`)) return
    try {
      await completeTask(task.id, '')
      toast.success('Tarea completada')
      await loadData()
    } catch (e) { toast.error('Error al completar') }
  }

  async function handleCancel(task) {
    const reason = prompt('Motivo de cancelación:')
    if (!reason) return
    try {
      await cancelTask(task.id, reason)
      toast.success('Tarea cancelada')
      await loadData()
    } catch (e) { toast.error('Error al cancelar') }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text, fontSize: 13, outline: 'none',
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
      `}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/equipo')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft, flex: 1 }}>Tareas del equipo</span>
        </div>

        {/* Stub banner */}
        {isStubMode() && (
          <div style={{ marginBottom: 14 }}>
            <AuthBanner
              level="info"
              title="Módulo en modo temporal"
              reason="Las tareas se almacenan en este dispositivo mientras se despliega el backend."
              details="No se sincronizan entre equipos ni aparecen en reportes. Pronto se migrarán automáticamente."
            />
          </div>
        )}

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14,
        }}>
          <StatCard label="Pendientes" value={stats.pending} color="#f59e0b" typo={typo} />
          <StatCard label="En curso" value={stats.in_progress} color="#2B8FE0" typo={typo} />
          <StatCard label="Completadas" value={stats.done} color="#22c55e" typo={typo} />
        </div>

        {/* Filter + crear */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select
            value={filterState}
            onChange={e => setFilterState(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          >
            <option value="all">Todas</option>
            <option value="pending">Pendientes</option>
            <option value="in_progress">En curso</option>
            <option value="done">Completadas</option>
            <option value="cancelled">Canceladas</option>
          </select>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              padding: '0 18px', borderRadius: TOKENS.radius.md,
              background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
              color: 'white', fontSize: 13, fontWeight: 700,
            }}
          >
            {showForm ? 'Cancelar' : '+ Nueva'}
          </button>
        </div>

        {/* Form crear */}
        {showForm && (
          <div style={{
            padding: 14, borderRadius: TOKENS.radius.md, marginBottom: 14,
            background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <input
              placeholder="Título de la tarea"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={inputStyle}
              maxLength={120}
            />
            <textarea
              placeholder="Descripción (opcional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              maxLength={500}
            />
            <select
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Asignar a…</option>
              {team.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
                <option value="low">Prioridad baja</option>
                <option value="medium">Prioridad media</option>
                <option value="high">Prioridad alta</option>
              </select>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={submitting || !title.trim() || !assigneeId}
              style={{
                padding: '12px', borderRadius: TOKENS.radius.md,
                background: (title.trim() && assigneeId)
                  ? `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`
                  : TOKENS.colors.surface,
                color: 'white', fontSize: 14, fontWeight: 700,
                opacity: (submitting || !title.trim() || !assigneeId) ? 0.5 : 1,
                cursor: (submitting || !title.trim() || !assigneeId) ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <Loader label="Cargando tareas…" />
        ) : error ? (
          <ErrorState message={error} onRetry={loadData} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="✓"
            title="Sin tareas"
            subtitle={filterState === 'all' ? 'Crea una nueva tarea para tu equipo' : 'No hay tareas en este estado'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                typo={typo}
                onComplete={() => handleComplete(task)}
                onCancel={() => handleCancel(task)}
              />
            ))}
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

function StatCard({ label, value, color, typo }) {
  return (
    <div style={{
      padding: 12, borderRadius: TOKENS.radius.md,
      background: `${color}12`, border: `1px solid ${color}30`,
      textAlign: 'center',
    }}>
      <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{label}</p>
    </div>
  )
}

function TaskCard({ task, typo, onComplete, onCancel }) {
  const state = TASK_STATES[task.state] || TASK_STATES.pending
  const prio = TASK_PRIORITIES[task.priority] || TASK_PRIORITIES.medium
  const isOpen = task.state === 'pending' || task.state === 'in_progress'

  return (
    <div style={{
      padding: 12, borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          padding: '2px 8px', borderRadius: TOKENS.radius.pill,
          fontSize: 10, fontWeight: 700,
          background: `${state.color}20`, color: state.color,
        }}>{state.label}</span>
        <span style={{
          padding: '2px 8px', borderRadius: TOKENS.radius.pill,
          fontSize: 10, fontWeight: 700,
          background: `${prio.color}20`, color: prio.color,
        }}>{prio.label}</span>
        {task.due_date && (
          <span style={{ fontSize: 10, color: TOKENS.colors.textMuted }}>
            📅 {task.due_date}
          </span>
        )}
      </div>
      <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>
        {task.title}
      </p>
      {task.description && (
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
          {task.description}
        </p>
      )}
      <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '6px 0 0' }}>
        {task.assignee_name || `Vendedor #${task.assignee_id}`}
      </p>
      {isOpen && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button
            onClick={onComplete}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: TOKENS.radius.sm,
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)',
              color: '#22c55e', fontSize: 12, fontWeight: 600,
            }}
          >
            ✓ Completar
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 12px', borderRadius: TOKENS.radius.sm,
              background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.textMuted, fontSize: 12, fontWeight: 600,
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
