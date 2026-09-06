import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(
    'w-full rounded-md border border-control-border bg-canvas px-3 py-2 text-small text-text placeholder:text-text-muted focus-visible:border-focus-ring disabled:cursor-not-allowed disabled:opacity-50',
    className
  )} {...props} />
})

