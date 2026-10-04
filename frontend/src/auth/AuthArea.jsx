import { lazy, Suspense } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthProvider'
import { AuthShell } from './AuthShell'
import { AuthPage } from './AuthPage'
import { AuthCallback } from './AuthCallback'
import { DashboardShell } from './DashboardShell'

const ReconstructionPage = lazy(() => import('../reconstruction/ReconstructionPage').then((module) => ({ default: module.ReconstructionPage })))
const History = lazy(() => import('../pages/History'))
const Model = lazy(() => import('../pages/Model'))
const Profile = lazy(() => import('../pages/Profile'))
const ResultDetail = lazy(() => import('../pages/ResultDetail'))

function ProtectedWorkspace({ pathname }) {
  const { configured, ready, user } = useAuth()
  if (!configured) return <Navigate to="/login" replace />
  if (!ready) return <AuthShell mode="callback"><section className="auth-panel auth-status-panel" role="status">Checking your session…</section></AuthShell>
  if (!user) return <Navigate to="/login" replace state={{ from: { pathname } }} />
  if (pathname === '/dashboard') return <DashboardShell />
  const Page = pathname === '/reconstruct' ? ReconstructionPage : pathname === '/history' ? History : pathname === '/model' ? Model : pathname === '/profile' ? Profile : ResultDetail
  return <DashboardShell><Suspense fallback={<p className="workspace-loading" role="status">Opening your workspace…</p>}><Page /></Suspense></DashboardShell>
}

function AuthContent() {
  const { pathname } = useLocation()
  if (['/dashboard', '/reconstruct', '/history', '/model', '/profile'].includes(pathname) || /^\/(?:reconstructions|result)\/[^/]+$/.test(pathname)) return <ProtectedWorkspace pathname={pathname} />
  if (pathname === '/auth/callback') return <AuthShell mode="callback"><AuthCallback /></AuthShell>
  const mode = pathname === '/signup' ? 'signup'
    : pathname === '/forgot-password' ? 'forgot'
      : pathname === '/reset-password' ? 'reset' : 'login'
  return <AuthShell mode={mode}><AuthPage mode={mode} /></AuthShell>
}

export default function AuthArea() {
  return <AuthProvider><AuthContent /></AuthProvider>
}
