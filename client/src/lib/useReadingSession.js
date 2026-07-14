import { useEffect } from 'react'
import axios from 'axios'
import { getInstrumentationSessionId } from './instrumentation'

const HEARTBEAT_MS = 5000
const FLUSH_SECONDS = 15
const IDLE_AFTER_MS = 60 * 1000

function createId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export default function useReadingSession(paperId) {
  useEffect(() => {
    if (!paperId) return undefined

    const readingSessionId = createId()
    const appSessionId = getInstrumentationSessionId()
    let lastTickAt = performance.now()
    let lastActivityAt = Date.now()
    let pendingSeconds = 0

    const markActive = () => { lastActivityAt = Date.now() }
    const isActivelyReading = () => (
      document.visibilityState === 'visible'
      && document.hasFocus()
      && Date.now() - lastActivityAt < IDLE_AFTER_MS
    )
    const flush = () => {
      const activeSeconds = Math.floor(pendingSeconds)
      if (activeSeconds < 1) return
      pendingSeconds -= activeSeconds
      axios.post('/api/instrumentation/reading-session', {
        id: readingSessionId,
        paperId,
        sessionId: appSessionId,
        activeSeconds,
      }).catch(() => {})
    }
    const tick = () => {
      const now = performance.now()
      const elapsedSeconds = Math.min(HEARTBEAT_MS * 1.5, now - lastTickAt) / 1000
      lastTickAt = now
      if (isActivelyReading()) pendingSeconds += elapsedSeconds
      if (pendingSeconds >= FLUSH_SECONDS) flush()
    }
    const handleVisibility = () => {
      tick()
      if (document.visibilityState !== 'visible') flush()
      else markActive()
    }

    const activityEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    activityEvents.forEach((eventName) => document.addEventListener(eventName, markActive, { passive: true }))
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', markActive)
    const timer = window.setInterval(tick, HEARTBEAT_MS)

    return () => {
      tick()
      flush()
      window.clearInterval(timer)
      activityEvents.forEach((eventName) => document.removeEventListener(eventName, markActive))
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', markActive)
    }
  }, [paperId])
}
