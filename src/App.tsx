import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from '@/pages/Home'
import StockDetail from '@/pages/StockDetail'
import WatchlistDashboard from '@/pages/WatchlistDashboard'
import LifelineMonitor from '@/pages/LifelineMonitor'
import MaScanner from '@/pages/MaScanner'
import ConceptFlow from '@/pages/ConceptFlow'
import ConceptFlowDetail from '@/pages/ConceptFlowDetail'
import NavTabs from '@/components/NavTabs'
import PasswordGate from '@/components/PasswordGate'

export default function App() {
  return (
    <Router>
      <PasswordGate>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <NavTabs />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/watchlist" element={<WatchlistDashboard />} />
            <Route path="/lifeline" element={<LifelineMonitor />} />
            <Route path="/lifeline-monitor" element={<LifelineMonitor />} />
            <Route path="/ma-scan" element={<MaScanner />} />
            <Route path="/concept-flow" element={<ConceptFlow />} />
            <Route path="/concept-flow/:boardCode" element={<ConceptFlowDetail />} />
            <Route path="/stocks/:symbol" element={<StockDetail />} />
          </Routes>
        </div>
      </PasswordGate>
    </Router>
  )
}
