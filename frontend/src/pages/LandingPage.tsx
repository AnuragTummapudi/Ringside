import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import HeroSection from '../components/HeroSection'
import StatsSection from '../components/StatsSection'
import InfoSection from '../components/InfoSection'
import HowItWorksSection from '../components/HowItWorksSection'
import BackedBySection from '../components/BackedBySection'
import UseCasesSection from '../components/UseCasesSection'
import FooterSection from '../components/FooterSection'

export default function LandingPage() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col bg-[#F5F5F5]">
      <div className="h-screen flex flex-col overflow-hidden relative">
        <Navbar onCta={() => navigate('/new')} />
        <HeroSection onCta={() => navigate('/new')} />
      </div>
      <StatsSection />
      <InfoSection />
      <HowItWorksSection />
      <BackedBySection />
      <UseCasesSection />
      <FooterSection onCta={() => navigate('/new')} />
    </div>
  )
}
