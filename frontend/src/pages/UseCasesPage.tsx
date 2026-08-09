import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Building2,
  CarFront,
  Check,
  Handshake,
  House,
  MonitorCog,
  PackageCheck,
  Plane,
  UserRoundCheck,
  Wifi,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import FooterSection from '../components/FooterSection'
import Navbar from '../components/Navbar'

const PERSONAL_CASES = [
  { icon: CarFront, title: 'Vehicle negotiation', problem: 'Dealerships negotiate every day.', solution: 'Ringside protects your budget and knows when to walk away.', example: 'Get this ₹12 lakh car below ₹10.8 lakh.' },
  { icon: House, title: 'Housing & rentals', problem: 'The first price is rarely the best price.', solution: 'Ringside negotiates rent, deposits, lease terms, and conditions.', example: 'Bring this ₹35,000 rent closer to ₹30,000.' },
  { icon: Wifi, title: 'Bills & subscriptions', problem: 'Renewal pricing quietly gets expensive.', solution: 'Ringside secures better plans, discounts, and retention offers.', example: 'Reduce my internet bill without reducing speed.' },
  { icon: Plane, title: 'Travel deals', problem: 'Good rates and upgrades are often left unasked for.', solution: 'Ringside negotiates rates, room upgrades, and booking terms.', example: 'Get this hotel closer to ₹6,500 a night.' },
  { icon: Handshake, title: 'Marketplace purchases', problem: 'Sellers expect a counteroffer.', solution: 'Ringside handles the back-and-forth with a firm ceiling.', example: 'Seller wants ₹50,000. Stay under ₹40,000.' },
]

const BUSINESS_CASES = [
  { icon: Building2, title: 'Vendor contracts', detail: 'Supplier pricing, service agreements, and recurring contracts.' },
  { icon: MonitorCog, title: 'SaaS renewals', detail: 'Software pricing, enterprise discounts, and fairer contract terms.' },
  { icon: PackageCheck, title: 'Procurement', detail: 'Recurring purchases, supplier agreements, and operational costs.' },
  { icon: BriefcaseBusiness, title: 'Freelance agreements', detail: 'Project pricing, payment terms, and realistic timelines.' },
  { icon: UserRoundCheck, title: 'Recruitment negotiation', detail: 'Compensation, benefits, and joining incentives.' },
]

export default function UseCasesPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <Navbar onCta={() => navigate('/new')} />

      <main className="pt-36">
        <section className="px-6 pb-16">
          <div className="max-w-[88rem] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_.92fr] gap-10 lg:items-end">
            <div>
              <p className="hero-eyebrow text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-4">Negotiation, represented</p>
              <h1 className="page-title text-5xl md:text-6xl font-medium leading-tight text-black mb-6" style={{ letterSpacing: '-0.04em' }}>
                Better terms.<br />On your behalf.
              </h1>
              <p className="page-lede max-w-xl text-black/60 text-lg leading-relaxed">
                Ringside represents people and teams in the conversations that shape what they pay, what they get, and what they agree to.
              </p>
            </div>

            <div className="call-flow-board relative min-h-[310px] overflow-hidden rounded-3xl p-7 md:p-9">
              <div className="relative z-10 flex items-center justify-between border-b border-black/10 pb-5">
                <div><p className="text-sm font-medium text-black">Negotiation intelligence</p><p className="text-xs text-black/45">Listening. Deciding. Representing.</p></div>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"><Handshake className="h-4 w-4" /></span>
              </div>
              <div className="relative z-10 mt-8 space-y-4">
                <div className="call-flow-message call-flow-message-agent"><span>₹10.8 lakh is my final number.</span></div>
                <div className="call-flow-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
                <div className="call-flow-message call-flow-message-rep"><span>Let me see what I can make work.</span></div>
              </div>
              <div className="relative z-10 mt-7 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-2 text-xs font-medium text-black/65"><Check className="h-3.5 w-3.5" /> Decisions adapt in real time</div>
              <div className="call-flow-orb call-flow-orb-one" /><div className="call-flow-orb call-flow-orb-two" />
            </div>
          </div>
        </section>

        <section className="bg-white border-y border-[#E5E5E5] px-6 py-20">
          <div className="max-w-[88rem] mx-auto">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
              <div><p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">Personal negotiations</p><h2 className="text-4xl md:text-5xl font-medium text-black" style={{ letterSpacing: '-0.03em' }}>For the calls that shape everyday life.</h2></div>
              <p className="max-w-xs text-black/60 text-base leading-relaxed md:text-right">You set the target. Ringside handles the strategy, objections, and counteroffers.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {PERSONAL_CASES.map((item) => {
                const Icon = item.icon
                return <article key={item.title} className="interactive-card bg-[#F5F5F5] border border-[#E5E5E5] rounded-2xl p-7 min-h-[300px] flex flex-col">
                  <span className="mb-8 flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"><Icon className="h-4 w-4" /></span>
                  <h3 className="text-xl font-medium text-black mb-2" style={{ letterSpacing: '-0.02em' }}>{item.title}</h3>
                  <p className="text-sm leading-relaxed text-black/50 mb-2">{item.problem}</p>
                  <p className="text-sm leading-relaxed text-black/70">{item.solution}</p>
                  <p className="mt-auto pt-7 text-sm font-medium leading-relaxed text-black">“{item.example}”</p>
                </article>
              })}
            </div>
          </div>
        </section>

        <section className="bg-[#F5F5F5] px-6 py-24">
          <div className="max-w-[88rem] mx-auto">
            <div className="mb-12"><p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">Business negotiations</p><h2 className="text-4xl md:text-5xl font-medium leading-tight text-black" style={{ letterSpacing: '-0.03em' }}>A stronger position<br />for every agreement.</h2></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {BUSINESS_CASES.map((item, index) => {
                const Icon = item.icon
                return <article key={item.title} className="business-case-row group flex items-center gap-5 rounded-2xl border border-[#E5E5E5] bg-white px-6 py-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F2EEF8] text-black"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0"><p className="text-lg font-medium text-black" style={{ letterSpacing: '-0.02em' }}>{item.title}</p><p className="text-sm leading-relaxed text-black/55">{item.detail}</p></div>
                  <span className="ml-auto font-mono text-xs text-black/30">0{index + 1}</span>
                </article>
              })}
            </div>
          </div>
        </section>

        <section className="px-6 pb-24">
          <div className="future-commerce-panel max-w-[88rem] mx-auto relative overflow-hidden rounded-3xl bg-[#2B2644] p-8 md:p-12">
            <div className="relative z-10 max-w-2xl"><p className="text-white/55 text-sm font-medium tracking-[.12em] uppercase mb-4">Future autonomous commerce</p><h2 className="text-white text-4xl md:text-5xl font-medium leading-tight mb-5" style={{ letterSpacing: '-0.03em' }}>The negotiation layer<br />for autonomous agents.</h2><p className="text-white/65 text-lg leading-relaxed">As AI agents purchase services, APIs, compute, and digital resources, Ringside gives them the strategic reasoning to seek better economic outcomes—not just accept the first price.</p></div>
            <div className="future-agent-orb" /><Bot className="future-agent-icon absolute right-10 bottom-8 h-24 w-24 text-white/15" />
          </div>
        </section>

        <section className="bg-[#F5F5F5] px-6 py-24">
          <div className="max-w-[88rem] mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-8"><div><p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">Your next move</p><h2 className="text-4xl md:text-5xl font-medium text-black leading-tight" style={{ letterSpacing: '-0.03em' }}>Tell us the target.<br />We&apos;ll take the conversation.</h2></div><button onClick={() => navigate('/new')} className="interactive-cta inline-flex items-center gap-3 self-start rounded-full bg-black py-2 pl-8 pr-2 text-base font-medium text-white md:self-auto">Start a call <span className="rounded-full bg-white p-2"><ArrowRight className="h-5 w-5 text-black" /></span></button></div>
        </section>
      </main>

      <FooterSection onCta={() => navigate('/new')} />
    </div>
  )
}
