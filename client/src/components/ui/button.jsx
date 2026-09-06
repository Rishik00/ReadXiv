import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const variants = {
  primary: 'border border-control-border bg-transparent text-text hover:border-accent',
  secondary: 'border border-divider bg-transparent text-text hover:border-control-border',
  secondaryStrong: 'border border-control-border bg-transparent text-text hover:border-accent',
  ghost: 'bg-transparent text-text-muted hover:bg-surface-1 hover:text-text',
  destructive: 'bg-transparent text-danger hover:underline',
}

const sizes = {
  small: 'min-h-8 px-3 text-very-small',
  medium: 'min-h-9 px-4 text-small',
  large: 'min-h-10 px-5 text-small',
  link: 'min-h-8 px-0 text-very-small',
  icon: 'h-9 w-9',
}

export const Button = forwardRef(function Button(
  { className, variant = 'primary', size = 'medium', type = 'button', ...props },
  ref
) {
  return <button ref={ref} type={type} className={cn(
    'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className
  )} {...props} />
})

