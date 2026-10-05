import { lazy, Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthProvider'
import { AuthShell } from './AuthShell'
import { AuthPage } from './AuthPage'
import { AuthCallback } from './AuthCallback'
import { DashboardShell } from './DashboardShell'
import { Dashboard } from '../dashboard/Dashboard'
import { ProfileProvider } from '../profile/ProfileProvider.jsx'
import { ReconstructionJobProvider } from '../jobs/ReconstructionJobProvider.jsx'

const ReconstructionPage = lazy(() => import('../reconstruction/ReconstructionPage').then((module) => ({ default: module.ReconstructionPage })))
const History = lazy(() => import('../pages/History'))
const Model = lazy(() => import('../pages/Model'))
const Profile = lazy(() => import('../pages/Profile'))
const ResultDetail = lazy(() => import('../pages/ResultDetail'))

export function ProtectedWorkspace() {
  const { configured, ready, user } = useAuth()
  if (!configured) return <Navigate to="/login" replace />
  if (!ready) return <AuthShell mode="callback"><section className="auth-panel auth-status-panel" role="status">Checking your session…</section></AuthShell>
  if (!user) return <Navigate to="/login" replace />
  return <ProfileProvider key={user.id} user={user}><ReconstructionJobProvider key={user.id} userId={user.id}><DashboardShell /></ReconstructionJobProvider></ProfileProvider>
}

export default function AuthArea() { return <AuthProvider><Outlet /></AuthProvider> }

export function AuthFormRoute({ mode }) { return <AuthShell mode={mode}><AuthPage mode={mode} /></AuthShell> }
export function AuthCallbackRoute() { return <AuthShell mode="callback"><AuthCallback /></AuthShell> }
export function RequireAuth() {
  const { configured, ready, user } = useAuth()
  const { pathname } = useLocation()
  if (!configured) return <Navigate to="/login" replace />
  if (!ready) return <AuthShell mode="callback"><section className="auth-panel auth-status-panel" role="status">Checking your session…</section></AuthShell>
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: { pathname } }} />
}
export function DashboardRoute() { return <Dashboard /> }
export function ReconstructionRoute() { return <Suspense fallback={<p className="workspace-loading" role="status">Opening your workspace…</p>}><ReconstructionPage /></Suspense> }
export function HistoryRoute() { return <Suspense fallback={<p className="workspace-loading" role="status">Opening History…</p>}><History /></Suspense> }
export function ModelRoute() { return <Suspense fallback={<p className="workspace-loading" role="status">Opening model details…</p>}><Model /></Suspense> }
export function ProfileRoute() { return <Suspense fallback={<p className="workspace-loading" role="status">Opening Profile…</p>}><Profile /></Suspense> }
export function ResultDetailRoute() { return <Suspense fallback={<p className="workspace-loading" role="status">Opening result…</p>}><ResultDetail /></Suspense> }
