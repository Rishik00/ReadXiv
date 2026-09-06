import { cn } from '../../lib/utils'

export function SettingRow({ as: Component = 'div', title, description, className, children, ...props }) {
  return <Component className={cn(
    'flex flex-col gap-4 rounded-lg border border-divider bg-[color-mix(in_srgb,var(--surface-2)_50%,transparent)] px-6 py-5 transition-colors hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--divider))] sm:flex-row sm:items-center sm:justify-between',
    className
  )} {...props}>
    <div className="min-w-0">
      <div className="text-small font-semibold text-text">{title}</div>
      {description && <div className="mt-1 text-small text-text-muted">{description}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </Component>
}
