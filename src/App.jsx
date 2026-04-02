import { lazy, Suspense } from 'react'
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
const ScreenMiTurno         = lazy(() => import('./modules/produccion/ScreenMiTurno'))
const ScreenChecklist       = lazy(() => import('./modules/produccion/ScreenChecklist'))
const ScreenCiclo           = lazy(() => import('./modules/produccion/ScreenCiclo'))
const ScreenEmpaque         = lazy(() => import('./modules/produccion/ScreenEmpaque'))
const ScreenCorte           = lazy(() => import('./modules/produccion/ScreenCorte'))
const ScreenTransformacion  = lazy(() => import('./modules/produccion/ScreenTransformacion'))
const ScreenAlmacenPT       = lazy(() => import('./modules/almacen-pt/ScreenAlmacenPT'))
const ScreenRecepcion       = lazy(() => import('./modules/almacen-pt/ScreenRecepcion'))
const ScreenDespacho        = lazy(() => import('./modules/almacen-pt/ScreenDespacho'))
const ScreenInventarioPT    = lazy(() => import('./modules/almacen-pt/ScreenInventarioPT'))
const ScreenHistorialPT     = lazy(() => import('./modules/almacen-pt/ScreenHistorialPT'))
const ScreenSupervision     = lazy(() => import('./modules/supervision/ScreenSupervision'))
const ScreenParos           = lazy(() => import('./modules/supervision/ScreenParos'))
const ScreenMerma           = lazy(() => import('./modules/supervision/ScreenMerma'))
const ScreenEnergia         = lazy(() => import('./modules/supervision/ScreenEnergia'))
const ScreenMantenimiento   = lazy(() => import('./modules/supervision/ScreenMantenimiento'))
const ScreenControlTurno    = lazy(() => import('./modules/supervision/ScreenControlTurno'))

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

  function login(sessionData) { setSession(sessionData) }
  function logout()           { setSession(null) }

  return (
    <SessionContext.Provider value={{ session, login, logout }}>
      <BrowserRouter>
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

            {/* ── Módulos pendientes (placeholder genérico) ───────────────── */}
            {[
              '/ruta', '/entregas', '/equipo',
              '/admin', '/torres',
            ].map(path => (
              <Route key={path} path={path} element={
                <PrivateRoute><ScreenModuloPendiente /></PrivateRoute>
              } />
            ))}

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SessionContext.Provider>
  )
}
