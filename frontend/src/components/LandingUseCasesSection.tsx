import { ArrowUpRight, CarFront, House, MonitorCog, Plane, ShieldCheck, Wifi } from 'lucide-react'
import { Link } from 'react-router-dom'

const CASES = [
  { icon: CarFront, title: 'Vehicle purchases', example: 'Keep a ₹12 lakh car below ₹10.8 lakh.' }, { icon: House, title: 'Rent & housing', example: 'Bring ₹35,000 rent closer to ₹30,000.' }, { icon: Wifi, title: 'Bills & subscriptions', example: 'Lower the bill without reducing the plan.' }, { icon: Plane, title: 'Travel & insurance', example: 'Negotiate a better rate and clearer terms.' }, { icon: MonitorCog, title: 'Business renewals', example: 'Get fairer SaaS and vendor terms.' }, { icon: ShieldCheck, title: 'Agent commerce', example: 'Negotiate services and digital resources.' },
]

export default function LandingUseCasesSection() {
  return <section className="bg-[#F5F5F5] px-6 py-24"><div className="max-w-[88rem] mx-auto"><div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"><div><p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">Where Ringside helps</p><h2 className="text-4xl md:text-5xl font-medium text-black" style={{ letterSpacing: '-0.03em' }}>Every conversation has terms.</h2></div><Link to="/use-cases" className="group inline-flex items-center gap-2 text-sm font-medium text-black self-start md:self-auto">Explore use cases <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></Link></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{CASES.map((item) => { const Icon = item.icon; return <article key={item.title} className="interactive-card min-h-48 rounded-2xl border border-[#E5E5E5] bg-white p-7"><Icon className="h-5 w-5 text-black mb-8" /><h3 className="text-xl font-medium text-black mb-2" style={{ letterSpacing: '-0.02em' }}>{item.title}</h3><p className="text-sm leading-relaxed text-black/55">{item.example}</p></article> })}</div></div></section>
}
