export type Role = 'guard' | 'admin'

export interface Unit {
  id: string
  name: string
}

export interface Resident {
  id: string
  plate: string
  full_name: string
  kind: 'resident' | 'staff'
  unit_id: string | null
  phone: string | null
  active: boolean
}

export interface LogRow {
  id: string
  plate: string
  unit_id: string | null
  unit_name: string | null
  driver_name: string | null
  resident_id: string | null
  is_registered: boolean
  entry_time: string
  exit_time: string | null
}

/** A change made on this device that still has to reach Supabase. */
export type OutboxOp =
  | { opId: string; type: 'entry'; log: LogRow; queuedAt: string }
  | { opId: string; type: 'exit'; logId: string; exit_time: string; queuedAt: string }
