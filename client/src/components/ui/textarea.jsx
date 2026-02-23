import { cn } from '../../lib/utils';

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none placeholder:text-muted focus:ring-1 focus:ring-secondary/30',
        className
      )}
      {...props}
    />
  );
}

