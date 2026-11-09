import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import GuardView from './guard/GuardView'
import AdminView from './admin/AdminView'
import StatusChip from './StatusChip'

export default function Shell() {
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [view, setView] = useState<'gate' | 'admin'>(isAdmin ? 'admin' : 'gate')

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b-2 border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className={`mx-auto flex items-center gap-3 px-4 py-2.5 ${view === 'admin' ? 'max-w-7xl' : 'max-w-xl'}`}>
          <span className="rounded-md border-[3px] border-ink bg-plate px-2 font-display text-2xl font-bold leading-snug tracking-wide">
            GL
          </span>

          {isAdmin && (
            <nav className="flex rounded-xl border-2 border-line bg-card p-0.5" aria-label="Switch view">
              {(['gate', 'admin'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`min-h-9 rounded-[10px] px-3 text-sm font-bold ${view === v ? 'bg-ink text-white' : 'text-ink'}`}
                >
                  {v === 'gate' ? 'Gate' : 'Dashboard'}
                </button>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            <StatusChip />
            <button onClick={() => void signOut()} className="min-h-10 px-2 text-sm font-semibold underline underline-offset-4">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {view === 'admin' && isAdmin ? <AdminView /> : <GuardView />}
    </div>
  )
}
