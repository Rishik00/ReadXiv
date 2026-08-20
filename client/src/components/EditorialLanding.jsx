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

function formatShortDate(value) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function paperMeta(paper) {
  return [paper?.year, paper?.authors].filter(Boolean).join(' · ') || paper?.id || ''
}

/* Reads-over-time area chart. The SVG paths live in a 0..100 viewBox
   (preserveAspectRatio none) and the hover overlays are HTML positioned by the
   same percentages, so cursor/dot/tooltip always line up regardless of width. */
function ReadsChart({ activity, thisWeek }) {
  const [hover, setHover] = useState(null)
  const safeActivity = useMemo(
    () => (Array.isArray(activity) ? activity.filter((day) => day && typeof day === 'object') : []),
    [activity]
  )
  const n = safeActivity.length
  const vals = useMemo(() => safeActivity.map((day) => Number(day.views || 0)), [safeActivity])
  const max = Math.max(1, ...vals)
  const padTop = 12
  const padBottom = 6
  const xAt = (i) => (n <= 1 ? 0 : (i / (n - 1)) * 100)
  const yAt = (v) => padTop + (1 - v / max) * (100 - padTop - padBottom)

  const { line, area } = useMemo(() => {
    const pts = vals.map((v, i) => `${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`)
    const l = 'M ' + pts.join(' L ')
    return { line: l, area: `${l} L 100 100 L 0 100 Z` }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals, max])

  const ticks = useMemo(() => {
    if (!n) return []
    return [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]
      .map((i) => formatShortDate(safeActivity[i]?.date))
  }, [safeActivity, n])

  const onMove = (event) => {
    if (!n) {
      setHover(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const rel = (event.clientX - rect.left) / rect.width
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))))
  }

  return (
    <div className="editorial-sect">
      <div className="editorial-sect-head">
        <div>
          <div className="editorial-sect-title">Papers opened</div>
          <div className="editorial-sect-sub">per day · last 30 days</div>
        </div>
        <div className="editorial-sect-stat">
          <span className="editorial-fig">{thisWeek}</span>
          <div className="editorial-sect-sub">opened · past 7 days</div>
        </div>
      </div>
      <div className="editorial-chart">
        <div className="editorial-chart-plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="editorial-reads-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--secondary)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--secondary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line className="editorial-chart-base" x1="0" y1="94" x2="100" y2="94" vectorEffect="non-scaling-stroke" />
            <path className="editorial-chart-area" d={area} />
            <path className="editorial-chart-line" d={line} vectorEffect="non-scaling-stroke" />
          </svg>
          {hover != null && safeActivity[hover] && (
            <>
              <span className="editorial-chart-cursor" style={{ left: `${xAt(hover)}%` }} />
              <span className="editorial-chart-dot" style={{ left: `${xAt(hover)}%`, top: `${yAt(vals[hover])}%` }} />
              <span className="editorial-chart-pop" style={{ left: `${xAt(hover)}%`, top: `${yAt(vals[hover])}%` }}>
                {vals[hover]} opened · {formatShortDate(safeActivity[hover].date)}
              </span>
            </>
          )}
          {n > 0 ? (
            <span className="editorial-chart-hit" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
          ) : (
            <span className="editorial-chart-empty">No reading activity yet.</span>
          )}
        </div>
        <div className="editorial-chart-xticks">
          {ticks.map((tick, index) => <span key={index}>{tick}</span>)}
        </div>
      </div>
    </div>
  )
}

export default function EditorialLanding({
  summary,
  fallbackContinue,
  recentPapers = [],
  openPaper,
  dimmed = false,
  view = 'now',
  onViewChange,
  selectedPaperId,
  onPaperHover,
}) {
  const continuePaper = summary?.continuePaper || fallbackContinue
  const consistency = summary?.consistency || {}
  const totals = summary?.totals || {}
  const readingTime = summary?.readingTime || {}
  const history = consistency.readsByDay || []
  const activity = history.slice(-30)

  const currentPage = Math.max(1, Number(continuePaper?.current_page) || 1)
  const totalPages = Math.max(currentPage, Number(continuePaper?.total_pages) || currentPage)
  const progress = totalPages > 1 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0

  const totalActiveDays = Number(consistency.totalActiveDays || 0)
  const jumpBack = recentPapers
    .filter((paper) => paper.id !== continuePaper?.id && Number(paper.important) === 1)
    .slice(0, 10)

  // keep the keyboard-selected paper visible as you arrow through Important papers
  const jumpListRef = useRef(null)
  useEffect(() => {
    if (view !== 'now' || !selectedPaperId) return
    const el = jumpListRef.current?.querySelector(`[data-paper-id="${selectedPaperId}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedPaperId, view])

  const reading = Number(totals.readingNow || 0)
  const writing = Number(totals.writingNow || 0)
  const done = Number(totals.completed || 0)
  const total = Number(totals.totalPapers || 0)
  const queued = Math.max(0, total - reading - writing - done)
  const split = [
    { key: 'reading', label: 'Reading', n: reading },
    { key: 'writing', label: 'Writing', n: writing },
    { key: 'done', label: 'Done', n: done },
    { key: 'queued', label: 'Queued', n: queued },
  ]

  return (
    <section className={`editorial-desk ${dimmed ? 'is-dimmed' : ''}`} aria-label="Reading desk">
      <div className="editorial-deskhead">
        <span className="editorial-marq">
          {view === 'now' && <span className="editorial-marq-dot" aria-hidden="true" />}
          {view === 'now' ? 'Continue reading' : 'Your library, in numbers'}
        </span>
        <div className="editorial-switch" role="tablist" aria-label="Desk view">
          <button type="button" role="tab" aria-selected={view === 'now'} data-on={view === 'now'} onClick={() => onViewChange?.('now')}>Reading</button>
          <button type="button" role="tab" aria-selected={view === 'stats'} data-on={view === 'stats'} onClick={() => onViewChange?.('stats')}>Stats</button>
        </div>
      </div>

      <div className="editorial-panel">
        {view === 'now' ? (
          <div className="editorial-now">
            {continuePaper ? (
              <button
                type="button"
                className={`editorial-hero ${selectedPaperId === continuePaper.id ? 'is-selected' : ''}`}
                onMouseEnter={() => onPaperHover?.(continuePaper.id)}
                onClick={() => openPaper?.(continuePaper)}
              >
                <span className="editorial-hero-title">{continuePaper.title || continuePaper.id}</span>
                <span className="editorial-hero-meta">{paperMeta(continuePaper)}</span>
                <span className="editorial-hero-bar"><i style={{ width: `${progress}%` }} /></span>
                <span className="editorial-hero-foot">
                  <span className="editorial-counter">
                    {totalPages > 1 ? <>page {currentPage} <span className="sep">/</span> {totalPages}</> : 'Ready to continue'}
                  </span>
                  <span className="editorial-resume">Resume →</span>
                </span>
              </button>
            ) : (
              <div className="editorial-hero editorial-hero-empty">
                <span className="editorial-hero-title">Your next paper will appear here.</span>
              </div>
            )}

            <div className="editorial-jump">
              <span className="editorial-cap">Important papers</span>
              <div className="editorial-jump-list" ref={jumpListRef}>
                {jumpBack.length ? jumpBack.map((paper, index) => (
                  <button
                    key={paper.id}
                    type="button"
                    data-paper-id={paper.id}
                    className={`editorial-jrow ${selectedPaperId === paper.id ? 'is-selected' : ''}`}
                    onMouseEnter={() => onPaperHover?.(paper.id)}
                    onClick={() => openPaper?.(paper)}
                  >
                    <span className="editorial-jrow-n">{String(index + 1).padStart(2, '0')}</span>
                    {Number(paper.important) === 1 && <span className="editorial-jrow-star" aria-label="Important">★</span>}
                    <span className="editorial-jrow-t">{paper.title || paper.id}</span>
                    <time>{relativeTime(paper.last_accessed_at || paper.created_at)}</time>
                  </button>
                )) : <span className="editorial-empty-copy">Mark a paper important and it will appear here.</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="editorial-stats-view">
            <div className="editorial-tiles">
              <div className="editorial-tile editorial-tile-accent">
                <span className="editorial-fig">{formatHours(readingTime.totalSeconds)}<span className="editorial-u">h</span></span>
                <span className="editorial-cap">Time read</span>
                <span className="editorial-tile-sub">+{formatHours(readingTime.thisWeekSeconds)}h this week</span>
              </div>
              <div className="editorial-tile">
                <span className="editorial-fig">{consistency.currentStreak || 0}<span className="editorial-u">d</span></span>
                <span className="editorial-cap">Streak</span>
                <span className="editorial-tile-sub">best {consistency.longestStreak || 0}d</span>
              </div>
              <div className="editorial-tile">
                <span className="editorial-fig">{totalActiveDays}</span>
                <span className="editorial-cap">Total active days</span>
                <span className="editorial-tile-sub">all time</span>
              </div>
            </div>

            <ReadsChart activity={activity} thisWeek={totals.touchedThisWeek || 0} />

            <div className="editorial-sect">
              <div className="editorial-sect-head">
                <div>
                  <div className="editorial-sect-title">Library by status</div>
                  <div className="editorial-sect-sub">{total} papers total</div>
                </div>
              </div>
              <div className="editorial-splitbar">
                {split.map((seg) => seg.n > 0 && (
                  <span key={seg.key} className={`s-${seg.key}`} style={{ flex: seg.n }} title={`${seg.label}: ${seg.n}`} />
                ))}
              </div>
            <div className="editorial-legend editorial-legend--four">
                {split.map((seg) => (
                  <div key={seg.key} className="editorial-leg">
                    <span className={`editorial-leg-dot s-${seg.key}`} />
                    <span>
                      <span className="editorial-fig">{seg.n}</span>
                      <span className="editorial-cap">{seg.label}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
