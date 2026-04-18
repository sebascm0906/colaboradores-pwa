// ─── Toast — feedback visual consistente en toda la PWA ─────────────────────
// Uso:
//   import { ToastProvider, useToast } from '../../components/Toast'
//
//   // En App.jsx (o raíz del módulo): <ToastProvider>...</ToastProvider>
//
//   // En pantallas:
//   const toast = useToast()
//   toast.success('Guardado correctamente')
//   toast.error('Error al guardar')
//   toast.warning('Revisa los campos')
//   toast.info('Procesando...')
//
// Auto-dismiss: 3s default (configurable via toast.show({ message, type, duration }))

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { TOKENS } from '../tokens'

const ToastContext = createContext(null)

const TYPE_COLORS = {
  success: { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)',  text: '#4ade80', icon: '✓' },
  error:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  text: '#f87171', icon: '✕' },
  warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#fbbf24', icon: '⚠' },
  info:    { bg: 'rgba(43,143,224,0.12)', border: 'rgba(43,143,224,0.35)', text: '#60a5fa', icon: 'ℹ' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const show = useCallback((options) => {
    const id = ++idRef.current
    const toast = {
      id,
      message: options.message || '',
      type: options.type || 'info',
      duration: options.duration ?? 3000,
    }
    setToasts(prev => [...prev, toast])
    if (toast.duration > 0) {
      setTimeout(() => dismiss(id), toast.duration)
    }
    return id
  }, [dismiss])

  const api = {
    show,
    dismiss,
    success: (message, opts) => show({ message, type: 'success', ...opts }),
    error:   (message, opts) => show({ message, type: 'error', ...opts }),
    warning: (message, opts) => show({ message, type: 'warning', ...opts }),
    info:    (message, opts) => show({ message, type: 'info', ...opts }),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notificaciones"
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top) + 12px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          maxWidth: 'calc(100vw - 32px)',
          width: 400,
        }}
      >
        {toasts.map(t => {
          const c = TYPE_COLORS[t.type] || TYPE_COLORS.info
          return (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              style={{
                pointerEvents: 'auto',
                cursor: 'pointer',
                padding: '12px 16px',
                borderRadius: TOKENS.radius.md,
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: c.text,
                fontSize: 14,
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
                animation: 'toastSlideIn 0.25s ease-out',
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{c.icon}</span>
              <span style={{ flex: 1 }}>{t.message}</span>
              <span style={{ opacity: 0.5, fontSize: 12, flexShrink: 0 }}>×</span>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback no-op para pantallas que aún no estén envueltas en ToastProvider.
    return {
      show: () => {},
      dismiss: () => {},
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
    }
  }
  return ctx
}
