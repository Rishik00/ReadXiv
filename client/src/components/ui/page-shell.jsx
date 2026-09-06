import { cn } from '../../lib/utils'

const widths = {
  small: 'max-w-content-small',
  medium: 'max-w-content-medium',
  large: 'max-w-content-large',
  extraLarge: 'max-w-content-extra-large',
  reading: 'max-w-reading',
}

export function PageShell({ as: Component = 'main', width = 'large', className, children, ...props }) {
  return <Component className={cn(
    'mx-auto w-full px-[var(--page-gutter)] py-8 sm:py-10',
    widths[width],
    className
  )} {...props}>{children}</Component>
}

export function PageHeader({ title, description, actions, className }) {
  return <header className={cn(
    'mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-divider pb-6',
    className
  )}>
    <div className="min-w-0">
      <h1 className="font-display text-extra-large text-text">{title}</h1>
      {description && <p className="mt-2 max-w-reading text-medium text-text-muted">{description}</p>}
    </div>
    {actions && <div className="shrink-0">{actions}</div>}
  </header>
}
