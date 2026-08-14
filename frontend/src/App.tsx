import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import NewNegotiationPage from './pages/NewNegotiationPage'
import CallDashboardPage from './pages/CallDashboardPage'
import HistoryPage from './pages/HistoryPage'
import HowToUsePage from './pages/HowToUsePage'
import UseCasesPage from './pages/UseCasesPage'
import NegotiationDetailPage from './pages/NegotiationDetailPage'
import LoginPage from './pages/LoginPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<LandingPage />} />
        <Route path="/how-to-use" element={<HowToUsePage />} />
        <Route path="/use-cases"  element={<UseCasesPage />} />
        <Route path="/new"       element={<NewNegotiationPage />} />
        <Route path="/login"     element={<LoginPage />} />
        <Route path="/call/:id"  element={<CallDashboardPage />} />
        <Route path="/history"   element={<HistoryPage />} />
        <Route path="/negotiation/:id" element={<NegotiationDetailPage />} />
      </Routes>
    </BrowserRouter>
  )
}
