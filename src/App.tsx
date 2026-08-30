import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import StockDetail from "@/pages/StockDetail";
import WatchlistDashboard from "@/pages/WatchlistDashboard";
import LifelineMonitor from "@/pages/LifelineMonitor";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watchlist" element={<WatchlistDashboard />} />
        <Route path="/lifeline" element={<LifelineMonitor />} />
        <Route path="/stocks/:symbol" element={<StockDetail />} />
      </Routes>
    </Router>
  );
}
