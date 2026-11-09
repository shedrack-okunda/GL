import { useData } from '../context/DataContext'
import { formatClock } from '../lib/util'

/** Always-visible answer to "is what I just logged safe?" */
export default function StatusChip() {
  const { online, pending, failed, syncing, lastSync, syncError, sync } = useData()

  let tone = 'bg-enter/12 text-enter border-enter/40'
  let text = lastSync ? `Synced ${formatClock(lastSync)}` : 'Ready'

  if (!online) {
    tone = 'bg-exit/12 text-exit border-exit/50'
    text = pending ? `Offline · ${pending} saved on device` : 'Offline · logging still works'
  } else if (failed) {
    tone = 'bg-danger/12 text-danger border-danger/50'
    text = `${failed} entr${failed === 1 ? 'y' : 'ies'} could not sync`
  } else if (syncing) {
    tone = 'bg-ink/8 text-ink border-ink/30'
    text = 'Syncing…'
  } else if (pending) {
    tone = 'bg-exit/12 text-exit border-exit/50'
    text = `${pending} waiting to sync`
  } else if (syncError) {
    tone = 'bg-exit/12 text-exit border-exit/50'
    text = syncError
  }

  return (
    <button
      type="button"
      onClick={() => void sync()}
      disabled={!online || syncing}
      className={`min-h-10 rounded-full border-2 px-3.5 text-sm font-semibold ${tone}`}
      aria-live="polite"
      title="Tap to sync now"
    >
      {text}
    </button>
  )
}
