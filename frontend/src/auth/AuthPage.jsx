import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Arrow } from '../components/Icons'
import { signInWithEmail, signInWithGoogle, signUpWithEmail, sendPasswordReset, updatePassword } from '../lib/auth'
import { authErrorMessage } from '../lib/authError'
import { validateAuthForm } from '../lib/authValidation'
import { useAuth } from './AuthProvider'
import { safeWorkspaceNext } from './safeWorkspaceNext.js'

const copy = {
  login: { kicker: 'WELCOME BACK', title: 'Sign in to your space.', intro: 'Access your reconstruction workspace.', submit: 'Sign in', busy: 'Signing in…' },
  signup: { kicker: 'CREATE AN ACCOUNT', title: 'Begin with one image.', intro: 'Create your account to prepare, inspect, and export model geometry.', submit: 'Create account', busy: 'Creating account…' },
  forgot: { kicker: 'ACCOUNT RECOVERY', title: 'Reset your password.', intro: 'We will send a secure reset link to your email.', submit: 'Send reset link', busy: 'Sending link…' },
  reset: { kicker: 'ACCOUNT RECOVERY', title: 'Choose a new password.', intro: 'Enter a new password for your account.', submit: 'Save new password', busy: 'Saving password…' },
}

function FormField({ name, label, type = 'text', value, onChange, error, autoComplete, visible, onVisibility }) {
  const password = type === 'password'
  const actualType = password && visible ? 'text' : type
  return <div className="auth-field">
    <label className="auth-field-label" htmlFor={'auth-' + name}>{label}</label>
    <div className={'auth-input-wrap' + (error ? ' has-error' : '')}>
      <input
        id={'auth-' + name} name={name} className="auth-input" type={actualType}
        value={value} onChange={(event) => onChange(name, event.target.value)}
        autoComplete={autoComplete} inputMode={type === 'email' ? 'email' : undefined}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        aria-invalid={Boolean(error)} aria-describedby={error ? 'auth-' + name + '-error' : undefined}
        required
      />
      {password && <button className="auth-visibility" type="button" aria-label={(visible ? 'Hide ' : 'Show ') + label.toLowerCase()} aria-pressed={visible} onClick={onVisibility}>{visible ? 'Hide' : 'Show'}</button>}
    </div>
    {error && <p id={'auth-' + name + '-error'} className="auth-field-error">{error}</p>}
  </div>
}

export function AuthPage({ mode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { configured, ready, user, refreshUser } = useAuth()
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [visible, setVisible] = useState(false)
  const [pending, setPending] = useState('')
  const [message, setMessage] = useState(null)
  const from = safeWorkspaceNext(location.state?.from?.pathname)
  const content = copy[mode]

  useEffect(() => {
    if (ready && user && (mode === 'login' || mode === 'signup')) navigate(from, { replace: true })
  }, [ready, user, mode, navigate, from])

  const update = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setMessage(null)
  }

  async function submit(event) {
    event.preventDefault()
    setMessage(null)
    const nextErrors = validateAuthForm(mode, values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    if (!configured) {
      setMessage({ error: true, text: 'Authentication needs configuration before this request can be sent.' })
      return
    }
    if (mode === 'reset' && !user) {
      setMessage({ error: true, text: 'Open the reset link from your email before choosing a new password.' })
      return
    }
    setPending('submit')
    try {
      if (mode === 'login') {
        const data = await signInWithEmail(values.email.trim(), values.password)
        if (!data.session || !await refreshUser()) throw new Error('Sign-in could not be verified. Please try again.')
        navigate(from, { replace: true })
      } else if (mode === 'signup') {
        const data = await signUpWithEmail({ name: values.name.trim(), email: values.email.trim(), password: values.password })
        if (data.session) {
          if (!await refreshUser()) throw new Error('Your session could not be verified. Please sign in.')
          navigate('/dashboard', { replace: true })
        } else if (data.user) {
          setMessage({ text: 'Check your email for a confirmation link. Follow it to finish setting up your account.' })
        } else {
          throw new Error('Account creation could not be verified. Please try again.')
        }
      } else if (mode === 'forgot') {
        await sendPasswordReset(values.email.trim())
        setMessage({ text: 'If this address has an account, a password reset link is on its way.' })
      } else {
        await updatePassword(values.password)
        navigate('/dashboard', { replace: true })
      }
    } catch (error) {
      setMessage({ error: true, text: authErrorMessage(error, mode) })
    } finally {
      setPending('')
    }
  }

  async function google() {
    setMessage(null)
    if (!configured) {
      setMessage({ error: true, text: 'Authentication needs configuration before Google sign-in can start.' })
      return
    }
    setPending('google')
    try {
      await signInWithGoogle(from)
    } catch (error) {
      setMessage({ error: true, text: error.message || 'Google sign-in could not start.' })
      setPending('')
    }
  }

  return <section className="auth-panel" aria-labelledby="auth-panel-title">
    <p className="auth-panel-kicker">{content.kicker}</p>
    <h2 id="auth-panel-title">{content.title}</h2>
    <p className="auth-panel-intro">{content.intro}</p>
    {!configured && <div className="auth-configuration" role="status">
      <strong>Development setup required</strong>
      Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to frontend/.env.local, then restart Vite. Google also needs to be enabled in Supabase.
    </div>}
    <form className="auth-form" noValidate onSubmit={submit}>
      {mode === 'signup' && <FormField name="name" label="Your name" value={values.name} onChange={update} error={errors.name} autoComplete="name" />}
      {mode !== 'reset' && <FormField name="email" label="Email address" type="email" value={values.email} onChange={update} error={errors.email} autoComplete="email" />}
      {mode !== 'forgot' && <FormField name="password" label={mode === 'reset' ? 'New password' : 'Password'} type="password" value={values.password} onChange={update} error={errors.password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} visible={visible} onVisibility={() => setVisible((current) => !current)} />}
      {(mode === 'signup' || mode === 'reset') && <FormField name="confirm" label="Confirm password" type="password" value={values.confirm} onChange={update} error={errors.confirm} autoComplete="new-password" visible={visible} onVisibility={() => setVisible((current) => !current)} />}
      {mode === 'login' && <div className="auth-form-topline"><Link to="/forgot-password" className="auth-minor-link">Forgot password?</Link></div>}
      <div role="status" aria-live="polite">
        {message && <p className={'auth-form-message' + (message.error ? ' is-error' : '')}>{message.text}</p>}
      </div>
      <button className="auth-submit" type="submit" disabled={Boolean(pending)}>{pending === 'submit' ? content.busy : content.submit}<Arrow diagonal /></button>
      {(mode === 'login' || mode === 'signup') && <>
        <div className="auth-divider"><span>OR</span></div>
        <button className="auth-google" type="button" disabled={Boolean(pending)} onClick={google}><span className="auth-google-mark" aria-hidden="true">G</span>{pending === 'google' ? 'Connecting to Google…' : 'Continue with Google'}</button>
      </>}
    </form>
    <p className="auth-switch">
      {mode === 'login' ? <>New here? <Link to="/signup">Create an account</Link></>
        : mode === 'signup' ? <>Already have an account? <Link to="/login">Sign in</Link></>
          : <>Remembered your password? <Link to="/login">Back to sign in</Link></>}
    </p>
  </section>
}
