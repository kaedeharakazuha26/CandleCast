import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { getSocket } from "../services/realtime";

type Toast = {
  id: string;
  message: string;
  symbol: string;
  at: number;
};

export function AlertToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const onAlert = (payload: { id: string; message: string; symbol: string; triggeredAt: string }) => {
      setToasts((current) => [
        { id: `${payload.id}-${Date.now()}`, message: payload.message, symbol: payload.symbol, at: Date.now() },
        ...current,
      ].slice(0, 4));
    };
    socket.on("alert", onAlert);
    return () => {
      socket.off("alert", onAlert);
    };
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((current) => current.slice(0, -1)), 15_000);
    return () => clearTimeout(timer);
  }, [toasts]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto rounded-xl border border-accent/30 bg-panel/95 p-3 shadow-2xl backdrop-blur"
        >
          <div className="flex items-start gap-2">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-accent">Alert triggered</div>
              <p className="mt-1 break-words text-xs leading-5 text-ink">{toast.message}</p>
            </div>
            <button
              aria-label="Dismiss alert"
              className="rounded p-1 text-mute hover:bg-white/5 hover:text-ink"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
