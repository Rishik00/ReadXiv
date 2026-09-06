import { cn } from '../../lib/utils';

export function Badge({ className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-very-small font-medium text-muted',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

