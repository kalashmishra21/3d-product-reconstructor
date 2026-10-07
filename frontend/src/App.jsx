import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Footer, Header, RouteEffects } from './components/Layout'
import { Landing } from './pages/Landing'
import { ComingNext } from './pages/ComingNext'
import { useBackendHealth } from './lib/useBackendHealth'

const AuthArea = lazy(() => import('./auth/AuthArea'))
const authModule = () => import('./auth/AuthArea')
const authRoute = (name) => lazy(() => authModule().then((module) => ({ default: module[name] })))
const AuthFormRoute = authRoute('AuthFormRoute')
const AuthCallbackRoute = authRoute('AuthCallbackRoute')
const RequireAuth = authRoute('RequireAuth')
const ProtectedWorkspace = authRoute('ProtectedWorkspace')
const DashboardRoute = authRoute('DashboardRoute')
const ReconstructionRoute = authRoute('ReconstructionRoute')
const HistoryRoute = authRoute('HistoryRoute')
const ModelRoute = authRoute('ModelRoute')
const ResultDetailRoute = authRoute('ResultDetailRoute')

function PublicArea() {
  const health = useBackendHealth()
  const { pathname } = useLocation()
  return <div className="site-wrap">
    <Header health={health} />
    <main id="main-content" tabIndex={-1}>
      {pathname === '/' ? <Landing health={health} /> : <ComingNext />}
    </main>
    <Footer />
  </div>
}

function AuthRoute() {
  return <Suspense fallback={<div className="grid min-h-svh place-items-center bg-charcoal text-ivory" role="status">Opening your space…</div>}>
    <AuthArea />
  </Suspense>
}

function LegacyResultRedirect() {
  const { id } = useParams()
  return <Navigate to={`/reconstructions/${encodeURIComponent(id)}`} replace />
}

export default function App() {
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <RouteEffects />
    <Routes>
      <Route path="/" element={<PublicArea />} />
      <Route element={<AuthRoute />}>
        <Route path="/login" element={<AuthFormRoute mode="login" />} />
        <Route path="/signup" element={<AuthFormRoute mode="signup" />} />
        <Route path="/forgot-password" element={<AuthFormRoute mode="forgot" />} />
        <Route path="/reset-password" element={<AuthFormRoute mode="reset" />} />
        <Route path="/auth/callback" element={<AuthCallbackRoute />} />
        <Route element={<RequireAuth />}>
          <Route element={<ProtectedWorkspace />}>
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/reconstruct" element={<ReconstructionRoute />} />
            <Route path="/history" element={<HistoryRoute />} />
            <Route path="/model" element={<ModelRoute />} />
            <Route path="/profile" element={<Navigate to="/dashboard" replace />} />
            <Route path="/reconstructions/:id" element={<ResultDetailRoute />} />
            <Route path="/result/:id" element={<LegacyResultRedirect />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PublicArea />} />
    </Routes>
  </>
}
