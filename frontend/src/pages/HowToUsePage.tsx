import { ArrowRight, BrainCircuit, Check, CircleCheck, Phone, ShieldCheck, SlidersHorizontal, Target } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FooterSection from '../components/FooterSection'
import Navbar from '../components/Navbar'

const INTELLIGENCE = [
  { icon: BrainCircuit, title: 'Understand', body: 'Ringside listens for objections, flexibility, and the signals that change a negotiation.' },
  { icon: SlidersHorizontal, title: 'Adapt', body: 'It changes strategy as the live conversation develops, not after the fact.' },
  { icon: ShieldCheck, title: 'Protect', body: 'Your target, limits, and instructions remain the boundary for every decision.' },
]

const START_STEPS = [
  { number: '01', title: 'Define your outcome', body: 'Share the target, limits, and context that matter to you.' },
  { number: '02', title: 'Start the conversation', body: 'Ringside takes the live negotiation and handles the back-and-forth.' },
  { number: '03', title: 'Review the result', body: 'Receive the final outcome and a clear record of what was agreed.' },
]

function TimedConversation() {
  const [visibleCount, setVisibleCount] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) { setVisibleCount(4); return }
    const delay = visibleCount === 0 ? 450 : visibleCount === 4 ? 3200 : 1250
    const timer = setTimeout(() => setVisibleCount((current) => current === 4 ? 0 : current + 1), delay)
    return () => clearTimeout(timer)
  }, [visibleCount, reduceMotion])

  const message = (index: number, className: string, content: React.ReactNode) => visibleCount > index ? <motion.p className={className} initial={{ opacity: 0, y: 14, filter: 'blur(3px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: .48, ease: [0.16, 1, .3, 1] }}>{content}</motion.p> : null

  return <div className="space-y-4 min-h-[330px]">
    {message(0, 'negotiation-bubble negotiation-seller', <>Seller: “The lowest I can do is ₹900.”</>)}
    {visibleCount > 0 && <motion.div className="negotiation-wave" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><i /><i /><i /><i /><i /><i /><i /><i /><i /></motion.div>}
    {message(1, 'negotiation-bubble negotiation-ringside', <>Ringside: “If we can make ₹800 work today, we can close this.”</>)}
    {message(2, 'negotiation-bubble negotiation-seller', <>Seller: “I can&apos;t go below ₹850.”</>)}
    {message(3, 'negotiation-bubble negotiation-ringside', <><Check className="h-4 w-4 shrink-0" /> “Let&apos;s meet at ₹825 and finalize.”</>)}
  </div>
}

export default function HowToUsePage() {
  const navigate = useNavigate()
  return <div className="min-h-screen bg-[#F5F5F5]"><Navbar onCta={() => navigate('/new')} />
    <main className="pt-36">
      <section className="px-6 pb-14"><div className="max-w-[88rem] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_.86fr] gap-10 lg:items-end"><div><p className="hero-eyebrow text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-4">How Ringside works</p><h1 className="page-title max-w-3xl text-5xl md:text-6xl font-medium leading-tight text-black mb-6" style={{ letterSpacing: '-0.04em' }}>From target<br />to outcome.</h1><p className="page-lede max-w-xl text-black/60 text-lg leading-relaxed">You define the goal. Ringside prepares, negotiates, and returns with an outcome grounded in the limits you set.</p></div><div className="pipeline-panel rounded-3xl border border-[#E4E0EF] p-6 md:p-8"><p className="text-black/45 text-xs font-medium tracking-[.12em] uppercase mb-8">The negotiation pipeline</p><div className="grid grid-cols-4 gap-2">{[{ icon: Target, label: 'Goal' }, { icon: BrainCircuit, label: 'Strategy' }, { icon: Phone, label: 'Conversation' }, { icon: CircleCheck, label: 'Outcome' }].map((item, index) => { const Icon = item.icon; return <div key={item.label} className="pipeline-stage relative text-center"><span className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-black text-white"><Icon className="h-3.5 w-3.5" /></span>{index < 3 && <i className="pipeline-line" />}<p className="text-xs font-medium text-black/65">{item.label}</p></div> })}</div></div></div></section>

      <section className="bg-white border-y border-[#E5E5E5] px-6 py-24"><div className="max-w-[88rem] mx-auto"><div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"><div><p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">Negotiation intelligence</p><h2 className="text-4xl md:text-5xl font-medium text-black" style={{ letterSpacing: '-0.03em' }}>Context, not scripts.</h2></div><p className="max-w-xs text-black/60 text-base leading-relaxed md:text-right">Ringside makes decisions inside the conversation, with the user&apos;s interests always in view.</p></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{INTELLIGENCE.map((item) => { const Icon = item.icon; return <article key={item.title} className="interactive-card bg-[#F5F5F5] border border-[#E5E5E5] rounded-2xl p-8 min-h-64"><span className="mb-10 flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"><Icon className="h-4 w-4" /></span><h3 className="text-xl font-medium text-black mb-3" style={{ letterSpacing: '-0.02em' }}>{item.title}</h3><p className="text-black/60 text-base leading-relaxed">{item.body}</p></article> })}</div></div></section>

      <section className="px-6 py-24"><div className="how-flow-panel max-w-[88rem] mx-auto overflow-hidden rounded-3xl border border-[#E4E0EF] bg-white p-6 md:p-10"><div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"><div><p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">Inside a Ringside negotiation</p><h2 className="text-4xl md:text-5xl font-medium leading-tight text-black" style={{ letterSpacing: '-0.03em' }}>The call, in motion.</h2></div><p className="max-w-xs text-base leading-relaxed text-black/60 md:text-right">Every phase is connected to the target you set, from context through to the final decision.</p></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[{ icon: SlidersHorizontal, time: '00:00', title: 'Context prepared', body: 'Your target, limits, and supporting detail are ready before the call begins.' }, { icon: Phone, time: '00:08', title: 'Conversation begins', body: 'Ringside listens for objections and responds with the right next move.' }, { icon: CircleCheck, time: '00:54', title: 'Outcome reached', body: 'The final position is captured clearly for you to review.' }].map((step, index) => { const Icon = step.icon; return <article key={step.time} className="how-flow-step relative rounded-2xl border border-[#E5E5E5] bg-[#FAFAFC] p-7">{index < 2 && <span className="how-flow-connector hidden md:block" />}<div className="flex items-center justify-between mb-10"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white"><Icon className="h-4 w-4" /></span><span className="timeline-time font-mono text-xs text-black/40">{step.time}</span></div><h3 className="text-xl font-medium text-black mb-3" style={{ letterSpacing: '-0.02em' }}>{step.title}</h3><p className="text-base leading-relaxed text-black/60">{step.body}</p></article> })}</div></div></section>

      <section className="bg-white border-y border-[#E5E5E5] px-6 py-24"><div className="max-w-[88rem] mx-auto grid grid-cols-1 lg:grid-cols-[.82fr_1.18fr] gap-12 items-center"><div><p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">Conversation, demonstrated</p><h2 className="text-4xl md:text-5xl font-medium leading-tight text-black mb-5" style={{ letterSpacing: '-0.03em' }}>It reasons with<br />the conversation.</h2><p className="max-w-md text-black/60 text-base leading-relaxed">Ringside does not follow a fixed sequence. It makes the next offer based on what the other side actually says.</p></div><div className="negotiation-example rounded-3xl border border-[#E5E5E5] bg-[#F5F5F5] p-6 md:p-8"><div className="flex items-center justify-between border-b border-black/10 pb-5 mb-6"><span className="text-sm font-medium text-black">Live negotiation</span><span className="inline-flex items-center gap-2 text-xs font-medium text-black/50"><span className="stat-status-dot" /> Thinking live</span></div><TimedConversation /></div></div></section>

      <section className="bg-[#F5F5F5] px-6 py-24"><div className="max-w-[88rem] mx-auto"><div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12"><div><p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">Start with an outcome</p><h2 className="text-4xl md:text-5xl font-medium leading-tight text-black" style={{ letterSpacing: '-0.03em' }}>Three steps. One clear goal.</h2></div><button onClick={() => navigate('/new')} className="interactive-cta inline-flex items-center gap-3 bg-black text-white text-base font-medium pl-7 pr-2 py-2 rounded-full self-start md:self-auto">Start a call<span className="bg-white rounded-full p-2"><ArrowRight className="w-5 h-5 text-black" /></span></button></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{START_STEPS.map((step) => <article key={step.number} className="interactive-card bg-white border border-[#E5E5E5] rounded-2xl p-8 min-h-64 relative overflow-hidden"><span className="absolute top-4 right-6 text-8xl font-medium text-black/[0.04] select-none leading-none" style={{ letterSpacing: '-0.04em' }}>{step.number}</span><span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-black text-white text-xs font-medium mb-10">{step.number.replace('0', '')}</span><h3 className="text-black text-xl font-medium mb-3" style={{ letterSpacing: '-0.02em' }}>{step.title}</h3><p className="text-black/60 text-base leading-relaxed">{step.body}</p></article>)}</div></div></section>
    </main><FooterSection onCta={() => navigate('/new')} /></div>
}
