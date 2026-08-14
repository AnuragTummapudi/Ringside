import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, BarChart3, Bot, CheckCircle2, Clock3, Phone, TrendingDown } from 'lucide-react'
import LogoIcon from '../components/LogoIcon'
import { API_BASE } from '../api'

interface CallSummary { callId: string; company: string; mode: string; currentPrice: number; targetPrice: number; startedAt: string; resolved: boolean; finalPrice: number | null; resolutionReason: string | null; report?: { outcome?: string; monthlySavings?: number; annualSavings?: number; turns?: number } }
type Filter = 'all' | 'won' | 'best_offer' | 'in_progress'

function money(value: number | null | undefined) { return value == null ? '—' : `₹${value.toLocaleString('en-IN')}` }

export default function HistoryPage() {
  const [calls, setCalls] = useState<CallSummary[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<'newest' | 'savings'>('newest')
  const [loading, setLoading] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/calls`, { credentials: 'include' })
        if (response.status === 401) {
          setAuthRequired(true)
          setCalls([])
          return
        }
        const data = await response.json()
        setCalls(Array.isArray(data) ? data : [])
      } catch {
        setCalls([])
      } finally {
        setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(timer)
  }, [])
  const filtered = useMemo(() => calls.filter((call) => filter === 'all' || filter === 'in_progress' && !call.resolved || filter === 'won' && call.report?.outcome === 'won' || filter === 'best_offer' && call.report?.outcome === 'best_offer').sort((a, b) => sort === 'savings' ? (b.report?.monthlySavings || 0) - (a.report?.monthlySavings || 0) : new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()), [calls, filter, sort])
  const totalSaved = calls.reduce((sum, call) => sum + (call.report?.monthlySavings || (call.finalPrice ? Math.max(0, call.currentPrice - call.finalPrice) : 0)), 0)
  const wins = calls.filter((call) => call.report?.outcome === 'won').length
  const completed = calls.filter((call) => call.resolved).length
  const successRate = completed ? Math.round((wins / completed) * 100) : 0

  return <main className="min-h-screen bg-[#F5F5F5] text-black"><header className="border-b border-[#E5E5E5] bg-white"><div className="ringside-page-container flex h-[72px] items-center justify-between"><Link to="/" className="flex items-center gap-2"><LogoIcon className="h-7 w-7" /><span className="text-xl font-semibold tracking-[-0.04em]">Ringside</span></Link><Link to="/new" className="interactive-cta inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]">New negotiation <ArrowRight className="h-4 w-4" /></Link></div></header><div className="ringside-page-container py-8 md:py-12">{authRequired ? <section className="rounded-2xl border border-[#E5E5E5] bg-white px-6 py-20 text-center"><BarChart3 className="mx-auto mb-4 h-6 w-6 text-[#B291E6]" /><h1 className="text-2xl font-semibold tracking-[-0.04em]">Your record is private.</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black/42">Sign in with Google to access the negotiations associated with your account.</p><Link to="/login?returnTo=/history" className="interactive-cta mt-6 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-semibold text-white">Sign in <ArrowRight className="h-4 w-4" /></Link></section> : <><div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/42">Your record</p><h1 className="text-4xl font-semibold tracking-[-0.06em] md:text-5xl">Negotiation history</h1><p className="mt-3 text-sm text-black/48">A durable record of what Ringside tried and what it saved.</p></div><span className="text-sm text-black/42">{calls.length} session{calls.length === 1 ? '' : 's'}</span></div><div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#E5E5E5] bg-[#E5E5E5] md:grid-cols-4"><Metric label="Monthly savings" value={money(totalSaved)} /><Metric label="Negotiations" value={String(calls.length)} /><Metric label="Success rate" value={`${successRate}%`} /><Metric label="Completed" value={String(completed)} /></div><div className="mb-5 flex flex-col justify-between gap-3 border-b border-[#E5E5E5] pb-4 md:flex-row md:items-center"><div className="flex flex-wrap gap-1">{(['all', 'won', 'best_offer', 'in_progress'] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${filter === item ? 'bg-[#2B2644] text-white' : 'text-black/45 hover:bg-white hover:text-black'}`}>{item === 'all' ? 'All' : item === 'won' ? 'Won' : item === 'best_offer' ? 'Best offer' : 'In progress'}</button>)}</div><label className="flex items-center gap-2 text-xs text-black/45">Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-xs text-black outline-none"><option value="newest">Newest</option><option value="savings">Largest savings</option></select></label></div>{loading ? <div className="rounded-2xl border border-[#E5E5E5] bg-white py-20 text-center text-sm text-black/40">Loading your record…</div> : filtered.length === 0 ? <EmptyState /> : <div className="overflow-hidden rounded-2xl border-y border-[#E5E5E5] bg-white">{filtered.map((call) => <HistoryRow key={call.callId} call={call} onClick={() => navigate(`/negotiation/${call.callId}`)} />)}</div>}</>}</div></main>
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="bg-white px-4 py-5 md:px-6"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-0.06em]">{value}</p></div> }
function HistoryRow({ call, onClick }: { call: CallSummary; onClick: () => void }) { const inProgress = !call.resolved; const saved = call.report?.monthlySavings ?? (call.finalPrice ? Math.max(0, call.currentPrice - call.finalPrice) : 0); return <button type="button" onClick={onClick} className="grid w-full grid-cols-[1fr_auto] items-center gap-4 border-b border-[#E5E5E5] px-4 py-5 text-left transition hover:bg-[#F7F4FB] md:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_minmax(130px,.65fr)_auto] md:px-6"><div className="flex items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${inProgress ? 'bg-amber-50 text-amber-600' : saved > 0 ? 'bg-[#F5F2FB] text-[#624799]' : 'bg-black/5 text-black/35'}`}>{inProgress ? <Clock3 className="h-4 w-4" /> : saved > 0 ? <CheckCircle2 className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}</span><span><span className="flex items-center gap-2 text-sm font-semibold">{call.company || 'Unknown'}<span className="text-[10px] font-normal text-black/35">{call.mode === 'human' ? <Phone className="inline h-3 w-3" /> : <Bot className="inline h-3 w-3" />}</span></span><span className="mt-1 block text-xs text-black/38">{new Date(call.startedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></span></div><div className="hidden md:block"><p className="text-xs text-black/38">Price movement</p><p className="mt-1 text-sm font-medium">{money(call.currentPrice)} <span className="px-1 text-black/25">→</span> {money(call.finalPrice)}</p></div><div className="text-right"><p className="text-xs text-black/38">{inProgress ? 'Status' : 'Saved / month'}</p><p className={`mt-1 text-sm font-semibold ${saved > 0 ? 'text-[#624799]' : inProgress ? 'text-amber-600' : 'text-black/45'}`}>{inProgress ? 'In progress' : saved > 0 ? money(saved) : 'No savings'}</p></div><ArrowRight className="hidden h-4 w-4 text-black/25 md:block" /></button> }
function EmptyState() { return <div className="rounded-2xl border border-[#E5E5E5] bg-white px-6 py-20 text-center"><BarChart3 className="mx-auto mb-4 h-6 w-6 text-[#B291E6]" /><h2 className="text-xl font-semibold tracking-[-0.04em]">Your record starts here.</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-black/42">Run the local demo to see the transcript, offer movement, and verified savings appear here.</p><Link to="/new" className="interactive-cta mt-6 inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-semibold text-white">Start a negotiation <ArrowRight className="h-4 w-4" /></Link></div> }
