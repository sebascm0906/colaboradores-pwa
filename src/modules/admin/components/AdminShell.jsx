// ─── AdminShell — layout desktop-first del rol Auxiliar Administrativo ──────
// Estructura (≥1024px):
//   ┌──────────────────────────────────────────────────┐
//   │ Top bar: back | título | CompanySelector | user  │
//   ├──────────┬──────────────────────┬────────────────┤
//   │ Sidenav  │        Main          │  ActivityFeed  │
//   │ (módulos)│      (children)      │   (lateral)    │
//   └──────────┴──────────────────────┴────────────────┘
// En <1024px cae a columna única centrada (fallback mobile).
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../../tokens'
import { useAdmin } from '../AdminContext'
import { useSession } from '../../../App'
import { getEffectiveJobKeys } from '../../../lib/roleContext'
import CompanySelector from './CompanySelector'
import ActivityFeed from './ActivityFeed'

// Navegación lateral. Cada ítem declara qué roles pueden verlo.
// Mapping alineado con el backend (guía de pruebas 2026-04-18):
//   auxiliar_admin    → captura del día: caja, POS, gastos, requisiciones, cierre
//   gerente_sucursal  → además: aprobar gastos, liquidaciones, materia prima
//   direccion_general → acceso completo (supervisa todo)
//
// Regla: si un rol no está en `roles`, el ítem se oculta de la UI.
// Backend valida permisos en DB — este filtrado es solo UX.
export const NAV_ITEMS = [
  { id: 'hub',          label: 'Caja del día',     route: '/admin',                    roles: ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'], status: 'live' },
  { id: 'pos',          label: 'Venta mostrador',  route: '/admin/pos',                roles: ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'], status: 'live' },
  { id: 'gastos',       label: 'Gastos',           route: '/admin/gastos',             roles: ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'], status: 'live' },
  { id: 'gastos-hist',  label: 'Historial gastos', route: '/admin/gastos-historial',   roles: ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'], status: 'live' },
  // Aprobar gastos: SOLO gerente/dirección (auxiliar_admin NO aprueba — ver guía §2d)
  { id: 'gastos-aprobar', label: 'Aprobar gastos', route: '/admin/gastos/aprobar',     roles: ['gerente_sucursal', 'direccion_general'], status: 'live' },
  { id: 'requisiciones',label: 'Requisiciones',    route: '/admin/requisiciones',      roles: ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'], status: 'live' },
  { id: 'cierre',       label: 'Cierre del día',   route: '/admin/cierre',             roles: ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'], status: 'live' },
  // ── Restringidos a gerente / dirección ──────────────────────────────────
  { id: 'liquidaciones',label: 'Liquidaciones',    route: '/admin/liquidaciones',      roles: ['gerente_sucursal', 'direccion_general'], status: 'live' },
  { id: 'mp',           label: 'Materia prima',    route: '/admin/materia-prima',      roles: ['gerente_sucursal', 'direccion_general'], status: 'live' },
  { id: 'traspaso-mp',  label: 'Traspaso MP',      route: '/admin/traspaso-materia-prima', roles: ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'], status: 'live' },
  // Validar materiales: SOLO gerente/dirección. Segregación de funciones —
  // el auxiliar_admin NO aprueba movimientos de inventario (2026-04-18).
  { id: 'mat-validar',  label: 'Validar materiales', route: '/admin/materiales/validar', roles: ['gerente_sucursal', 'direccion_general'], status: 'live' },
  { id: 'bolsas-validar', label: 'Validar bolsas',  route: '/admin/bolsas/validar',     roles: ['gerente_sucursal', 'direccion_general'], status: 'live' },
]

/** Filtra NAV_ITEMS por el rol actual. Export para tests y HubV2. */
export function navItemsForRole(role) {
  if (!role) return []
  return NAV_ITEMS.filter(item => item.roles.includes(role))
}

export function navItemsForRoles(roles = []) {
  return NAV_ITEMS.filter((item) => item.roles.some((role) => roles.includes(role)))
}

export default function AdminShell({
  activeBlock = 'hub',
  title = 'Administración de sucursal',
  children,
  onBack,
  hideActivityFeed = false,
}) {
  const navigate = useNavigate()
  const { sucursal, employeeName } = useAdmin()
  const { session } = useSession()
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)
  const typo = useMemo(() => getTypo(sw), [sw])
  const isDesktop = sw >= 1024

  // Filtrar módulos según rol del usuario
  const visibleNavItems = useMemo(
    () => navItemsForRoles(getEffectiveJobKeys(session)),
    [session],
  )

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  function handleBack() {
    if (onBack) { onBack(); return }
    navigate('/')
  }

  function handleNav(item) {
    if (item.status === 'pending_backend' || !item.route) return
    navigate(item.route, item.routeState ? { state: item.routeState } : undefined)
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
        input, textarea, select { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: isDesktop ? '14px 24px' : '14px 16px',
        borderBottom: `1px solid ${TOKENS.colors.border}`,
        background: TOKENS.colors.surfaceSoft,
        position: 'sticky', top: 0, zIndex: 500,
        backdropFilter: 'blur(8px)',
      }}>
        <button onClick={handleBack} style={{
          width: 38, height: 38, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
          </svg>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, lineHeight: 1.2 }}>
            {title}
          </p>
          {sucursal && (
            <p style={{ fontSize: 11, color: TOKENS.colors.textLow, margin: 0, marginTop: 2 }}>
              {sucursal}
            </p>
          )}
        </div>

        <CompanySelector />

        {isDesktop && employeeName && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'white',
            }}>
              {employeeName.trim().slice(0, 1).toUpperCase()}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.colors.textSoft }}>
              {employeeName}
            </span>
          </div>
        )}
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {isDesktop ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: hideActivityFeed ? '220px 1fr' : '220px 1fr 320px',
          minHeight: 'calc(100dvh - 68px)',
        }}>
          {/* Sidebar izquierda */}
          <nav style={{
            padding: '20px 12px', borderRight: `1px solid ${TOKENS.colors.border}`,
            background: TOKENS.colors.surfaceSoft,
          }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
              color: TOKENS.colors.textLow, margin: '0 0 10px 10px',
            }}>
              MÓDULOS
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {visibleNavItems.map(item => {
                const active = item.id === activeBlock
                const locked = item.status === 'pending_backend'
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item)}
                    disabled={locked}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                      background: active ? `${TOKENS.colors.blue2}1f` : 'transparent',
                      border: `1px solid ${active ? TOKENS.colors.blue2 : 'transparent'}`,
                      cursor: locked ? 'not-allowed' : 'pointer',
                      opacity: locked ? 0.45 : 1,
                      textAlign: 'left', width: '100%',
                    }}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: active ? TOKENS.colors.blue3 : (locked ? TOKENS.colors.textLow : TOKENS.colors.textMuted),
                      flexShrink: 0,
                    }} />
                    <span style={{
                      flex: 1, fontSize: 13, fontWeight: 600,
                      color: active ? TOKENS.colors.text : TOKENS.colors.textSoft,
                    }}>
                      {item.label}
                    </span>
                    {locked && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                        padding: '2px 6px', borderRadius: 4,
                        background: TOKENS.colors.warningSoft,
                        color: TOKENS.colors.warning,
                      }}>
                        PRONTO
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Main */}
          <main style={{ padding: '24px 28px', overflowY: 'auto' }}>
            {children}
          </main>

          {/* Feed derecho — oculto en vistas que lo desactivan (ej: Requisiciones) */}
          {!hideActivityFeed && <ActivityFeed />}
        </div>
      ) : (
        // Mobile fallback — columna simple
        <main style={{ maxWidth: 520, margin: '0 auto', padding: '16px' }}>
          {children}
        </main>
      )}
    </div>
  )
}
