import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { exchangeAuthCode } from '../lib/auth'
import { useAuth } from './AuthProvider'

// React Strict Mode can replay effects; an OAuth code must be exchanged only once.
const exchanges = new Map()
function exchangeOnce(code, flowId) {
  if (!exchanges.has(code)) exchanges.set(code, exchangeAuthCode(code, flowId))
  return exchanges.get(code)
}

export function AuthCallback() {
  const navigate = useNavigate()
  const { configured, refreshUser } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!configured) return
    let active = true
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const flowId = params.get('sb_flow_id')
    const next = params.get('next') === '/reset-password' ? '/reset-password' : '/dashboard'
    const providerError = params.get('error_description') || params.get('error')
    if (providerError) { setError(providerError); return }
    if (!code) { setError('No authentication code was returned. Please start sign-in again.'); return }
    exchangeOnce(code, flowId)
      .then(async (data) => {
        if (!data.session || !await refreshUser()) throw new Error('Your session could not be verified.')
        if (active) navigate(next, { replace: true })
      })
      .catch((failure) => { if (active) setError(failure.message || 'Sign-in could not be completed.') })
    return () => { active = false }
  }, [configured, navigate, refreshUser])

  return <section className="auth-panel auth-status-panel" aria-labelledby="auth-callback-title">
    <p className="auth-panel-kicker">SECURE CONNECTION</p>
    <h2 id="auth-callback-title">Completing sign-in.</h2>
    <div role="status" aria-live="polite">
      {!configured ? <p className="auth-configuration">Authentication needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.</p>
        : error ? <p className="auth-form-message is-error">{error}</p>
          : <p className="auth-panel-intro">Checking your secure session…</p>}
    </div>
    {(error || !configured) && <Link className="button secondary" to="/login">Return to sign in <Arrow /></Link>}
  </section>
}
