import { cn } from "../../utils/cn";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-white/10 bg-secondary px-3 text-sm text-ink outline-none focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-lg border border-white/10 bg-secondary px-2 text-sm text-ink outline-none focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
