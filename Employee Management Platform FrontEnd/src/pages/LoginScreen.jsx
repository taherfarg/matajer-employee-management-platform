import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Fingerprint, LockKeyhole, Mail, ShieldCheck, UserRound, X, XCircle } from 'lucide-react'
import { BrandMark, Spinner } from '../components/ui.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { DEMO_ACCOUNTS, LOGIN_HIGHLIGHTS } from '../data.js'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const useAccount = (account) => {
    setEmail(account.email)
    setPassword(account.password)
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    setError('')
    setSubmitting(true)
    try {
      // Credentials are verified by the API; the frontend holds no password list.
      await signIn(email.trim(), password)
    } catch (caught) {
      setError(
        caught.status === 0
          ? 'Cannot reach the server. Make sure the API is running on port 4000.'
          : caught.message || 'Sign in failed. Please try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="grain" aria-hidden="true" />
      <section className="login-story" aria-label="About People Hub">
        <div className="brand brand-light">
          <BrandMark />
          <span>People Hub</span>
        </div>
        <div className="login-copy">
          <p className="login-kicker">
            <span /> People operations, in one view
          </p>
          <h1>
            Every person.
            <br />
            Every entity.
            <br />
            <em>One clear picture.</em>
          </h1>
          <p>
            A focused employee platform for a growing, multi-country team—built to keep people informed and
            management in control.
          </p>
        </div>
        <div className="login-proof">
          <div className="avatar-stack" aria-hidden="true">
            {LOGIN_HIGHLIGHTS.avatars.map((item) => (
              <span className="avatar avatar-sm" style={{ background: item.color }} key={item.initials}>
                {item.initials}
              </span>
            ))}
            <span className="avatar avatar-sm avatar-count">+13</span>
          </div>
          <div>
            <strong>{LOGIN_HIGHLIGHTS.headline}</strong>
            <span>{LOGIN_HIGHLIGHTS.subline}</span>
          </div>
        </div>
        <div className="login-orbit orbit-one" />
        <div className="login-orbit orbit-two" />
      </section>

      <section className="login-panel">
        <div className="mobile-brand brand">
          <BrandMark />
          <span>People Hub</span>
        </div>
        <div className="login-form-wrap">
          <p className="eyebrow">Secure workspace</p>
          <h2>Welcome back</h2>
          <p className="login-intro">Sign in with a demo account to explore the role-based experience.</p>

          <form onSubmit={handleSubmit} noValidate>
            <label className="field">
              <span>Work email</span>
              <div className="input-with-icon">
                <Mail size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  autoComplete="username"
                  disabled={submitting}
                  required
                />
              </div>
            </label>

            <label className="field">
              <span>Password</span>
              <div className="input-with-icon">
                <LockKeyhole size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={submitting}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <X size={17} /> : <Fingerprint size={17} />}
                </button>
              </div>
            </label>

            {error && (
              <div className="form-error" role="alert">
                <XCircle size={17} />
                {error}
              </div>
            )}

            <button className="button button-primary button-wide" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner size={17} /> Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="demo-divider">
            <span>Demo access</span>
          </div>
          <div className="demo-accounts">
            {DEMO_ACCOUNTS.map((account) => (
              <button key={account.email} onClick={() => useAccount(account)} type="button" disabled={submitting}>
                <span className={`demo-icon demo-icon-${account.tone}`}>
                  {account.tone === 'admin' ? <ShieldCheck size={19} /> : <UserRound size={19} />}
                </span>
                <span>
                  <strong>{account.label}</strong>
                  <small>{account.description}</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
          <p className="security-note">
            <ShieldCheck size={14} /> Safe demo data only. No production systems are connected.
          </p>
        </div>
      </section>
    </main>
  )
}
