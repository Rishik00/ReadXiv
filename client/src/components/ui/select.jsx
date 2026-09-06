import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const chevron = {
  backgroundImage:
    'url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'292.4\' height=\'292.4\'%3E%3Cpath fill=\'%23737373\' d=\'M287 69.4a17.6 17.6 0 0 0-13-5.4H18.4c-5 0-9.3 1.8-12.9 5.4A17.6 17.6 0 0 0 0 82.2c0 5 1.8 9.3 5.4 12.9l128 127.9c3.6 3.6 7.8 5.4 12.8 5.4s9.2-1.8 12.8-5.4L287 95c3.5-3.5 5.4-7.8 5.4-12.8 0-5-1.9-9.2-5.5-12.8z\'/%3E%3C/svg%3E")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.5rem top 50%',
  backgroundSize: '0.5rem auto',
}

const variants = {
  default: 'rounded-md border py-2 font-medium',
  strong: 'rounded-lg border-2 py-2 font-medium',
  strongComfortable: 'rounded-lg border-2 py-2.5 font-normal',
}

export const Select = forwardRef(function Select({ className, style, variant = 'default', ...props }, ref) {
  return <select ref={ref} className={cn(
    'cursor-pointer appearance-none border-control-border bg-surface-1 pl-3 pr-8 text-small text-text transition-colors focus-visible:border-focus-ring disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    className
  )} style={{ ...chevron, ...style }} {...props} />
})
