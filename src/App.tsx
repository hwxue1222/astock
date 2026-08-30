import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import StockDetail from "@/pages/StockDetail";
import WatchlistDashboard from "@/pages/WatchlistDashboard";
import LifelineMonitor from "@/pages/LifelineMonitor";
import NavTabs from "@/components/NavTabs";

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <NavTabs />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/watchlist" element={<WatchlistDashboard />} />
          <Route path="/lifeline" element={<LifelineMonitor />} />
          <Route path="/stocks/:symbol" element={<StockDetail />} />
        </Routes>
      </div>
    </Router>
  );
}
