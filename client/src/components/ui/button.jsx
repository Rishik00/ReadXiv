import { cn } from '../../lib/utils';

const variants = {
  default: 'bg-foreground text-background hover:opacity-90 shadow-md hover:shadow-lg transition-shadow',
  secondary: 'bg-surface text-foreground border-2 border-border hover:bg-background shadow-md hover:shadow-lg transition-shadow',
  ghost: 'bg-transparent text-muted hover:bg-surface hover:text-foreground',
  outline: 'bg-transparent text-foreground border-2 border-border hover:bg-surface shadow-md hover:shadow-lg transition-shadow',
};

const sizes = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  icon: 'h-8 w-8',
};

export function Button({
  className,
  variant = 'default',
  size = 'md',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

