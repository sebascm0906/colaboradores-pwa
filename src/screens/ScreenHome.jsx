import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../App'
import { TOKENS, MODULE_TONES, getTypo, COMPANY_LABELS, TURNO_LABELS } from '../tokens'
import { getModulesForRole } from '../modules/registry'
import { runLogout } from '../lib/logout'

/* ============================================================================
   ICONS
============================================================================ */
const ICONS = {
  kpis: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" stroke="rgba(255,255,255,0.35)"/>
      <path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>
    </svg>
  ),
  encuestas: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="rgba(255,255,255,0.35)"/>
      <line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="16" y2="13"/>
      <path d="M9 17l1.6 1.6L15 14.2" strokeWidth="2"/>
    </svg>
  ),
  logros: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8"/><path d="M12 17v4"/>
      <path d="M8 4h8" stroke="rgba(255,255,255,0.35)"/>
      <path d="M17 4v7a5 5 0 0 1-10 0V4" stroke="rgba(255,255,255,0.45)"/>
    </svg>
  ),
  produccion: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" stroke="rgba(255,255,255,0.35)"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  ),
  supervision: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="rgba(255,255,255,0.35)"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  almacen: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="rgba(255,255,255,0.35)"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  ruta: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.35)"/>
      <polygon points="10 8 16 12 10 16 10 8"/>
    </svg>
  ),
  entregas: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" stroke="rgba(255,255,255,0.35)"/>
      <path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
  equipo: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="rgba(255,255,255,0.35)"/>
      <circle cx="9" cy="7" r="4" stroke="rgba(255,255,255,0.45)"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  admin: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="rgba(255,255,255,0.35)"/>
      <line x1="2" y1="10" x2="22" y2="10"/>
      <path d="M7 15h4"/><path d="M15 15h2" strokeWidth="2"/>
    </svg>
  ),
  torres: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="rgba(255,255,255,0.45)"/>
    </svg>
  ),
}

/* ============================================================================
   NAV BOTTOM
============================================================================ */
const NAV = [
  { id: 'home',   label: 'Inicio', path: '/',        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { id: 'kpis',   label: 'KPIs',   path: '/kpis',    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
  { id: 'surveys',label: 'Encuestas', path: '/surveys', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
  { id: 'badges', label: 'Premios', path: '/badges',  icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg> },
  { id: 'perfil', label: 'Yo',      path: '/profile', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
]

/* ============================================================================
   PARTICLES
============================================================================ */
function IceParticles() {
  const particles = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: (i * 37 + 11) % 100,
      y: (i * 53 + 7) % 100,
      size: (i % 3) + 1,
      delay: (i * 0.4) % 6,
      duration: ((i % 4) * 1.5) + 7,
      opacity: (i % 4) * 0.03 + 0.03,
    })), []
  )
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size, borderRadius: '50%',
          background: 'rgba(71,161,255,0.7)', opacity: p.opacity,
          animation: `float ${p.duration}s ${p.delay}s ease-in-out infinite alternate`,
        }} />
      ))}
    </div>
  )
}

/* ============================================================================
   FADE IN
============================================================================ */
function FadeIn({ children, delay = 0, y = 14 }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : `translateY(${y}px)`,
      transition: `opacity ${TOKENS.motion.normal}, transform ${TOKENS.motion.normal}`,
    }}>
      {children}
    </div>
  )
}

/* ============================================================================
   MODULE CARD
============================================================================ */
function ModuleCard({ module, typo, onClick }) {
  const [pressed, setPressed] = useState(false)
  const tone = MODULE_TONES[module.tone] || MODULE_TONES.steel
  const isPending = module.status === 'pending'

  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => onClick(module)}
      style={{
        position: 'relative',
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: TOKENS.radius.xl,
        boxShadow: pressed ? 'none' : `${TOKENS.shadow.md}, inset 0 1px 0 rgba(255,255,255,0.08), 0 0 16px ${tone.glow}`,
        padding: '18px 14px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 10,
        cursor: 'pointer',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: `transform ${TOKENS.motion.fast}, box-shadow ${TOKENS.motion.fast}`,
        opacity: isPending ? 0.75 : 1,
        width: '100%',
        textAlign: 'left',
      }}
    >
      {/* Badge de pendiente */}
      {isPending && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(245,158,11,0.15)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: TOKENS.radius.pill,
          padding: '2px 7px',
          fontSize: 9, fontWeight: 700,
          color: '#f59e0b', letterSpacing: '0.08em',
        }}>
          PRONTO
        </div>
      )}

      {/* Badge de notificación */}
      {module.badge > 0 && !isPending && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: TOKENS.colors.blue2,
          borderRadius: TOKENS.radius.pill,
          minWidth: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'white',
          padding: '0 5px',
        }}>
          {module.badge}
        </div>
      )}

      {/* Icono */}
      <div style={{
        width: 42, height: 42,
        borderRadius: TOKENS.radius.md,
        background: 'rgba(255,255,255,0.06)',
        border: `1px solid ${tone.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {ICONS[module.icon] || ICONS.kpis}
      </div>

      {/* Label */}
      <span style={{
        ...typo.caption,
        color: TOKENS.colors.textSoft,
        fontWeight: 600,
        lineHeight: 1.3,
        letterSpacing: '-0.01em',
      }}>
        {module.label}
      </span>
    </button>
  )
}

/* ============================================================================
   SCREEN HOME
============================================================================ */
export default function ScreenHome() {
  const { session, logout } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const isBypass = session?._bypass === true

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Módulos visibles para este rol
  const modules = useMemo(() =>
    getModulesForRole(session?.role || ''),
  [session?.role])

  const firstName = session?.name?.split(' ')[0] ?? 'Colaborador'
  const companyLabel = COMPANY_LABELS[session?.company_id] ?? session?.company ?? ''
  const sucursal = session?.sucursal ?? ''
  const turnoLabel = TURNO_LABELS[session?.turno] ?? ''

  function handleModule(mod) {
    navigate(mod.route)
  }

  function handleLogout() {
    return runLogout({
      clearSession: () => {
        localStorage.removeItem('gf_session')
        logout()
      },
      navigateToLogin: () => navigate('/login', { replace: true }),
    })
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'calc(env(safe-area-inset-bottom) + 72px)',
      position: 'relative',
      overflowX: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; }
        @keyframes float { from { transform: translateY(0) scale(1); } to { transform: translateY(-16px) scale(1.2); } }
        @keyframes spin  { to { transform: rotate(360deg); } }
      `}</style>

      <IceParticles />

      {/* Glow de fondo */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,100,255,0.10) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />

      {/* ── Banner Admin Bypass ──────────────────────────────────────── */}
      {isBypass && (
        <div style={{
          position: 'relative', zIndex: 50,
          background: 'linear-gradient(90deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))',
          borderBottom: '1px solid rgba(245,158,11,0.25)',
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13 }}>🔑</span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#f59e0b',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              Bypass: {session?.role}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={handleLogout}
              style={{
                fontSize: 11, fontWeight: 700, color: '#f59e0b',
                background: 'rgba(245,158,11,0.15)',
                border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 8, padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              Cambiar perfil
            </button>
            <button
              onClick={handleLogout}
              style={{
                fontSize: 11, fontWeight: 700, color: '#ef4444',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8, padding: '4px 10px',
                cursor: 'pointer',
              }}
            >
              Salir
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <FadeIn delay={0}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: 20, paddingBottom: 8,
          }}>
            <img src="/icons/icon-grupo-frio.svg" alt="GF" style={{ width: 32, height: 32, borderRadius: 8 }} />
            <button
              onClick={() => navigate('/profile')}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: TOKENS.colors.surface,
                border: `1px solid ${TOKENS.colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </button>
          </div>
        </FadeIn>

        {/* ── Saludo ──────────────────────────────────────────────────── */}
        <FadeIn delay={80}>
          <div style={{ paddingTop: 12, paddingBottom: 20 }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginBottom: 4, letterSpacing: '0.04em' }}>
              Bienvenido
            </p>
            <h1 style={{ ...typo.h1, color: TOKENS.colors.text, margin: 0 }}>
              {firstName}
            </h1>

            {/* Chips de contexto */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {companyLabel && (
                <Chip label={companyLabel} color={TOKENS.colors.blue2} />
              )}
              {sucursal && (
                <Chip label={sucursal} color={TOKENS.colors.blue3} />
              )}
              {turnoLabel && (
                <Chip label={turnoLabel} color={TOKENS.colors.textMuted} />
              )}
            </div>
          </div>
        </FadeIn>

        {/* ── Grid de módulos ──────────────────────────────────────────── */}
        <FadeIn delay={160}>
          <p style={{
            ...typo.overline,
            color: TOKENS.colors.textLow,
            marginBottom: 14,
            letterSpacing: '0.18em',
          }}>
            MIS MÓDULOS
          </p>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
          }}>
            {modules.map((mod, i) => (
              <FadeIn key={mod.id} delay={180 + i * 40}>
                <ModuleCard module={mod} typo={typo} onClick={handleModule} />
              </FadeIn>
            ))}
          </div>
        </FadeIn>

        {/* Espacio extra al fondo */}
        <div style={{ height: 24 }} />
      </div>

      {/* ── Nav Bottom ──────────────────────────────────────────────────── */}
      <BottomNav current="home" />
    </div>
  )
}

/* ============================================================================
   CHIP
============================================================================ */
function Chip({ label, color }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      color, background: `${color}18`,
      border: `1px solid ${color}30`,
      borderRadius: TOKENS.radius.pill,
      padding: '3px 10px',
      letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  )
}

/* ============================================================================
   BOTTOM NAV
============================================================================ */
export function BottomNav({ current }) {
  const navigate = useNavigate()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'rgba(3,8,17,0.92)',
      borderTop: `1px solid ${TOKENS.colors.border}`,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 100,
    }}>
      {NAV.map(item => {
        const active = item.id === current
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 4, padding: '10px 0',
              color: active ? TOKENS.colors.blue2 : TOKENS.colors.textLow,
              cursor: 'pointer',
              transition: `color ${TOKENS.motion.fast}`,
            }}
          >
            {item.icon}
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '0.04em' }}>
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
