import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const MINUTES_PER_PAGE = 4
const DEFAULT_MINUTES_PER_PAPER = 20

function formatReadingEstimate(totalMinutes) {
  if (totalMinutes < 60) return `~${totalMinutes} min`
  const hours = Math.round(totalMinutes / 60 * 10) / 10
  return hours >= 1 ? `~${hours} hour${hours === 1 ? '' : 's'}` : `~${Math.round(totalMinutes)} min`
}

function daysUntil(deadlineStr) {
  if (!deadlineStr) return null
  const d = new Date(deadlineStr)
  if (isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d - today) / 864e5)
}

function SortableQueueItem({ paper, index, isReadNext, onOpen, onRemove, getStatusColor }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: paper.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const days = daysUntil(paper.deadline)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[auto_1fr_auto_auto] gap-4 py-5 px-6 border-b-2 border-border last:border-0 items-center group transition-colors ${
        isDragging ? 'opacity-70 bg-surface z-10' : ''
      } ${isReadNext ? 'bg-secondary/10 border-l-4 border-l-secondary -ml-px pl-6' : 'hover:bg-foreground/[0.02]'}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1.5 -ml-1 rounded text-muted hover:text-foreground touch-none"
        aria-label="Drag to reorder"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
          <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
        </svg>
      </div>
      <div
        onClick={() => onOpen(paper)}
        className="cursor-pointer min-w-0"
      >
        {isReadNext && (
          <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-secondary mb-1.5">
            Read next
          </span>
        )}
        <div className="text-sm font-medium leading-snug group-hover:text-secondary transition-colors line-clamp-2">
          {paper.title}
        </div>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className="text-[11px] text-muted font-mono opacity-50">{paper.id}</span>
          {paper.year && <span className="text-[11px] text-muted">{paper.year}</span>}
          {days !== null && days <= 7 && (
            <span className={`text-[11px] font-medium ${days <= 0 ? 'text-red-400' : 'text-secondary'}`}>
              {days <= 0 ? 'Overdue' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`}
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(paper.status)}`}>
            {paper.status || 'queued'}
          </span>
        </div>
      </div>
      <div className="text-xs text-muted">
        {paper.page_count
          ? `${paper.page_count} pp`
          : '—'}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(paper) }}
          className="text-xs text-foreground font-medium hover:text-secondary transition-colors"
        >
          Open
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(paper) }}
          className="text-xs text-red-400 font-medium hover:text-red-300 transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

export default function Queue({ setPage, setSelectedPaper }) {
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('manual')
  const [blockingPapers, setBlockingPapers] = useState([])

  const fetchQueue = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/reading-queue')
      setQueue(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to fetch queue', err)
      setQueue([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  // Papers with deadlines in next 7 days (from library, not just queue)
  useEffect(() => {
    let cancelled = false
    axios.get('/api/papers')
      .then(({ data }) => {
        if (cancelled) return
        const papers = Array.isArray(data) ? data : []
        const blocking = papers
          .filter((p) => p.deadline && daysUntil(p.deadline) !== null && daysUntil(p.deadline) <= 7)
          .sort((a, b) => {
            const da = new Date(a.deadline).getTime()
            const db = new Date(b.deadline).getTime()
            return da - db
          })
        setBlockingPapers(blocking)
      })
      .catch(() => setBlockingPapers([]))
    return () => { cancelled = true }
  }, [queue])

  const handleReorder = async (orderedIds) => {
    try {
      const { data } = await axios.patch('/api/reading-queue/reorder', {
        paperIds: orderedIds,
      })
      setQueue(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to reorder', err)
    }
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = queue.findIndex((p) => p.id === active.id)
    const newIndex = queue.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(queue, oldIndex, newIndex)
    setQueue(reordered)
    handleReorder(reordered.map((p) => p.id))
  }

  const handleRemove = async (paper) => {
    try {
      await axios.delete(`/api/reading-queue/${paper.id}`)
      setQueue((prev) => prev.filter((p) => p.id !== paper.id))
    } catch (err) {
      console.error('Failed to remove from queue', err)
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const getStatusColor = (status) => {
    switch (status) {
      case 'done':
        return 'border-green-500/50 text-green-400 bg-green-500/10'
      case 'reading':
        return 'border-secondary/50 text-secondary bg-secondary/10'
      default:
        return 'border-border text-muted bg-surface'
    }
  }

  const openPaper = (paper) => {
    setSelectedPaper(paper)
    setPage('reader')
  }

  const totalMinutes = queue.reduce((acc, p) => {
    if (p.page_count) return acc + p.page_count * MINUTES_PER_PAGE
    return acc + DEFAULT_MINUTES_PER_PAPER
  }, 0)

  const sortedQueue =
    sortBy === 'manual'
      ? [...queue]
      : sortBy === 'deadline'
        ? [...queue].sort((a, b) => {
            if (!a.deadline) return 1
            if (!b.deadline) return -1
            return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
          })
        : sortBy === 'citation'
          ? [...queue].sort((a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0))
          : sortBy === 'recency'
            ? [...queue].sort((a, b) => {
                const da = new Date(a.created_at || 0).getTime()
                const db = new Date(b.created_at || 0).getTime()
                return db - da
              })
            : [...queue]

  // When applying smart sort, update server order
  const applySort = () => {
    if (sortBy === 'manual') return
    handleReorder(sortedQueue.map((p) => p.id))
  }

  if (loading) {
    return (
      <div className="p-8 max-w-[880px] mx-auto animate-fade-in">
        <div className="rounded-xl border-2 border-border bg-surface overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="h-6 w-1/3 rounded skeleton-shimmer" />
            <div className="h-4 w-1/2 rounded skeleton-shimmer" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded skeleton-shimmer" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-[880px] mx-auto font-sans animate-view-fade">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3 text-sm font-medium">
          <span className="text-muted cursor-pointer hover:text-foreground transition-colors" onClick={() => setPage('home')}>
            Home
          </span>
          <span className="text-muted/50">/</span>
          <span className="text-muted cursor-pointer hover:text-foreground transition-colors" onClick={() => setPage('shelf')}>
            Shelf
          </span>
          <span className="text-muted/50">/</span>
          <span className="text-foreground">Reading Queue</span>
        </div>
        <div className="text-secondary text-sm font-medium">
          {queue.length} {queue.length === 1 ? 'paper' : 'papers'}
          {queue.length > 0 && (
            <span className="text-muted font-normal ml-1">
              · {formatReadingEstimate(totalMinutes)} of reading
            </span>
          )}
        </div>
      </div>

      {blockingPapers.length > 0 && (
        <div className="claude-card p-5 mb-6 border-secondary/30">
          <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
            Papers blocking your current work
          </h3>
          <div className="space-y-2">
            {blockingPapers.map((p) => (
              <div
                key={p.id}
                onClick={() => openPaper(p)}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-foreground/5 cursor-pointer transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium line-clamp-1">{p.title}</div>
                  <div className="text-[11px] text-muted">
                    Due {p.deadline}
                    {daysUntil(p.deadline) <= 0 && (
                      <span className="text-red-400 ml-2">Overdue</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openPaper(p) }}
                  className="text-xs text-secondary font-medium hover:underline"
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4 items-center mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted uppercase">Sort by</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-surface border-2 border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-secondary/50"
          >
            <option value="manual">Manual order</option>
            <option value="deadline">Deadline</option>
            <option value="citation">Citation count</option>
            <option value="recency">Recency</option>
          </select>
          {sortBy !== 'manual' && (
            <button
              type="button"
              onClick={applySort}
              className="text-xs font-medium text-secondary hover:underline"
            >
              Apply to queue
            </button>
          )}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="claude-card p-20 text-center text-muted">
          <p className="mb-2">Your reading queue is empty.</p>
          <p className="text-sm">
            Add papers from the <button type="button" className="text-secondary hover:underline" onClick={() => setPage('shelf')}>Shelf</button> to build your queue.
          </p>
        </div>
      ) : (
        <div className="claude-card overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 p-4 px-6 bg-background/50 border-b-2 border-border items-center">
            <div className="w-6" />
            <div className="text-xs font-semibold text-muted/60">Title</div>
            <div className="text-xs font-semibold text-muted/60">Pages</div>
            <div className="text-xs font-semibold text-muted/60">Actions</div>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortedQueue.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {sortedQueue.map((paper, idx) => (
                <SortableQueueItem
                  key={paper.id}
                  paper={paper}
                  index={idx}
                  isReadNext={idx === 0}
                  onOpen={openPaper}
                  onRemove={handleRemove}
                  getStatusColor={getStatusColor}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  )
}
