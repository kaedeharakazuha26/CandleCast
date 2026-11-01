import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { Backtesting } from "./pages/Backtesting";
import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Markets } from "./pages/Markets";
import { Settings } from "./pages/Settings";
import { Watchlist } from "./pages/Watchlist";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/predict" element={<Dashboard />} />
        <Route path="/markets" element={<Markets />} />
        <Route path="/backtesting" element={<Backtesting />} />
        <Route path="/history" element={<History />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
