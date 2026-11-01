import { NavLink, Outlet } from "react-router-dom";
import { Activity, BarChart3, History, LayoutDashboard, Settings, Star } from "lucide-react";
import { AlertToaster } from "../components/AlertToaster";
import { MarketStrip } from "../components/MarketStrip";
import { useRealtimeStatus } from "../hooks/useRealtimeStatus";
import { cn } from "../utils/cn";
import { useTerminal } from "../store/terminal";

const links = [
  { to: "/markets", label: "Markets", icon: BarChart3 },
  { to: "/", label: "Terminal", icon: LayoutDashboard },
  { to: "/backtesting", label: "Backtesting", icon: Activity },
  { to: "/history", label: "History", icon: History },
  { to: "/watchlist", label: "Watchlist", icon: Star },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const live = useTerminal((s) => s.live);
  useRealtimeStatus();
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-bg/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/15 font-mono text-sm font-semibold text-accent">
              C
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.16em]">CANDLECAST</div>
              <div className="hidden text-[11px] text-mute sm:block">
                Kronos-base candle forecasts · research only, not trading advice
              </div>
            </div>
          </NavLink>
          <nav className="hidden flex-wrap items-center gap-1 lg:flex">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-mute transition hover:bg-white/5 hover:text-ink",
                    isActive && "bg-white/10 text-ink",
                  )
                }
              >
                <link.icon className="h-3.5 w-3.5" />
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                live ? "bg-bull shadow-[0_0_8px_rgba(0,192,135,0.8)]" : "bg-bear",
              )}
            />
            <span className={live ? "text-bull" : "text-mute"}>{live ? "Live" : "Socket off"}</span>
          </div>
        </div>
        <MarketStrip />
        <div className="flex gap-1 overflow-x-auto border-t border-white/5 px-3 py-2 lg:hidden">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1 text-xs text-mute",
                  isActive ? "bg-white/10 text-ink" : "bg-white/5",
                )
              }
            >
              <link.icon className="h-3 w-3" />
              {link.label}
            </NavLink>
          ))}
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] p-3 md:p-5">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-[1800px] px-5 pb-6 pt-2 text-[11px] leading-5 text-mute">
        CandleCast forecasts are sampled model paths, not calibrated probabilities or financial advice. Historical candles
        come from Binance public APIs. Forecast accuracy is shown only after out-of-sample evaluation runs.
      </footer>
      <AlertToaster />
    </div>
  );
}
