import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Role } from '../types'

export interface Profile {
  id: string
  email: string
  role: Role
  fullName: string | null
}

interface AuthState {
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const CACHE_KEY = 'guardlog:profile'
const Ctx = createContext<AuthState | null>(null)

function readCache(): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

async function loadProfile(userId: string, email: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('role, full_name').eq('id', userId).maybeSingle()
  if (error) return null // offline or transient – caller keeps whatever it had
  return {
    id: userId,
    email,
    role: (data?.role as Role) ?? 'guard',
    fullName: data?.full_name ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Start from the cached profile so the app opens instantly (and offline) on a signed-in device.
  const [profile, setProfile] = useState<Profile | null>(() => readCache())
  const [loading, setLoading] = useState(() => readCache() === null)

  const remember = useCallback((p: Profile | null) => {
    setProfile(p)
    if (p) localStorage.setItem(CACHE_KEY, JSON.stringify(p))
    else localStorage.removeItem(CACHE_KEY)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (user) {
        const fresh = await loadProfile(user.id, user.email ?? '')
        if (!cancelled && fresh) remember(fresh)
      } else if (!cancelled && navigator.onLine) {
        remember(null) // genuinely signed out
      }
      if (!cancelled) setLoading(false)
    })()

    // NB: keep this callback synchronous – awaiting Supabase calls inside it can deadlock.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') remember(null)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [remember])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.user) return error?.message ?? 'Could not sign in.'
      const p = await loadProfile(data.user.id, data.user.email ?? email)
      remember(p ?? { id: data.user.id, email, role: 'guard', fullName: null })
      return null
    },
    [remember],
  )

  const signOut = useCallback(async () => {
    remember(null)
    await supabase.auth.signOut().catch(() => undefined)
  }, [remember])

  const value = useMemo(() => ({ profile, loading, signIn, signOut }), [profile, loading, signIn, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}
