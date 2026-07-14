import { useEffect, useRef, useState } from 'react'
import { createShapeId, Tldraw, toRichText } from 'tldraw'
import 'tldraw/tldraw.css'

function GlobalCanvas({ open, onClose, pendingSource, onSourceConsumed, onOpenSource }) {
  const [pendingLeader, setPendingLeader] = useState(false)
  const [editor, setEditor] = useState(null)
  const [selectedSource, setSelectedSource] = useState(null)
  const selectionCleanupRef = useRef(null)

  useEffect(() => () => selectionCleanupRef.current?.(), [])

  useEffect(() => {
    if (!open || !editor || !pendingSource?.paperId) return
    const bounds = editor.getViewportPageBounds()
    const shapeId = createShapeId()
    editor.createShape({
      id: shapeId,
      type: 'note',
      x: bounds.center.x - 110,
      y: bounds.center.y - 110,
      props: {
        color: 'yellow',
        richText: toRichText(`${pendingSource.paperTitle}\n\nPage ${pendingSource.page}`),
      },
      meta: { readxivSource: pendingSource },
    })
    editor.select(shapeId)
    onSourceConsumed?.()
  }, [editor, onSourceConsumed, open, pendingSource])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setPendingLeader(false)
        onClose()
        return
      }

      if (pendingLeader) {
        const k = e.key.toLowerCase()
        if (k === 'h') {
          e.preventDefault()
          e.stopPropagation()
          setPendingLeader(false)
          onClose()
        } else {
          setPendingLeader(false)
        }
        return
      }

      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName?.toLowerCase()
        const isInput = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable
        if (!isInput) {
          e.preventDefault()
          e.stopPropagation()
          setPendingLeader(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onClose, pendingLeader])

  useEffect(() => {
    if (!pendingLeader) return
    const t = setTimeout(() => setPendingLeader(false), 2000)
    return () => clearTimeout(t)
  }, [pendingLeader])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <button
        type="button"
        onClick={onClose}
        className="absolute bottom-20 left-4 z-[101] flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium transition-colors border border-neutral-600 shadow-lg"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
        </svg>
        Exit
      </button>
      {pendingLeader && (
        <div className="absolute bottom-20 left-24 z-[101] px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow-lg">
          Leader... (h = home)
        </div>
      )}
      {selectedSource && (
        <button
          type="button"
          onClick={() => onOpenSource?.(selectedSource)}
          className="absolute bottom-20 right-4 z-[101] px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium transition-colors border border-neutral-600 shadow-lg"
        >
          Open {selectedSource.paperTitle || 'source'} · p. {selectedSource.page}
        </button>
      )}
      <div className="w-full h-full">
        <Tldraw
          persistenceKey="readxiv-global-canvas"
          forceMobile={false}
          onMount={(editor) => {
            editor.user.updateUserPreferences({ colorScheme: 'dark' })
            setEditor(editor)
            selectionCleanupRef.current?.()
            const updateSelectedSource = () => {
              const source = editor.getSelectedShapes()
                .map((shape) => shape.meta?.readxivSource)
                .find(Boolean)
              setSelectedSource(source || null)
            }
            updateSelectedSource()
            selectionCleanupRef.current = editor.store.listen(updateSelectedSource)
          }}
        />
      </div>
    </div>
  )
}

export default GlobalCanvas
