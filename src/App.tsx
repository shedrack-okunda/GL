import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { isConfigured } from './lib/supabase'
import LoginScreen from './components/LoginScreen'
import Shell from './components/Shell'

function Gate() {
  const { profile, loading } = useAuth()
  if (loading) {
    return <div className="grid min-h-dvh place-items-center text-lg text-muted">Loading GuardLog…</div>
  }
  if (!profile) return <LoginScreen />
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}

export default function App() {
  if (!isConfigured) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-lg place-items-center p-6">
        <div className="panel p-6">
          <h1 className="font-display text-3xl font-bold">Connect Supabase first</h1>
          <p className="mt-3 text-lg">
            Copy <code className="rounded bg-paper px-1.5 py-0.5">.env.example</code> to{' '}
            <code className="rounded bg-paper px-1.5 py-0.5">.env</code>, fill in your project URL and anon key,
            then restart <code className="rounded bg-paper px-1.5 py-0.5">npm run dev</code>.
          </p>
        </div>
      </main>
    )
  }
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
