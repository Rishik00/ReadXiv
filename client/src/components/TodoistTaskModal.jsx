import { useEffect, useState } from 'react'
import axios from 'axios'

export function paperHasTodoistTask(paper) {
  return Boolean(paper?.todoist_task_id && String(paper.todoist_task_id).trim())
}

/** Todoist API: 4 = P1 (urgent) ... 1 = normal */
const PRIORITY_OPTIONS = [
  { value: '4', label: 'P1 - Urgent' },
  { value: '3', label: 'P2 - High' },
  { value: '2', label: 'P3 - Medium' },
  { value: '1', label: 'P4 - Normal' },
]

export default function TodoistTaskModal({ paper, onClose, onCreated, getStatusColor, addToast, onUpdated }) {
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('1')
  const [loadingDefaults, setLoadingDefaults] = useState(false)
  const [saving, setSaving] = useState(false)
  const isEdit = paperHasTodoistTask(paper)

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!isEdit) {
      setDueDate('')
      setPriority('1')
      setLoadingDefaults(false)
      return
    }
    let cancelled = false
    setLoadingDefaults(true)
    axios
      .get(`/api/todoist/papers/${paper.id}/task`)
      .then(({ data }) => {
        if (cancelled) return
        setPriority(String(data.priority ?? 1))
        setDueDate(data.due_date || '')
      })
      .catch(() => {
        if (!cancelled) {
          setDueDate('')
          setPriority('1')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDefaults(false)
      })
    return () => {
      cancelled = true
    }
  }, [paper.id, isEdit])

  const handleSave = async () => {
    setSaving(true)
    try {
      const pr = Number(priority)
      if (isEdit) {
        await axios.patch(`/api/todoist/papers/${paper.id}/task`, {
          priority: pr,
          due_date: dueDate.trim() || null,
        })
        addToast?.('Edited in Todoist', 'success')
        onUpdated?.()
      } else {
        const payload = { priority: pr }
        if (dueDate.trim()) payload.due_date = dueDate.trim()
        const { data } = await axios.post(`/api/todoist/papers/${paper.id}`, payload)
        if (data?.taskId) onCreated?.(data.taskId)
        addToast?.('Added to Todoist', 'success')
      }
      onClose()
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Todoist request failed'
      window.alert(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-surface border-2 border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-sm font-semibold text-foreground">
              {isEdit ? 'Edit schedule' : 'Schedule'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-foreground text-xl leading-none -mt-1"
              aria-label="Close"
            >
              x
            </button>
          </div>
          <div>
            <div className="text-sm font-medium text-foreground line-clamp-2">{paper.title}</div>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(paper.status)}`}
              >
                {paper.status || 'queued'}
              </span>
              <span className="text-[11px] text-muted font-mono">{paper.id}</span>
            </div>
          </div>
          {loadingDefaults ? (
            <p className="text-xs text-muted py-2">Loading task...</p>
          ) : (
            <>
              <div>
                <label className="text-[10px] text-muted uppercase block mb-1.5">Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-background border-2 border-border rounded-lg px-3 py-2 text-sm"
                />
                {isEdit && (
                  <p className="text-[10px] text-muted mt-1">Clear the date and save to remove the due date in Todoist.</p>
                )}
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase block mb-1.5">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-background border-2 border-border rounded-lg px-3 py-2 text-sm"
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loadingDefaults}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-secondary text-[var(--button-on-secondary)] hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEdit ? 'Update schedule' : 'Add to Todoist'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
