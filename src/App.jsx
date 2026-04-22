import { lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'
import { ToastProvider } from './components/Toast'
import { normalizeSessionRoleContext } from './lib/roleContext'
import { api } from './lib/api'
import { getOperatorCloseState } from './modules/shared/operatorTurnCloseStore'
import { getModuleById } from './modules/registry'
import { resolveModuleContextRole } from './lib/roleContext'

// ─── Pantallas base ──────────────────────────────────────────────────────────
import ScreenLogin   from './screens/ScreenLogin'
import ScreenHome    from './screens/ScreenHome'
import ScreenKPIs    from './screens/ScreenKPIs'
import ScreenSurveys from './screens/ScreenSurveys'
import ScreenBadges  from './screens/ScreenBadges'
import ScreenProfile from './screens/ScreenProfile'

// ─── Módulos operativos (lazy — solo descarga si el rol lo necesita) ─────────
const ScreenModuloPendiente = lazy(() => import('./screens/ScreenModuloPendiente'))
// Producción
const ScreenMiTurno         = lazy(() => import('./modules/produccion/ScreenMiTurno'))
const ScreenChecklist       = lazy(() => import('./modules/produccion/ScreenChecklist'))
const ScreenCiclo           = lazy(() => import('./modules/produccion/ScreenCiclo'))
const ScreenEmpaque         = lazy(() => import('./modules/produccion/ScreenEmpaque'))
const ScreenCorte           = lazy(() => import('./modules/produccion/ScreenCorte'))
const ScreenTransformacion  = lazy(() => import('./modules/produccion/ScreenTransformacion'))
const ScreenTanqueLista     = lazy(() => import('./modules/produccion/ScreenTanqueLista'))
const ScreenTanque          = lazy(() => import('./modules/produccion/ScreenTanque'))
// Producción V2 — Rolito
const ScreenIncidenciaRolito = lazy(() => import('./modules/produccion/ScreenIncidenciaRolito'))
const ScreenCierreRolito     = lazy(() => import('./modules/produccion/ScreenCierreRolito'))
const ScreenHandoverTurno    = lazy(() => import('./modules/produccion/ScreenHandoverTurno'))
const ScreenTurnoEntregado   = lazy(() => import('./modules/produccion/ScreenTurnoEntregado'))
const ScreenReconciliacionPT = lazy(() => import('./modules/produccion/ScreenReconciliacionPT'))
// Almacén PT V2
const ScreenAlmacenPT       = lazy(() => import('./modules/almacen-pt/ScreenAlmacenPT'))
const ScreenRecepcion       = lazy(() => import('./modules/almacen-pt/ScreenRecepcion'))
const ScreenInventarioPT    = lazy(() => import('./modules/almacen-pt/ScreenInventarioPT'))
const ScreenTraspasoPT      = lazy(() => import('./modules/almacen-pt/ScreenTraspasoPT'))
const ScreenHandoverPT      = lazy(() => import('./modules/almacen-pt/ScreenHandoverPT'))
const ScreenMermaPT         = lazy(() => import('./modules/almacen-pt/ScreenMermaPT'))
const ScreenTransformacionPT = lazy(() => import('./modules/almacen-pt/ScreenTransformacionPT'))
const ScreenMaterialesIssue    = lazy(() => import('./modules/almacen-pt/ScreenMaterialesIssue'))
const ScreenMaterialesReport   = lazy(() => import('./modules/almacen-pt/ScreenMaterialesReport'))
const ScreenMaterialesReconcile = lazy(() => import('./modules/almacen-pt/ScreenMaterialesReconcile'))
const ScreenMaterialesCrearIssue = lazy(() => import('./modules/almacen-pt/ScreenMaterialesCrearIssue'))
// Supervisión
const ScreenSupervision     = lazy(() => import('./modules/supervision/ScreenSupervision'))
const ScreenParos           = lazy(() => import('./modules/supervision/ScreenParos'))
const ScreenMerma           = lazy(() => import('./modules/supervision/ScreenMerma'))
const ScreenEnergia         = lazy(() => import('./modules/supervision/ScreenEnergia'))
const ScreenMantenimiento   = lazy(() => import('./modules/supervision/ScreenMantenimiento'))
const ScreenControlTurno    = lazy(() => import('./modules/supervision/ScreenControlTurno'))
// Admin Sucursal
const ScreenAdminPanel      = lazy(() => import('./modules/admin/ScreenAdminPanel'))
const ScreenPOS             = lazy(() => import('./modules/admin/ScreenPOS'))
const ScreenTicket          = lazy(() => import('./modules/admin/ScreenTicket'))
const ScreenGastos          = lazy(() => import('./modules/admin/ScreenGastos'))
const ScreenGastosHistorial = lazy(() => import('./modules/admin/ScreenGastosHistorial'))
const ScreenGastosAprobar   = lazy(() => import('./modules/admin/ScreenGastosAprobar'))
const ScreenRequisiciones   = lazy(() => import('./modules/admin/ScreenRequisiciones'))
const ScreenLiquidaciones   = lazy(() => import('./modules/admin/ScreenLiquidaciones'))
const ScreenMateriaPrima    = lazy(() => import('./modules/admin/ScreenMateriaPrima'))
const ScreenCierreCaja      = lazy(() => import('./modules/admin/ScreenCierreCaja'))
const ScreenMaterialesValidate = lazy(() => import('./modules/admin/ScreenMaterialesValidate'))
const ScreenMaterialesResolverRejected = lazy(() => import('./modules/admin/ScreenMaterialesResolverRejected'))
// Entregas V2 (V1 eliminado 2026-04-17)
const ScreenHubDia          = lazy(() => import('./modules/entregas/ScreenHubDia'))
const ScreenRecibirPT       = lazy(() => import('./modules/entregas/ScreenRecibirPT'))
const ScreenCargaUnidades   = lazy(() => import('./modules/entregas/ScreenCargaUnidades'))
const ScreenOperacionDia    = lazy(() => import('./modules/entregas/ScreenOperacionDia'))
const ScreenDevolucionesV2  = lazy(() => import('./modules/entregas/ScreenDevolucionesV2'))
const ScreenMermaEntregas   = lazy(() => import('./modules/entregas/ScreenMerma'))
const ScreenCierreTurno     = lazy(() => import('./modules/entregas/ScreenCierreTurno'))
const ScreenTransformacionEntregas = lazy(() => import('./modules/entregas/ScreenTransformacionEntregas'))
// Ruta V2 — V1 eliminado 2026-04-17
const ScreenMiRutaV2        = lazy(() => import('./modules/ruta/ScreenMiRutaV2'))
const ScreenChecklistUnidad = lazy(() => import('./modules/ruta/ScreenChecklistUnidad'))
const ScreenAceptarCarga    = lazy(() => import('./modules/ruta/ScreenAceptarCarga'))
const ScreenIncidencias     = lazy(() => import('./modules/ruta/ScreenIncidencias'))
const ScreenKPIsRuta        = lazy(() => import('./modules/ruta/ScreenKPIsRuta'))
const ScreenConciliacion    = lazy(() => import('./modules/ruta/ScreenConciliacion'))
const ScreenControlRuta     = lazy(() => import('./modules/ruta/ScreenControlRuta'))
const ScreenInventarioRuta  = lazy(() => import('./modules/ruta/ScreenInventarioRuta'))
const ScreenCorteRuta       = lazy(() => import('./modules/ruta/ScreenCorteRuta'))
const ScreenLiquidacion     = lazy(() => import('./modules/ruta/ScreenLiquidacion'))
const ScreenCierreRuta      = lazy(() => import('./modules/ruta/ScreenCierreRuta'))
// Supervisor Ventas V2 — V1 (ScreenSupervisorVentas, ScreenVendedores) eliminado 2026-04-17
const ScreenDashboardVentas  = lazy(() => import('./modules/supervisor-ventas/ScreenDashboardVentas'))
const ScreenPronostico       = lazy(() => import('./modules/supervisor-ventas/ScreenPronostico'))
const ScreenMetasVendedores  = lazy(() => import('./modules/supervisor-ventas/ScreenMetasVendedores'))
const ScreenTareasSupervisor     = lazy(() => import('./modules/supervisor-ventas/ScreenTareasSupervisor'))
const ScreenNotasCliente         = lazy(() => import('./modules/supervisor-ventas/ScreenNotasCliente'))
const ScreenClientesRecuperacion = lazy(() => import('./modules/supervisor-ventas/ScreenClientesRecuperacion'))
const ScreenControlComercial    = lazy(() => import('./modules/supervisor-ventas/ScreenControlComercial'))
const ScreenDetalleVendedor    = lazy(() => import('./modules/supervisor-ventas/ScreenDetalleVendedor'))
const ScreenClientesSinVisitar = lazy(() => import('./modules/supervisor-ventas/ScreenClientesSinVisitar'))
const ScreenScoreSemanal       = lazy(() => import('./modules/supervisor-ventas/ScreenScoreSemanal'))
const ScreenCierreOperativo    = lazy(() => import('./modules/supervisor-ventas/ScreenCierreOperativo'))
// Gerente
const ScreenGerente          = lazy(() => import('./modules/gerente/ScreenGerente'))
const ScreenDashboardGerente = lazy(() => import('./modules/gerente/ScreenDashboardGerente'))
const ScreenAlertasGerente   = lazy(() => import('./modules/gerente/ScreenAlertasGerente'))
const ScreenForecastUnlock   = lazy(() => import('./modules/gerente/ScreenForecastUnlock'))
const ScreenGastosGerente    = lazy(() => import('./modules/gerente/ScreenGastos'))

// ─── Contexto de sesión ──────────────────────────────────────────────────────
export const SessionContext = createContext(null)
export function useSession() { return useContext(SessionContext) }

function getStoredSession() {
  try {
    const raw = localStorage.getItem('gf_session')
    if (!raw) return null
    const s = JSON.parse(raw)
    if (s?.exp && Date.now() / 1000 > s.exp) {
      localStorage.removeItem('gf_session')
      return null
    }
    return normalizeSessionRoleContext(s)
  } catch {
    return null
  }
}

function PrivateRoute({ children }) {
  const { session } = useSession()
  if (!session) return <Navigate to="/login" replace />
  return children
}

function ProductionOperatorRoute({ children, allowDelivered = false }) {
  const { session } = useSession()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [blockedState, setBlockedState] = useState(null)

  useEffect(() => {
    let active = true

    async function validate() {
      if (!session) {
        if (active) {
          setBlockedState(null)
          setLoading(false)
        }
        return
      }

      const productionRole = resolveModuleContextRole(
        session,
        getModuleById('registro_produccion'),
        location.state?.selected_role,
      ) || String(session?.role || '').trim()

      const normalizedRole = String(productionRole || '').trim().toLowerCase()
      if (normalizedRole !== 'operador_barra' && normalizedRole !== 'operador_rolito') {
        if (active) {
          setBlockedState(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      try {
        const shift = await api('GET', '/pwa-prod/my-shift')
        if (!active) return
        if (!shift?.id) {
          setBlockedState(null)
          setLoading(false)
          return
        }

        const closeState = getOperatorCloseState(shift.id, normalizedRole, shift)
        if (closeState?.closed) {
          setBlockedState({ shift, role: normalizedRole, closeState })
        } else {
          setBlockedState(null)
        }
      } catch {
        if (!active) return
        setBlockedState(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    validate()
    return () => { active = false }
  }, [session, location.state?.selected_role, location.pathname])

  if (!session) return <Navigate to="/login" replace />
  if (loading) return <PageLoader />
  if (blockedState?.closeState?.closed && !allowDelivered) {
    return <Navigate to="/produccion/turno-entregado" replace state={blockedState} />
  }
  return children
}

function PageLoader() {
  return (
    <div style={{
      minHeight: '100dvh', background: '#030811',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 32, height: 32,
        border: '2px solid rgba(255,255,255,0.12)',
        borderTop: '2px solid #2B8FE0',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}

// ─── Error Boundary — evita pantallas blancas por crash de módulos ────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    // Expose last crash for debugging. Safe in prod (no PII).
    try {
      window.__gfLastError = {
        name: error?.name, message: error?.message, stack: error?.stack,
        componentStack: info?.componentStack,
      }
    } catch { /* no-op */ }
  }
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || ''
      return (
        <div style={{
          minHeight: '100dvh', background: '#030811',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '24px', gap: 16, fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
          }}>⚠️</div>
          <p style={{ color: 'rgba(255,255,255,0.82)', fontSize: 16, fontWeight: 600, margin: 0 }}>
            Algo salió mal
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0, textAlign: 'center', maxWidth: 420 }}>
            Ocurrió un error al cargar esta pantalla. Intenta de nuevo.
          </p>
          {msg && (
            <p style={{
              color: 'rgba(239,68,68,0.7)', fontSize: 11, margin: 0,
              textAlign: 'center', maxWidth: 420, fontFamily: 'monospace',
            }}>
              {msg}
            </p>
          )}
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/'; }}
            style={{
              border: 'none', cursor: 'pointer', padding: '12px 28px',
              borderRadius: 999, background: 'linear-gradient(90deg,#15499B,#2B8FE0)',
              color: 'white', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            Volver al inicio
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── App principal ────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(getStoredSession)

  useEffect(() => {
    if (session) {
      localStorage.setItem('gf_session', JSON.stringify(session))
    } else {
      localStorage.removeItem('gf_session')
    }
  }, [session])

  // Global listener: any api.js that detects expired/missing token fires this
  useEffect(() => {
    function onSessionExpired() { setSession(null) }
    window.addEventListener('gf:session-expired', onSessionExpired)
    return () => window.removeEventListener('gf:session-expired', onSessionExpired)
  }, [])

  function login(sessionData) { setSession(normalizeSessionRoleContext(sessionData)) }
  function logout()           { setSession(null) }
  function updateSession(patch) {
    setSession(prev => (prev ? normalizeSessionRoleContext({ ...prev, ...patch }) : prev))
  }

  return (
    <SessionContext.Provider value={{ session, login, logout, updateSession }}>
      <ToastProvider>
      <BrowserRouter>
        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Auth */}
            <Route path="/login" element={session ? <Navigate to="/" replace /> : <ScreenLogin />} />

            {/* Generales */}
            <Route path="/" element={<PrivateRoute><ScreenHome /></PrivateRoute>} />
            <Route path="/kpis" element={<PrivateRoute><ScreenKPIs /></PrivateRoute>} />
            <Route path="/surveys" element={<PrivateRoute><ScreenSurveys /></PrivateRoute>} />
            <Route path="/badges" element={<PrivateRoute><ScreenBadges /></PrivateRoute>} />
            <Route path="/profile" element={<PrivateRoute><ScreenProfile /></PrivateRoute>} />

            {/* ── Producción — Operadores ─────────────────────────────────── */}
            <Route path="/produccion" element={<ProductionOperatorRoute><ScreenMiTurno /></ProductionOperatorRoute>} />
            <Route path="/produccion/checklist" element={<ProductionOperatorRoute><ScreenChecklist /></ProductionOperatorRoute>} />
            <Route path="/produccion/ciclo" element={<ProductionOperatorRoute><ScreenCiclo /></ProductionOperatorRoute>} />
            <Route path="/produccion/empaque" element={<ProductionOperatorRoute><ScreenEmpaque /></ProductionOperatorRoute>} />
            <Route path="/produccion/corte" element={<ProductionOperatorRoute><ScreenCorte /></ProductionOperatorRoute>} />
            <Route path="/produccion/transformacion" element={<ProductionOperatorRoute><ScreenTransformacion /></ProductionOperatorRoute>} />
            <Route path="/produccion/tanque" element={<ProductionOperatorRoute><ScreenTanqueLista /></ProductionOperatorRoute>} />
            <Route path="/produccion/tanque/:machineId" element={<ProductionOperatorRoute><ScreenTanque /></ProductionOperatorRoute>} />
            <Route path="/produccion/incidencia" element={<ProductionOperatorRoute><ScreenIncidenciaRolito /></ProductionOperatorRoute>} />
            <Route path="/produccion/cierre" element={<ProductionOperatorRoute><ScreenCierreRolito /></ProductionOperatorRoute>} />
            <Route path="/produccion/handover" element={<ProductionOperatorRoute><ScreenHandoverTurno /></ProductionOperatorRoute>} />
            <Route path="/produccion/turno-entregado" element={<ProductionOperatorRoute allowDelivered><ScreenTurnoEntregado /></ProductionOperatorRoute>} />
            <Route path="/produccion/reconciliacion" element={<ProductionOperatorRoute><ScreenReconciliacionPT /></ProductionOperatorRoute>} />

            {/* ── Almacén PT V2 ────────────────────────────────────────── */}
            <Route path="/almacen-pt" element={<PrivateRoute><ScreenAlmacenPT /></PrivateRoute>} />
            <Route path="/almacen-pt/recepcion" element={<PrivateRoute><ScreenRecepcion /></PrivateRoute>} />
            <Route path="/almacen-pt/inventario" element={<PrivateRoute><ScreenInventarioPT /></PrivateRoute>} />
            <Route path="/almacen-pt/transformacion" element={<PrivateRoute><ScreenTransformacionPT /></PrivateRoute>} />
            <Route path="/almacen-pt/traspaso" element={<PrivateRoute><ScreenTraspasoPT /></PrivateRoute>} />
            <Route path="/almacen-pt/handover" element={<PrivateRoute><ScreenHandoverPT /></PrivateRoute>} />
            <Route path="/almacen-pt/merma" element={<PrivateRoute><ScreenMermaPT /></PrivateRoute>} />
            <Route path="/almacen-pt/materiales" element={<PrivateRoute><ScreenMaterialesIssue /></PrivateRoute>} />
            <Route path="/almacen-pt/materiales/crear" element={<PrivateRoute><ScreenMaterialesCrearIssue /></PrivateRoute>} />
            <Route path="/almacen-pt/materiales/report/:issueId" element={<PrivateRoute><ScreenMaterialesReport /></PrivateRoute>} />
            <Route path="/almacen-pt/materiales/reconciliar" element={<PrivateRoute><ScreenMaterialesReconcile /></PrivateRoute>} />

            {/* ── Supervisión Producción ───────────────────────────────── */}
            <Route path="/supervision" element={<PrivateRoute><ScreenSupervision /></PrivateRoute>} />
            <Route path="/supervision/paros" element={<PrivateRoute><ScreenParos /></PrivateRoute>} />
            <Route path="/supervision/merma" element={<PrivateRoute><ScreenMerma /></PrivateRoute>} />
            <Route path="/supervision/energia" element={<PrivateRoute><ScreenEnergia /></PrivateRoute>} />
            <Route path="/supervision/mantenimiento" element={<PrivateRoute><ScreenMantenimiento /></PrivateRoute>} />
            <Route path="/supervision/turno" element={<PrivateRoute><ScreenControlTurno /></PrivateRoute>} />

            {/* ── Admin Sucursal (POS + Gastos + Requisiciones) ────────── */}
            <Route path="/admin" element={<PrivateRoute><ScreenAdminPanel /></PrivateRoute>} />
            <Route path="/admin/pos" element={<PrivateRoute><ScreenPOS /></PrivateRoute>} />
            <Route path="/admin/ticket/:orderId" element={<PrivateRoute><ScreenTicket /></PrivateRoute>} />
            <Route path="/admin/gastos" element={<PrivateRoute><ScreenGastos /></PrivateRoute>} />
            <Route path="/admin/gastos-historial" element={<PrivateRoute><ScreenGastosHistorial /></PrivateRoute>} />
            <Route path="/admin/gastos/aprobar" element={<PrivateRoute><ScreenGastosAprobar /></PrivateRoute>} />
            <Route path="/admin/requisiciones" element={<PrivateRoute><ScreenRequisiciones /></PrivateRoute>} />
            <Route path="/admin/liquidaciones" element={<PrivateRoute><ScreenLiquidaciones /></PrivateRoute>} />
            <Route path="/admin/materia-prima" element={<PrivateRoute><ScreenMateriaPrima /></PrivateRoute>} />
            <Route path="/admin/cierre" element={<PrivateRoute><ScreenCierreCaja /></PrivateRoute>} />
            <Route path="/admin/materiales/validar" element={<PrivateRoute><ScreenMaterialesValidate /></PrivateRoute>} />
            <Route path="/admin/materiales/resolver-rechazo" element={<PrivateRoute><ScreenMaterialesResolverRejected /></PrivateRoute>} />

            {/* ── Almacenista Entregas ─────────────────────────────────── */}
            {/* Entregas V2 — flujo guiado */}
            <Route path="/entregas" element={<PrivateRoute><ScreenHubDia /></PrivateRoute>} />
            <Route path="/entregas/recibir-pt" element={<PrivateRoute><ScreenRecibirPT /></PrivateRoute>} />
            <Route path="/entregas/transformacion" element={<PrivateRoute><ScreenTransformacionEntregas /></PrivateRoute>} />
            <Route path="/entregas/carga" element={<PrivateRoute><ScreenCargaUnidades /></PrivateRoute>} />
            <Route path="/entregas/operacion" element={<PrivateRoute><ScreenOperacionDia /></PrivateRoute>} />
            <Route path="/entregas/devoluciones" element={<PrivateRoute><ScreenDevolucionesV2 /></PrivateRoute>} />
            <Route path="/entregas/merma" element={<PrivateRoute><ScreenMermaEntregas /></PrivateRoute>} />
            <Route path="/entregas/cierre-turno" element={<PrivateRoute><ScreenCierreTurno /></PrivateRoute>} />
            {/* Legacy route aliases — eliminado V1 2026-04-17 */}
            <Route path="/entregas/aceptar-turno" element={<Navigate to="/entregas/cierre-turno" replace />} />
            <Route path="/entregas/validar" element={<Navigate to="/entregas/operacion" replace />} />
            <Route path="/entregas/inventario" element={<Navigate to="/entregas/operacion" replace />} />

            {/* ── Jefe de Ruta ─────────────────────────────────────────── */}
            <Route path="/ruta" element={<PrivateRoute><ScreenMiRutaV2 /></PrivateRoute>} />
            <Route path="/ruta/checklist" element={<PrivateRoute><ScreenChecklistUnidad /></PrivateRoute>} />
            <Route path="/ruta/carga" element={<PrivateRoute><ScreenAceptarCarga /></PrivateRoute>} />
            <Route path="/ruta/incidencias" element={<PrivateRoute><ScreenIncidencias /></PrivateRoute>} />
            <Route path="/ruta/kpis" element={<PrivateRoute><ScreenKPIsRuta /></PrivateRoute>} />
            <Route path="/ruta/conciliacion" element={<PrivateRoute><ScreenConciliacion /></PrivateRoute>} />
            <Route path="/ruta/control" element={<PrivateRoute><ScreenControlRuta /></PrivateRoute>} />
            <Route path="/ruta/inventario" element={<PrivateRoute><ScreenInventarioRuta /></PrivateRoute>} />
            <Route path="/ruta/corte" element={<PrivateRoute><ScreenCorteRuta /></PrivateRoute>} />
            <Route path="/ruta/liquidacion" element={<PrivateRoute><ScreenLiquidacion /></PrivateRoute>} />
            <Route path="/ruta/cierre" element={<PrivateRoute><ScreenCierreRuta /></PrivateRoute>} />

            {/* ── Supervisor de Ventas ─────────────────────────────────── */}
            {/* Supervisor Ventas V2 — Centro de Control Comercial */}
            <Route path="/equipo" element={<PrivateRoute><ScreenControlComercial /></PrivateRoute>} />
            <Route path="/equipo/vendedor/:vendedorId" element={<PrivateRoute><ScreenDetalleVendedor /></PrivateRoute>} />
            <Route path="/equipo/sin-visitar" element={<PrivateRoute><ScreenClientesSinVisitar /></PrivateRoute>} />
            <Route path="/equipo/score-semanal" element={<PrivateRoute><ScreenScoreSemanal /></PrivateRoute>} />
            <Route path="/equipo/cierre" element={<PrivateRoute><ScreenCierreOperativo /></PrivateRoute>} />
            <Route path="/equipo/dashboard" element={<PrivateRoute><ScreenDashboardVentas /></PrivateRoute>} />
            <Route path="/equipo/pronostico" element={<PrivateRoute><ScreenPronostico /></PrivateRoute>} />
            <Route path="/equipo/metas" element={<PrivateRoute><ScreenMetasVendedores /></PrivateRoute>} />
            <Route path="/equipo/tareas" element={<PrivateRoute><ScreenTareasSupervisor /></PrivateRoute>} />
            <Route path="/equipo/notas" element={<PrivateRoute><ScreenNotasCliente /></PrivateRoute>} />
            <Route path="/equipo/recuperacion" element={<PrivateRoute><ScreenClientesRecuperacion /></PrivateRoute>} />
            {/* V1 legacy routes */}
            <Route path="/equipo/vendedores" element={<Navigate to="/equipo" replace />} />
            <Route path="/equipo/control" element={<Navigate to="/equipo" replace />} />

            {/* ── Gerente de Sucursal ──────────────────────────────────── */}
            <Route path="/gerente" element={<PrivateRoute><ScreenGerente /></PrivateRoute>} />
            <Route path="/gerente/dashboard" element={<PrivateRoute><ScreenDashboardGerente /></PrivateRoute>} />
            <Route path="/gerente/alertas" element={<PrivateRoute><ScreenAlertasGerente /></PrivateRoute>} />
            <Route path="/gerente/gastos" element={<PrivateRoute><ScreenGastosGerente /></PrivateRoute>} />
            <Route path="/gerente/forecast" element={<PrivateRoute><ScreenForecastUnlock /></PrivateRoute>} />

            {/* ── Módulos pendientes (placeholder genérico) ───────────────── */}
            {[
              '/torres',
            ].map(path => (
              <Route key={path} path={path} element={
                <PrivateRoute><ScreenModuloPendiente /></PrivateRoute>
              } />
            ))}

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
      </ToastProvider>
    </SessionContext.Provider>
  )
}
