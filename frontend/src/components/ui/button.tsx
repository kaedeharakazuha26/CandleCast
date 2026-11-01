import { cn } from "../../utils/cn";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" }) {
  const styles = {
    primary: "bg-accent text-white hover:bg-blue-500",
    ghost: "bg-white/5 text-ink hover:bg-white/10",
    danger: "bg-bear/20 text-bear hover:bg-bear/30",
    outline: "border border-white/15 bg-transparent hover:bg-white/5",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  );
}
