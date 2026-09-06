import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

export function Modal({ as: Component = 'section', open, onClose, className, scrimClassName, children, ...props }) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    const focusFirst = requestAnimationFrame(() => {
      if (!panelRef.current?.contains(document.activeElement)) {
        panelRef.current?.querySelector(focusableSelector)?.focus()
      }
    })
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(panelRef.current?.querySelectorAll(focusableSelector) || [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(focusFirst)
      window.removeEventListener('keydown', onKeyDown, true)
      requestAnimationFrame(() => previouslyFocused?.focus?.())
    }
  }, [open])

  if (!open) return null
  return <div
    className={cn('fixed inset-0 z-[120] flex items-center justify-center bg-[var(--overlay-scrim)] p-4', scrimClassName)}
    onMouseDown={(event) => {
      if (event.button === 0 && event.target === event.currentTarget) onClose?.()
    }}
  >
    <Component
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      className={cn('w-full rounded-lg border border-divider bg-surface-1 shadow-elevation-3', className)}
      onMouseDown={(event) => event.stopPropagation()}
      {...props}
    >
      {children}
    </Component>
  </div>
}

export function ModalHeader({ className, ...props }) {
  return <header className={cn('border-b border-divider px-5 py-4', className)} {...props} />
}

export function ModalContent({ className, ...props }) {
  return <div className={cn('p-5', className)} {...props} />
}

export function ModalFooter({ className, ...props }) {
  return <footer className={cn('flex justify-end gap-2 border-t border-divider px-5 py-3', className)} {...props} />
}
