import { useEffect, useMemo, useRef, useState } from 'react'

function relativeTime(value) {
  if (!value) return '—'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return '—'
  const hours = Math.max(0, Math.round((Date.now() - timestamp) / 3600000))
  if (hours < 1) return 'now'
  if (hours < 24) return `${hours}h ago`
  if (hours < 48) return 'yesterday'
  return `${Math.round(hours / 24)}d ago`
}

function formatHours(seconds) {
  const hours = Number(seconds || 0) / 3600
  if (hours >= 100) return Math.round(hours).toLocaleString()
  return hours.toFixed(1).replace(/\.0$/, '')
}

function paperMeta(paper) {
  return [paper?.year, paper?.authors].filter(Boolean).join(' · ') || paper?.id || ''
}

function ActivityCalendar({ days }) {
  const max = Math.max(1, ...days.map((day) => Number(day.views || 0)))
  return (
    <div className="editorial-calendar" role="list" aria-label="Reading activity by day">
      {days.map((day) => {
        const level = Number(day.views || 0) / max
        return (
          <span
            key={day.date}
            role="listitem"
            className="editorial-calendar-day"
            style={{ '--activity-level': level }}
            title={`${day.date}: ${day.views || 0} ${Number(day.views) === 1 ? 'open' : 'opens'}`}
          />
        )
      })}
    </div>
  )
}

export default function EditorialLanding({
  summary,
  fallbackContinue,
  fallbackRecents = [],
  openPaper,
  dimmed = false,
  selectedPaperId,
  onPaperHover,
}) {
  const [activityOpen, setActivityOpen] = useState(false)
  const swipeStart = useRef(null)
  const continuePaper = summary?.continuePaper || fallbackContinue
  const recentlySaved = summary?.momentum?.recentlyAdded?.slice(0, 4) || fallbackRecents.slice(0, 4)
  const consistency = summary?.consistency || {}
  const totals = summary?.totals || {}
  const readingTime = summary?.readingTime || {}
  const history = consistency.readsByDay || []
  const activity = history.slice(-30)
  const maxViews = useMemo(
    () => Math.max(1, ...activity.map((day) => Number(day.views || 0))),
    [activity]
  )
  const currentPage = Math.max(1, Number(continuePaper?.current_page) || 1)
  const totalPages = Math.max(currentPage, Number(continuePaper?.total_pages) || currentPage)
  const progress = totalPages > 1 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0

  const openActivity = () => setActivityOpen(true)

  useEffect(() => {
    if (!activityOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setActivityOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activityOpen])

  return (
    <>
      <section className={`editorial-desk ${dimmed ? 'is-dimmed' : ''}`} aria-label="Reading desk">
        <div className="editorial-desk-grid">
          <div className="editorial-primary-column">
            {continuePaper ? (
              <button
                type="button"
                className={`editorial-continue ${selectedPaperId === continuePaper.id ? 'is-selected' : ''}`}
                onMouseEnter={() => onPaperHover?.(continuePaper.id)}
                onClick={() => openPaper?.(continuePaper)}
              >
                <span className="editorial-card-head">
                  <span className="editorial-label">Continue</span>
                  <span className="editorial-reading-state"><i /> Reading</span>
                </span>
                <span className="editorial-continue-title">{continuePaper.title || continuePaper.id}</span>
                <span className="editorial-paper-meta">{paperMeta(continuePaper)}</span>
                <span className="editorial-progress"><i style={{ width: `${progress}%` }} /></span>
                <span className="editorial-card-foot">
                  <span>{totalPages > 1 ? `Page ${currentPage} of ${totalPages}` : 'Ready to continue'}</span>
                  <span>Open →</span>
                </span>
              </button>
            ) : (
              <div className="editorial-continue editorial-empty">
                <span className="editorial-label">Continue</span>
                <span className="editorial-continue-title">Your next paper will appear here.</span>
              </div>
            )}

            <div className="editorial-stats">
              <div className="editorial-stat">
                <span className="editorial-stat-value">{consistency.currentStreak || 0}<small>d</small></span>
                <span className="editorial-label">Streak</span>
                <span className="editorial-stat-detail">best {consistency.longestStreak || 0}d</span>
              </div>
              <div className="editorial-stat">
                <span className="editorial-stat-value">{formatHours(readingTime.totalSeconds)}<small>h</small></span>
                <span className="editorial-label">Time read</span>
                <span className="editorial-stat-detail">+{formatHours(readingTime.thisWeekSeconds)}h this wk</span>
              </div>
              <div className="editorial-stat">
                <span className="editorial-stat-value">{totals.readingNow || 0}<small>/{totals.totalPapers || 0}</small></span>
                <span className="editorial-label">In progress</span>
                <span className="editorial-stat-detail">{totals.completed || 0} finished</span>
              </div>
            </div>
          </div>

          <div className="editorial-secondary-column">
            <span className="editorial-label">Recently saved</span>
            <div className="editorial-recents">
              {recentlySaved.length ? recentlySaved.map((paper) => (
                <button
                  key={paper.id}
                  type="button"
                  className={selectedPaperId === paper.id ? 'is-selected' : ''}
                  onMouseEnter={() => onPaperHover?.(paper.id)}
                  onClick={() => openPaper?.(paper)}
                >
                  <span>{paper.title || paper.id}</span>
                  <time>{relativeTime(paper.created_at || paper.last_accessed_at)}</time>
                </button>
              )) : <span className="editorial-empty-copy">New captures will appear here.</span>}
            </div>
            <button
              type="button"
              className="editorial-activity-peek"
              onClick={openActivity}
              onPointerDown={(event) => { swipeStart.current = { x: event.clientX, y: event.clientY } }}
              onPointerUp={(event) => {
                const start = swipeStart.current
                swipeStart.current = null
                if (start && Math.abs(event.clientX - start.x) > 45 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y)) openActivity()
              }}
            >
              <span className="editorial-card-head">
                <span className="editorial-label">Reading activity</span>
                <span className="editorial-activity-action">swipe → · expand ⤢</span>
              </span>
              <span className="editorial-spark" aria-hidden="true">
                {activity.map((day, index) => {
                  const value = Number(day.views || 0)
                  const height = value === 0 ? 8 : 12 + (value / maxViews) * 76
                  return <i key={day.date} style={{ height: `${height}%`, opacity: value ? .45 + value / maxViews * .55 : .18, animationDelay: `${index * 14}ms` }} />
                })}
              </span>
            </button>
          </div>
        </div>
      </section>

      {activityOpen && (
        <div className="editorial-activity-overlay" role="dialog" aria-modal="true" aria-labelledby="activity-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setActivityOpen(false) }}>
          <div className="editorial-activity-panel">
            <header>
              <div>
                <span className="editorial-label">Reading activity</span>
                <h2 id="activity-title">The last 26 weeks</h2>
              </div>
              <button type="button" onClick={() => setActivityOpen(false)}>esc ×</button>
            </header>
            <div className="editorial-activity-summary">
              <span><b>{history.reduce((sum, day) => sum + Number(day.views || 0), 0)}</b> opens</span>
              <span>·</span>
              <span><b>{history.filter((day) => Number(day.views) > 0).length}</b> active days</span>
              <span>·</span>
              <span><b>{consistency.currentStreak || 0}</b>-day streak</span>
              <span>·</span>
              <span>best <b>{consistency.longestStreak || 0}</b></span>
            </div>
            <ActivityCalendar days={history} />
          </div>
        </div>
      )}
    </>
  )
}
