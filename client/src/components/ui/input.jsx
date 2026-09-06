import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const variants = {
  default: 'rounded-md border px-3 py-2',
  comfortable: 'rounded-md border px-3 py-2.5',
  strong: 'rounded-lg border-2 px-3 py-2.5',
}

export const Input = forwardRef(function Input({ className, type = 'text', variant = 'default', ...props }, ref) {
  return <input ref={ref} type={type} className={cn(
    'w-full border-control-border bg-canvas text-small text-text placeholder:text-text-muted focus-visible:border-focus-ring disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    className
  )} {...props} />
})
