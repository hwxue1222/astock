import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import StockDetail from "@/pages/StockDetail";
import WatchlistDashboard from "@/pages/WatchlistDashboard";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watchlist" element={<WatchlistDashboard />} />
        <Route path="/stocks/:symbol" element={<StockDetail />} />
      </Routes>
    </Router>
  );
}
