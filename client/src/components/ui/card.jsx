import { cn } from '../../lib/utils';

const variants = {
  default: 'rounded-lg border-2 border-divider',
  error: 'rounded-xl border border-divider shadow-elevation-1',
}

export function Card({ className, variant = 'default', ...props }) {
  return (
    <div
      className={cn(
        'bg-surface-1',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('border-b border-divider px-4 py-3', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-4', className)} {...props} />;
}

