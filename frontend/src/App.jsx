import { lazy, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Footer, Header, RouteEffects } from './components/Layout'
import { Landing } from './pages/Landing'
import { ComingNext } from './pages/ComingNext'
import { useBackendHealth } from './lib/useBackendHealth'

const AuthArea = lazy(() => import('./auth/AuthArea'))

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

export default function App() {
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <RouteEffects />
    <Routes>
      <Route path="/" element={<PublicArea />} />
      <Route path="/login" element={<AuthRoute />} />
      <Route path="/signup" element={<AuthRoute />} />
      <Route path="/forgot-password" element={<AuthRoute />} />
      <Route path="/reset-password" element={<AuthRoute />} />
      <Route path="/auth/callback" element={<AuthRoute />} />
      <Route path="/dashboard" element={<AuthRoute />} />
      <Route path="/reconstruct" element={<AuthRoute />} />
      <Route path="/result/:id" element={<PublicArea />} />
      <Route path="*" element={<PublicArea />} />
    </Routes>
  </>
}
