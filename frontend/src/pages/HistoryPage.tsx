import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Bot, Phone, CheckCircle, Clock, TrendingDown } from 'lucide-react'
import LogoIcon from '../components/LogoIcon'
import { API_BASE } from '../api'

interface CallSummary {
  callId: string
  company: string
  mode: string
  currentPrice: number
  targetPrice: number
  startedAt: string
  resolved: boolean
  finalPrice: number | null
  resolutionReason: string | null
}

export default function HistoryPage() {
  const [calls, setCalls] = useState<CallSummary[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetch(`${API_BASE}/api/calls`)
      .then((r) => r.json())
      .then((data) => { setCalls(data); setLoading(false) })
      .catch(() => setLoading(false))

    // Refresh every 5s for live updates
    const id = setInterval(() => {
      fetch(`${API_BASE}/api/calls`).then((r) => r.json()).then(setCalls).catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [])

  const savings = (c: CallSummary) =>
    c.finalPrice != null ? c.currentPrice - c.finalPrice : null

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* Nav */}
      <nav className="px-8 py-5 flex items-center justify-between border-b border-[#E5E5E5] bg-white">
        <Link to="/" className="flex items-center gap-2 text-black">
          <LogoIcon className="w-6 h-6" />
          <span className="text-lg font-medium" style={{ letterSpacing: '-0.03em' }}>Ringside</span>
        </Link>
        <button
          onClick={() => navigate('/new')}
          className="inline-flex items-center gap-2 bg-black text-white text-sm font-medium pl-5 pr-1.5 py-1.5 rounded-full hover:bg-gray-900 transition-colors duration-200"
        >
          New negotiation
          <span className="bg-white rounded-full p-1.5">
            <ArrowRight className="w-3.5 h-3.5 text-black" />
          </span>
        </button>
      </nav>

      <div className="max-w-5xl mx-auto px-8 py-14">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-black/40 text-xs font-medium tracking-[.12em] uppercase mb-2">All sessions</p>
            <h1 className="text-4xl font-medium text-black" style={{ letterSpacing: '-0.03em' }}>
              History
            </h1>
          </div>
          {calls.length > 0 && (
            <p className="text-black/40 text-sm">{calls.length} negotiation{calls.length !== 1 ? 's' : ''}</p>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-black/30 text-sm py-16 text-center">Loading…</div>
        ) : calls.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {calls.map((c) => {
              const saved = savings(c)
              const inProgress = !c.resolved && c.finalPrice == null
              return (
                <div
                  key={c.callId}
                  onClick={() => navigate(`/call/${c.callId}`)}
                  className="bg-white border border-[#E5E5E5] rounded-2xl px-6 py-5 flex items-center gap-6 cursor-pointer hover:border-black/20 hover:shadow-sm transition-all duration-200"
                >
                  {/* Status icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    inProgress ? 'bg-amber-50 text-amber-600' :
                    c.resolutionReason === 'accepted' ? 'bg-green-50 text-green-600' :
                    'bg-black/5 text-black/40'
                  }`}>
                    {inProgress ? <Clock className="w-5 h-5" /> :
                     c.resolutionReason === 'accepted' ? <CheckCircle className="w-5 h-5" /> :
                     <TrendingDown className="w-5 h-5" />}
                  </div>

                  {/* Company + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-black text-base truncate">{c.company || 'Unknown'}</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        c.mode === 'human'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-black/5 text-black/50'
                      }`}>
                        {c.mode === 'human' ? <Phone className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                        {c.mode === 'human' ? 'Real call' : 'AI vs AI'}
                      </span>
                    </div>
                    <p className="text-black/40 text-xs">
                      {new Date(c.startedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>

                  {/* Prices */}
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-baseline gap-2 justify-end mb-0.5">
                      <span className="text-black/30 text-sm line-through">₹{c.currentPrice?.toLocaleString('en-IN')}</span>
                      {c.finalPrice != null && (
                        <span className="text-black font-medium text-base">₹{c.finalPrice.toLocaleString('en-IN')}</span>
                      )}
                      {inProgress && (
                        <span className="text-amber-600 text-sm font-medium">In progress</span>
                      )}
                    </div>
                    {saved != null && saved > 0 && (
                      <p className="text-green-600 text-xs font-medium">−₹{saved.toLocaleString('en-IN')}/mo saved</p>
                    )}
                    {c.resolutionReason === 'budget_exhausted' && (
                      <p className="text-black/30 text-xs">Best offer reached</p>
                    )}
                  </div>

                  <ArrowRight className="w-4 h-4 text-black/20 flex-shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white border border-[#E5E5E5] flex items-center justify-center mb-6">
        <TrendingDown className="w-7 h-7 text-black/20" />
      </div>
      <h2 className="text-xl font-medium text-black mb-2" style={{ letterSpacing: '-0.02em' }}>No negotiations yet</h2>
      <p className="text-black/40 text-sm mb-8">Start your first call to see results here.</p>
      <button
        onClick={() => navigate('/new')}
        className="inline-flex items-center gap-3 bg-black text-white text-base font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-900 transition-colors duration-200"
      >
        Start a negotiation
        <span className="bg-white rounded-full p-2"><ArrowRight className="w-4 h-4 text-black" /></span>
      </button>
    </div>
  )
}
