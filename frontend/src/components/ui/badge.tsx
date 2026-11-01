import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type Tone = "bull" | "bear" | "muted" | "accent" | "warn";

const tones: Record<Tone, string> = {
  bull: "border-bull/30 bg-bull/10 text-bull",
  bear: "border-bear/30 bg-bear/10 text-bear",
  muted: "border-white/10 bg-white/5 text-mute",
  accent: "border-accent/30 bg-accent/10 text-accent",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
};

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "bull" | "bear";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[10px] font-medium uppercase tracking-widest text-mute">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-sm text-ink",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
        )}
      >
        {value}
      </div>
      {hint != null && <div className="mt-0.5 truncate text-[11px] text-mute">{hint}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition disabled:opacity-50",
        checked
          ? "border-accent/40 bg-accent/10 text-ink"
          : "border-white/10 bg-secondary/60 text-mute hover:border-white/20 hover:text-ink",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", checked ? "bg-accent" : "bg-white/20")} />
      {label}
    </button>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel p-4", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {typeof title === "string" ? <h3 className="text-sm font-semibold">{title}</h3> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
