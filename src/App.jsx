import { lazy, Suspense, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'

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
// Almacén PT
const ScreenAlmacenPT       = lazy(() => import('./modules/almacen-pt/ScreenAlmacenPT'))
const ScreenRecepcion       = lazy(() => import('./modules/almacen-pt/ScreenRecepcion'))
const ScreenDespacho        = lazy(() => import('./modules/almacen-pt/ScreenDespacho'))
const ScreenInventarioPT    = lazy(() => import('./modules/almacen-pt/ScreenInventarioPT'))
const ScreenHistorialPT     = lazy(() => import('./modules/almacen-pt/ScreenHistorialPT'))
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
const ScreenRequisiciones   = lazy(() => import('./modules/admin/ScreenRequisiciones'))
const ScreenCierreCaja      = lazy(() => import('./modules/admin/ScreenCierreCaja'))
// Entregas
const ScreenEntregas        = lazy(() => import('./modules/entregas/ScreenEntregas'))
const ScreenValidarTicket   = lazy(() => import('./modules/entregas/ScreenValidarTicket'))
const ScreenPreparaCarga    = lazy(() => import('./modules/entregas/ScreenPreparaCarga'))
const ScreenInventarioCedis = lazy(() => import('./modules/entregas/ScreenInventarioCedis'))
const ScreenDevoluciones    = lazy(() => import('./modules/entregas/ScreenDevoluciones'))
// Ruta
const ScreenMiRuta          = lazy(() => import('./modules/ruta/ScreenMiRuta'))
const ScreenChecklistUnidad = lazy(() => import('./modules/ruta/ScreenChecklistUnidad'))
const ScreenAceptarCarga    = lazy(() => import('./modules/ruta/ScreenAceptarCarga'))
const ScreenIncidencias     = lazy(() => import('./modules/ruta/ScreenIncidencias'))
const ScreenKPIsRuta        = lazy(() => import('./modules/ruta/ScreenKPIsRuta'))
const ScreenConciliacion    = lazy(() => import('./modules/ruta/ScreenConciliacion'))
// Supervisor Ventas
const ScreenSupervisorVentas = lazy(() => import('./modules/supervisor-ventas/ScreenSupervisorVentas'))
const ScreenDashboardVentas  = lazy(() => import('./modules/supervisor-ventas/ScreenDashboardVentas'))
const ScreenPronostico       = lazy(() => import('./modules/supervisor-ventas/ScreenPronostico'))
const ScreenVendedores       = lazy(() => import('./modules/supervisor-ventas/ScreenVendedores'))
const ScreenMetasVendedores  = lazy(() => import('./modules/supervisor-ventas/ScreenMetasVendedores'))
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
    return s
  } catch {
    return null
  }
}

function PrivateRoute({ children }) {
  const { session } = useSession()
  if (!session) return <Navigate to="/login" replace />
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
  render() {
    if (this.state.hasError) {
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
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0, textAlign: 'center', maxWidth: 300 }}>
            Ocurrió un error al cargar esta pantalla. Intenta de nuevo.
          </p>
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

  function login(sessionData) { setSession(sessionData) }
  function logout()           { setSession(null) }

  return (
    <SessionContext.Provider value={{ session, login, logout }}>
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
            <Route path="/produccion" element={<PrivateRoute><ScreenMiTurno /></PrivateRoute>} />
            <Route path="/produccion/checklist" element={<PrivateRoute><ScreenChecklist /></PrivateRoute>} />
            <Route path="/produccion/ciclo" element={<PrivateRoute><ScreenCiclo /></PrivateRoute>} />
            <Route path="/produccion/empaque" element={<PrivateRoute><ScreenEmpaque /></PrivateRoute>} />
            <Route path="/produccion/corte" element={<PrivateRoute><ScreenCorte /></PrivateRoute>} />
            <Route path="/produccion/transformacion" element={<PrivateRoute><ScreenTransformacion /></PrivateRoute>} />

            {/* ── Almacén PT ──────────────────────────────────────────── */}
            <Route path="/almacen-pt" element={<PrivateRoute><ScreenAlmacenPT /></PrivateRoute>} />
            <Route path="/almacen-pt/recepcion" element={<PrivateRoute><ScreenRecepcion /></PrivateRoute>} />
            <Route path="/almacen-pt/despacho" element={<PrivateRoute><ScreenDespacho /></PrivateRoute>} />
            <Route path="/almacen-pt/inventario" element={<PrivateRoute><ScreenInventarioPT /></PrivateRoute>} />
            <Route path="/almacen-pt/historial" element={<PrivateRoute><ScreenHistorialPT /></PrivateRoute>} />

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
            <Route path="/admin/requisiciones" element={<PrivateRoute><ScreenRequisiciones /></PrivateRoute>} />
            <Route path="/admin/cierre" element={<PrivateRoute><ScreenCierreCaja /></PrivateRoute>} />

            {/* ── Almacenista Entregas ─────────────────────────────────── */}
            <Route path="/entregas" element={<PrivateRoute><ScreenEntregas /></PrivateRoute>} />
            <Route path="/entregas/validar" element={<PrivateRoute><ScreenValidarTicket /></PrivateRoute>} />
            <Route path="/entregas/carga" element={<PrivateRoute><ScreenPreparaCarga /></PrivateRoute>} />
            <Route path="/entregas/inventario" element={<PrivateRoute><ScreenInventarioCedis /></PrivateRoute>} />
            <Route path="/entregas/devoluciones" element={<PrivateRoute><ScreenDevoluciones /></PrivateRoute>} />

            {/* ── Jefe de Ruta ─────────────────────────────────────────── */}
            <Route path="/ruta" element={<PrivateRoute><ScreenMiRuta /></PrivateRoute>} />
            <Route path="/ruta/checklist" element={<PrivateRoute><ScreenChecklistUnidad /></PrivateRoute>} />
            <Route path="/ruta/carga" element={<PrivateRoute><ScreenAceptarCarga /></PrivateRoute>} />
            <Route path="/ruta/incidencias" element={<PrivateRoute><ScreenIncidencias /></PrivateRoute>} />
            <Route path="/ruta/kpis" element={<PrivateRoute><ScreenKPIsRuta /></PrivateRoute>} />
            <Route path="/ruta/conciliacion" element={<PrivateRoute><ScreenConciliacion /></PrivateRoute>} />

            {/* ── Supervisor de Ventas ─────────────────────────────────── */}
            <Route path="/equipo" element={<PrivateRoute><ScreenSupervisorVentas /></PrivateRoute>} />
            <Route path="/equipo/dashboard" element={<PrivateRoute><ScreenDashboardVentas /></PrivateRoute>} />
            <Route path="/equipo/pronostico" element={<PrivateRoute><ScreenPronostico /></PrivateRoute>} />
            <Route path="/equipo/vendedores" element={<PrivateRoute><ScreenVendedores /></PrivateRoute>} />
            <Route path="/equipo/metas" element={<PrivateRoute><ScreenMetasVendedores /></PrivateRoute>} />

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
    </SessionContext.Provider>
  )
}
