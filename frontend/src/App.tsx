import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import NewNegotiationPage from './pages/NewNegotiationPage'
import CallDashboardPage from './pages/CallDashboardPage'
import HistoryPage from './pages/HistoryPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<LandingPage />} />
        <Route path="/new"       element={<NewNegotiationPage />} />
        <Route path="/call/:id"  element={<CallDashboardPage />} />
        <Route path="/history"   element={<HistoryPage />} />
      </Routes>
    </BrowserRouter>
  )
}
