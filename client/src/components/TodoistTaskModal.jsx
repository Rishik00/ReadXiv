import { useEffect, useState } from 'react'
import axios from 'axios'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Modal, ModalContent } from './ui/modal'
import { Select } from './ui/select'

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
    <Modal open onClose={onClose} className="max-w-md overflow-hidden animate-modal-in" scrimClassName="animate-backdrop-in" aria-labelledby="todoist-modal-title">
        <ModalContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h3 id="todoist-modal-title" className="text-small font-semibold text-foreground">
              {isEdit ? 'Edit schedule' : 'Schedule'}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="-mt-1 text-large leading-none"
              aria-label="Close"
            >
              x
            </Button>
          </div>
          <div>
            <div className="text-small font-medium text-foreground line-clamp-2">{paper.title}</div>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-very-small font-medium border ${getStatusColor(paper.status)}`}
              >
                {paper.status || 'queued'}
              </span>
              <span className="text-very-small text-muted font-mono">{paper.id}</span>
            </div>
          </div>
          {loadingDefaults ? (
            <p className="text-very-small text-muted py-2">Loading task...</p>
          ) : (
            <>
              <div>
                <label className="text-very-small text-muted uppercase block mb-1.5">Due date</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  variant="strong"
                />
                {isEdit && (
                  <p className="text-very-small text-muted mt-1">Clear the date and save to remove the due date in Todoist.</p>
                )}
              </div>
              <div>
                <label className="text-very-small text-muted uppercase block mb-1.5">Priority</label>
                <Select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  variant="strong"
                  className="w-full"
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
          <div className="flex gap-3 pt-1">
            <Button
              size="large"
              onClick={handleSave}
              disabled={saving || loadingDefaults}
              className="flex-1"
            >
              {saving ? 'Saving...' : isEdit ? 'Update schedule' : 'Add to Todoist'}
            </Button>
            <Button
              variant="ghost"
              size="large"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </ModalContent>
    </Modal>
  )
}
