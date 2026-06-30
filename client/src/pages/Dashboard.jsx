import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { captureAction, captureAppError } from '../lib/instrumentation'

function formatRelativeDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const diffDays = Math.floor((now - date) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function formatShortDate(value) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function paperMeta(paper) {
  return [paper.year, paper.authors].filter(Boolean).join(' · ') || paper.id
}

function StatTile({ label, value, denominator, detail, index = 0 }) {
  const displayValue = denominator != null
    ? <>{value}<span style={{ fontSize: '1rem', opacity: 0.45, fontWeight: 400 }}> / {denominator}</span></>
    : value

  return (
    <div
      className="rx-dashboard-tile animate-stagger-fade"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="rx-label">{label}</div>
      <div className="rx-dashboard-stat">{displayValue}</div>
      {detail ? <div className="rx-meta text-xs">{detail}</div> : null}
    </div>
  )
}

function PaperList({ items, empty, onOpenPaper, dateField = 'last_accessed_at' }) {
  if (!items?.length) {
    return (
      <div className="rx-empty-state !h-auto py-6">
        <div className="rx-empty-state-inner">
          <div className="rx-empty-state-title">{empty}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {items.map((paper, idx) => (
        <button
          key={paper.id}
          type="button"
          onClick={() => onOpenPaper?.(paper)}
          className="rx-dashboard-paper animate-stagger-fade"
          style={{ animationDelay: `${Math.min(idx, 7) * 40}ms` }}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{paper.title || paper.id}</span>
            <span className="mt-0.5 block truncate text-[11px] text-muted">{paperMeta(paper)}</span>
          </span>
          <span className="shrink-0 text-right text-[11px] text-muted">
            {formatRelativeDate(paper[dateField])}
          </span>
        </button>
      ))}
    </div>
  )
}

function AgeDistribution({ rows }) {
  if (!rows?.length) return null
  const maxCount = Math.max(1, ...rows.map((r) => Number(r.count)))

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => {
        const pct = Math.max(4, (Number(row.count) / maxCount) * 100)
        return (
          <div key={row.yr} className="flex items-center gap-2.5">
            <span style={{ width: '2.6rem', flexShrink: 0, fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--muted)', textAlign: 'right' }}>
              {row.yr}
            </span>
            <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'color-mix(in srgb, var(--border) 60%, transparent)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  borderRadius: '3px',
                  background: 'var(--secondary)',
                  opacity: 0.7,
                  transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
                }}
              />
            </div>
            <span style={{ width: '1.4rem', flexShrink: 0, fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
              {row.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard({ openPaper }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    axios
      .get('/api/dashboard/summary', { params: { days: 30 } })
      .then(({ data }) => { if (!cancelled) setSummary(data) })
      .catch((err) => {
        if (cancelled) return
        setError(err.response?.data?.error || 'Could not load dashboard')
        captureAppError(err, { route: 'dashboard', source: 'dashboard_summary' })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const readsByDay = summary?.consistency?.readsByDay || []
  const maxViews = useMemo(
    () => Math.max(1, ...readsByDay.map((day) => Number(day.views || 0))),
    [readsByDay]
  )

  const handleOpenPaper = (paper) => {
    captureAction('dashboard_open_paper', { route: 'dashboard', paperId: paper.id, paperTitle: paper.title })
    openPaper?.(paper)
  }

  if (loading) {
    return (
      <div className="rx-dashboard">
        <div className="rx-dashboard-inner">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="rx-dashboard-tile">
                <div className="h-3 w-16 rounded skeleton-shimmer" />
                <div className="h-8 w-12 rounded skeleton-shimmer" />
                <div className="h-3 w-20 rounded skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rx-dashboard">
        <div className="rx-dashboard-inner">
          <div className="rx-pane p-8 text-sm text-red-400">{error}</div>
        </div>
      </div>
    )
  }

  const totals = summary?.totals || {}
  const consistency = summary?.consistency || {}
  const touchedThisWeek = totals.touchedThisWeek || 0
  const paperOfDay = summary?.paperOfDay
  const pickUp = summary?.recentReads?.[0] || null

  return (
    <div className="rx-dashboard animate-view-fade">
      <div className="rx-dashboard-inner">

        <header className="rx-dashboard-header">
          <h1 className="m-0 text-3xl font-medium leading-tight text-foreground">How consistent are you?</h1>
        </header>

        {/* Read for the day */}
        {paperOfDay && (
          <section
            className="rx-pod-card animate-stagger-fade"
            style={{ animationDelay: '30ms' }}
          >
            <div className="rx-pod-eyebrow">Read for the day</div>
            <div className="rx-pod-title">{paperOfDay.title || paperOfDay.id}</div>
            <div className="rx-pod-meta">{paperMeta(paperOfDay)}</div>
            {paperOfDay.abstract && (
              <div className="rx-pod-abstract">
                {paperOfDay.abstract.slice(0, 180).trimEnd()}{paperOfDay.abstract.length > 180 ? '…' : ''}
              </div>
            )}
            <button
              type="button"
              className="rx-pod-btn"
              onClick={() => handleOpenPaper(paperOfDay)}
            >
              Open
            </button>
          </section>
        )}

        {/* Stat tiles */}
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <StatTile index={0} label="Streak" value={consistency.currentStreak || 0} detail={`best: ${consistency.longestStreak || 0}d`} />
          <StatTile index={1} label="Active days" value={consistency.activeDays || 0} detail="last 30d" />
          <StatTile index={2} label="In progress" value={totals.readingNow || 0} denominator={totals.totalPapers || 0} />
          <StatTile index={3} label="Finished" value={totals.completed || 0} denominator={totals.totalPapers || 0} />
          <StatTile index={4} label="This week" value={totals.addedThisWeek || 0} detail={`${totals.totalPapers || 0} total`} />
        </section>

        {/* Activity chart */}
        <section className="rx-pane animate-stagger-fade" style={{ animationDelay: '260ms' }}>
          <div className="rx-pane-header">
            <div className="text-xs text-muted">Activity</div>
            <div className="text-xs text-muted">
              {touchedThisWeek} {touchedThisWeek === 1 ? 'paper' : 'papers'} this week
            </div>
          </div>
          <div className="rx-dashboard-activity">
            {readsByDay.map((day, idx) => {
              const level = Math.max(0, Math.min(1, day.views / maxViews))
              const d = new Date(`${day.date}T00:00:00`)
              const isMonthStart = d.getDate() === 1
              const dayLabel = isMonthStart
                ? new Intl.DateTimeFormat(undefined, { month: 'short' }).format(d)
                : d.getDate()

              return (
                <div key={day.date} className="rx-dashboard-day" title={`${formatShortDate(day.date)}: ${day.views} opens`}>
                  <span
                    className="rx-dashboard-day-bar"
                    style={{
                      height: `${Math.max(day.views > 0 ? 18 : 5, 14 + level * 58)}px`,
                      opacity: day.views > 0 ? 0.45 + level * 0.55 : 0.16,
                      animationDelay: `${idx * 18}ms`,
                    }}
                  />
                  <span
                    className="rx-dashboard-day-label"
                    style={{ fontWeight: isMonthStart ? 600 : undefined, opacity: isMonthStart ? 0.9 : undefined }}
                  >
                    {dayLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Bottom grid */}
        <section className="grid gap-2 lg:grid-cols-[1.1fr_.9fr]">

          {/* Left: pick up + recent reads */}
          <div className="flex flex-col gap-2">
            {pickUp && (
              <div
                className="rx-pane rx-pickup-card animate-stagger-fade"
                style={{ animationDelay: '300ms' }}
              >
                <div className="rx-pane-header">
                  <div className="rx-label">Pick up where you left off</div>
                  <div className="text-[11px] text-muted">{formatRelativeDate(pickUp.last_accessed_at)}</div>
                </div>
                <button
                  type="button"
                  className="rx-pickup-btn"
                  onClick={() => handleOpenPaper(pickUp)}
                >
                  <span className="block truncate text-sm font-medium text-foreground">{pickUp.title || pickUp.id}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted">{paperMeta(pickUp)}</span>
                </button>
              </div>
            )}

            <div className="rx-pane animate-stagger-fade" style={{ animationDelay: '340ms' }}>
              <div className="rx-pane-header">
                <div className="rx-label">Recent reads</div>
              </div>
              <div className="p-2">
                <PaperList
                  items={summary?.recentReads?.slice(pickUp ? 1 : 0)}
                  empty="Nothing yet."
                  onOpenPaper={handleOpenPaper}
                />
              </div>
            </div>
          </div>

          {/* Right: momentum + age dist + unread */}
          <div className="flex flex-col gap-2">
            <div className="rx-pane animate-stagger-fade" style={{ animationDelay: '360ms' }}>
              <div className="rx-pane-header">
                <div className="rx-label">Momentum</div>
              </div>
              <div className="grid gap-3 p-3">
                <div>
                  <div className="mb-2 text-xs font-medium text-muted">In progress</div>
                  <PaperList
                    items={summary?.momentum?.staleReading}
                    empty="Nothing in progress."
                    onOpenPaper={handleOpenPaper}
                  />
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-muted">Recently added</div>
                  <PaperList
                    items={summary?.momentum?.recentlyAdded}
                    empty="Nothing yet."
                    onOpenPaper={handleOpenPaper}
                    dateField="created_at"
                  />
                </div>
              </div>
            </div>

            {summary?.unreadPapers?.length > 0 && (
              <div className="rx-pane animate-stagger-fade" style={{ animationDelay: '390ms' }}>
                <div className="rx-pane-header">
                  <div className="rx-label">Never opened</div>
                </div>
                <div className="p-2">
                  <PaperList
                    items={summary.unreadPapers}
                    empty=""
                    onOpenPaper={handleOpenPaper}
                    dateField="created_at"
                  />
                </div>
              </div>
            )}

            {summary?.ageDistribution?.length > 0 && (
              <div className="rx-pane animate-stagger-fade" style={{ animationDelay: '420ms' }}>
                <div className="rx-pane-header">
                  <div className="rx-label">Paper age</div>
                </div>
                <div className="p-3">
                  <AgeDistribution rows={summary.ageDistribution} />
                </div>
              </div>
            )}
          </div>

        </section>

      </div>
    </div>
  )
}
