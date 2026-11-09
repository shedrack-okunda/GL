import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const err = await signIn(email.trim(), password)
    if (err) setError(navigator.onLine ? err : 'You need a connection to sign in the first time.')
    setBusy(false)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 p-6">
      <div>
        <div className="inline-block rounded-lg border-4 border-ink bg-plate px-4 py-1 font-display text-5xl font-bold tracking-wider">
          GUARDLOG
        </div>
        <p className="mt-3 text-lg text-muted">Gate vehicle logbook. Sign in to start your shift.</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required className="field"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required className="field"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="rounded-xl border-2 border-danger/40 bg-danger/10 p-3 font-medium text-danger">
            {error}
          </p>
        )}
        <button className="btn btn-ink" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}
