import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowRight, Bot, Phone } from 'lucide-react'
import LogoIcon from '../components/LogoIcon'
import { API_BASE } from '../api'

interface TurnEvent {
  callId: string
  turn: number
  speaker: 'ringside' | 'rep'
  text: string
  action: string
  currentOffer: number
}

interface CallState {
  callId: string
  config: {
    company: string
    currentPrice: number
    targetPrice: number
    mode: string
  }
  resolved: boolean
  finalPrice: number | null
  resolutionReason: string | null
  conversation: Array<{ speaker: string; text: string; action: string; currentOffer?: number }>
}

interface ResolvedInfo {
  finalPrice: number
  savings: number
  savingsAnnual: number
  resolutionReason?: string
}

type CallStatus = 'Preparing' | 'Connecting' | 'Ringing' | 'Live' | 'Complete' | 'Error'

// ── Smooth number counter ─────────────────────────────────────────────────────
function useAnimatedNumber(target: number | null) {
  const [display, setDisplay] = useState<number | null>(null)
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    if (target === null) return
    if (display === null) { setDisplay(target!); return }
    if (animRef.current) cancelAnimationFrame(animRef.current)

    const from = display
    const dur  = 900
    const t0   = performance.now()

    function step(now: number) {
      const p  = Math.min((now - t0) / dur, 1)
      const e  = 1 - Math.pow(1 - p, 3)
      const v  = Math.round(from + (target! - from) * e)
      setDisplay(v)
      if (p < 1) animRef.current = requestAnimationFrame(step)
      else setDisplay(target!)
    }
    animRef.current = requestAnimationFrame(step)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [target])

  return display
}

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function CallDashboardPage() {
  const { id: callId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [callState, setCallState] = useState<CallState | null>(null)
  const [turns, setTurns]         = useState<TurnEvent[]>([])
  const [speaker, setSpeaker]     = useState<'ringside' | 'rep' | null>(null)
  const [status, setStatus]       = useState<CallStatus>('Preparing')
  const [resolved, setResolved]   = useState<ResolvedInfo | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [rawOffer, setRawOffer]   = useState<number | null>(null)
  const [callDuration, setCallDuration] = useState<number | null>(null)

  const displayOffer    = useAnimatedNumber(rawOffer)
  const feedRef         = useRef<HTMLDivElement>(null)
  const callAnsweredAt  = useRef<number | null>(null)

  // Load initial state (handles page reload mid-call or after completion)
  useEffect(() => {
    if (!callId) return
    fetch(`${API_BASE}/api/state/${callId}`)
      .then((r) => r.json())
      .then((s: CallState) => {
        setCallState(s)
        setRawOffer(s.config.currentPrice)

        if (s.resolved && s.finalPrice != null) {
          setRawOffer(s.finalPrice)
          const savings = s.config.currentPrice - s.finalPrice
          setResolved({
            finalPrice: s.finalPrice,
            savings,
            savingsAnnual: savings * 12,
            resolutionReason: s.resolutionReason ?? undefined,
          })
          setStatus('Complete')
        }

        // Replay conversation — server now enriches each turn with currentOffer
        if (s.conversation.length) {
          const replayTurns: TurnEvent[] = s.conversation.map((t, i) => ({
            callId: s.callId,
            turn: i,
            speaker: t.speaker as 'ringside' | 'rep',
            text: t.text,
            action: t.action,
            currentOffer: t.currentOffer ?? s.config.currentPrice,
          }))
          setTurns(replayTurns)
          // Set offer to the last known offer in the conversation
          const lastOffer = replayTurns[replayTurns.length - 1]?.currentOffer
          if (lastOffer != null) setRawOffer(lastOffer)
        }
      })
      .catch(() => {})
  }, [callId])

  // SSE — real-time events from backend
  useEffect(() => {
    if (!callId) return
    const es = new EventSource(`${API_BASE}/api/events`)

    es.addEventListener('call_preparing', (e) => {
      const d = JSON.parse(e.data)
      if (d.callId !== callId) return
      setStatus('Connecting')
    })

    es.addEventListener('call_placed', (e) => {
      const d = JSON.parse(e.data)
      if (d.callId !== callId) return
      setStatus('Ringing')
    })

    es.addEventListener('call_answered', (e) => {
      const d = JSON.parse(e.data)
      if (d.callId !== callId) return
      setStatus('Live')
      callAnsweredAt.current = Date.now()
    })

    es.addEventListener('turn_playing', (e) => {
      const d: TurnEvent = JSON.parse(e.data)
      if (d.callId !== callId) return
      setSpeaker(d.speaker)
      setRawOffer(d.currentOffer)
      setTurns((prev) => {
        if (prev.some((t) => t.turn === d.turn && t.speaker === d.speaker)) return prev
        return [...prev, d]
      })
    })

    es.addEventListener('call_resolved', (e) => {
      const d: ResolvedInfo & { callId: string } = JSON.parse(e.data)
      if (d.callId !== callId) return
      setResolved(d)
      setRawOffer(d.finalPrice)
      setStatus('Complete')
      setSpeaker(null)
      if (callAnsweredAt.current) {
        setCallDuration(Math.round((Date.now() - callAnsweredAt.current) / 1000))
      }
    })

    es.addEventListener('call_error', (e) => {
      const d = JSON.parse(e.data)
      if (d.callId !== callId) return
      setErrorMsg(d.error)
      setStatus('Error')
    })

    es.addEventListener('call_ended', (e) => {
      const d = JSON.parse(e.data)
      if (d.callId !== callId) return
      if (callAnsweredAt.current && callDuration === null) {
        setCallDuration(Math.round((Date.now() - callAnsweredAt.current) / 1000))
      }
      // If call ended without a resolved event (no deal / hung up)
      setStatus((prev) => {
        if (prev !== 'Complete') {
          setErrorMsg((msg) => msg ?? 'Call ended without reaching an agreement.')
          return 'Complete'
        }
        return prev
      })
    })

    return () => es.close()
  }, [callId, callDuration])

  // Auto-scroll transcript
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [turns])

  const config       = callState?.config
  const initialPrice = config?.currentPrice ?? 0
  const savings      = displayOffer != null ? initialPrice - displayOffer : null
  const isLive       = status === 'Live'

  const offerColor =
    displayOffer != null && displayOffer <= (config?.targetPrice ?? 0) * 1.06
      ? 'text-green-600'
      : displayOffer != null && displayOffer < initialPrice
      ? 'text-amber-600'
      : 'text-black'

  return (
    <div className="h-screen bg-[#F5F5F5] flex flex-col overflow-hidden">

      {/* Top navbar */}
      <div className="flex-shrink-0 bg-white border-b border-[#E5E5E5] px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-black">
          <LogoIcon className="w-5 h-5" />
          <span className="text-base font-medium" style={{ letterSpacing: '-0.03em' }}>Ringside</span>
        </Link>
        <Link to="/history" className="text-xs font-medium text-black/40 hover:text-black transition-colors duration-200 tracking-[.08em] uppercase">
          History
        </Link>
      </div>

      {/* Call bar */}
      <div className="flex-shrink-0 bg-white border-b border-[#E5E5E5] px-8 h-14 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <Avatar label="R" active={speaker === 'ringside'} variant="black" />
          <div>
            <div className="text-sm font-medium text-black leading-none mb-0.5">Ringside</div>
            <div className={`text-[10px] font-medium uppercase tracking-[.08em] transition-colors duration-300 ${
              speaker === 'ringside' ? 'text-black' : 'text-black/30'
            }`}>
              {speaker === 'ringside' ? 'Speaking' : speaker === 'rep' ? 'Listening' : resolved ? 'Done' : status}
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-3 justify-center">
          <div className={`h-px flex-1 max-w-16 transition-colors duration-300 ${isLive ? 'bg-green-500' : 'bg-[#E5E5E5]'}`} />
          <span className={`text-[10px] font-medium uppercase tracking-[.1em] px-3 py-1 rounded-full border transition-all duration-300 ${
            isLive ? 'text-green-600 border-green-200 bg-green-50' :
            status === 'Complete' ? 'text-green-600 border-green-200 bg-green-50' :
            'text-black/30 border-[#E5E5E5]'
          }`}>
            {status === 'Live' ? '● Live' : status === 'Complete' ? '✓ Done' : status}
          </span>
          <div className={`h-px flex-1 max-w-16 transition-colors duration-300 ${isLive ? 'bg-green-500' : 'bg-[#E5E5E5]'}`} />
        </div>

        <div className="flex items-center gap-3 flex-row-reverse">
          <Avatar label={config?.mode === 'human' ? 'REP' : 'SR'} active={speaker === 'rep'} variant="red" />
          <div className="text-right">
            <div className="text-sm font-medium text-black leading-none mb-0.5">
              {config?.company || 'Company Rep'}
            </div>
            <div className={`text-[10px] font-medium uppercase tracking-[.08em] transition-colors duration-300 flex items-center gap-1 justify-end ${
              config?.mode === 'human' ? 'text-blue-500' : 'text-black/30'
            }`}>
              {config?.mode === 'human'
                ? <><Phone className="w-3 h-3" />Real person</>
                : <><Bot className="w-3 h-3" />AI agent</>}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: offer panel */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-[#E5E5E5] flex flex-col p-7 overflow-y-auto">
          <p className="text-[10px] font-medium text-black/30 uppercase tracking-[.14em] mb-3">Current Offer</p>

          <div className="mb-1">
            <span className={`text-6xl font-medium leading-none transition-colors duration-500 ${offerColor}`} style={{ letterSpacing: '-0.04em' }}>
              {displayOffer != null ? `₹${displayOffer.toLocaleString('en-IN')}` : '—'}
            </span>
            <span className="text-base text-black/30 ml-1">/mo</span>
          </div>

          <p className={`text-xs mb-8 transition-colors duration-300 ${savings && savings > 0 ? 'text-green-600' : 'text-black/30'}`}>
            {savings && savings > 0
              ? `Down ₹${savings.toLocaleString('en-IN')} from ₹${initialPrice.toLocaleString('en-IN')}`
              : isLive ? 'Negotiation in progress' : status === 'Preparing' ? 'Preparing call…' : 'Awaiting connection'}
          </p>

          {/* Live savings block */}
          {savings != null && savings > 0 && !resolved && (
            <div className="border-t border-[#E5E5E5] pt-5 mb-5">
              <p className="text-[10px] font-medium text-black/30 uppercase tracking-[.14em] mb-3">Projected Savings</p>
              <div className="flex justify-between items-baseline py-2 border-b border-[#E5E5E5]">
                <span className="text-xs text-black/50">Per month</span>
                <span className="text-base font-medium text-green-600" style={{ letterSpacing: '-0.02em' }}>₹{savings.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-baseline py-2">
                <span className="text-xs text-black/50">Per year</span>
                <span className="text-base font-medium text-green-600" style={{ letterSpacing: '-0.02em' }}>₹{(savings * 12).toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          {/* ── Resolution summary card ── */}
          {resolved && status === 'Complete' && (
            <ResolutionCard
              resolved={resolved}
              initialPrice={initialPrice}
              callDuration={callDuration}
            />
          )}

          {/* Error */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
              <p className="text-[10px] font-medium uppercase tracking-[.1em] text-red-500 mb-1">
                {resolved ? 'Note' : 'Error'}
              </p>
              <p className="text-xs text-red-600 leading-relaxed">{errorMsg}</p>
            </div>
          )}

          {/* New call CTA */}
          {(status === 'Complete' || status === 'Error') && (
            <button
              onClick={() => navigate('/new')}
              className="mt-6 inline-flex items-center gap-2 bg-black text-white text-xs font-medium pl-4 pr-1.5 py-1.5 rounded-full hover:bg-gray-900 transition-colors duration-200"
            >
              New negotiation
              <span className="bg-white rounded-full p-1"><ArrowRight className="w-3 h-3 text-black" /></span>
            </button>
          )}
        </div>

        {/* Right: transcript */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 bg-white border-b border-[#E5E5E5] px-7 py-4 flex items-center justify-between">
            <p className="text-[10px] font-medium text-black/30 uppercase tracking-[.14em]">Live Transcript</p>
            <p className="text-xs text-black/30">{turns.length} turns</p>
          </div>

          <div ref={feedRef} className="flex-1 overflow-y-auto px-7 py-5 flex flex-col gap-4">
            {turns.length === 0 && status !== 'Error' && (
              <div className="flex items-center gap-3 opacity-40 py-2">
                <WaitingDots />
                <span className="text-xs text-black/40 font-medium">
                  {status === 'Preparing' || status === 'Connecting'
                    ? 'Generating negotiation…'
                    : 'Waiting for call to connect…'}
                </span>
              </div>
            )}

            {turns.map((t) => {
              const isR = t.speaker === 'ringside'
              return (
                <div key={`${t.speaker}-${t.turn}`} className="flex gap-3 items-start">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold flex-shrink-0 mt-0.5 ${
                    isR ? 'bg-black/8 text-black border border-black/10' : 'bg-red-50 text-red-600 border border-red-200'
                  }`}>
                    {isR ? 'R' : 'SR'}
                  </div>
                  <div className="bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 flex-1">
                    <p className={`text-[10px] font-medium uppercase tracking-[.1em] mb-1.5 ${isR ? 'text-black/60' : 'text-red-500'}`}>
                      {isR ? 'Ringside' : config?.company || 'Rep'}
                    </p>
                    <p className="text-sm text-black leading-relaxed">{t.text}</p>
                    {/* Show offer badge when the rep makes a pricing move */}
                    {!isR && (t.action === 'first_offer' || t.action === 'fold') && (
                      <span className={`inline-flex mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        t.action === 'fold'
                          ? 'bg-green-50 text-green-600 border-green-200'
                          : 'bg-amber-50 text-amber-600 border-amber-200'
                      }`}>
                        {t.action === 'fold' ? 'Final offer' : 'Offer'}: ₹{t.currentOffer?.toLocaleString('en-IN')}/mo
                      </span>
                    )}
                    {/* Ringside accept badge */}
                    {isR && t.action === 'accept' && (
                      <span className="inline-flex mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                        ✓ Accepted at ₹{t.currentOffer?.toLocaleString('en-IN')}/mo
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Waiting indicator while live */}
            {isLive && turns.length > 0 && !resolved && (
              <div className="flex items-center gap-3 opacity-40 py-1">
                <WaitingDots />
                <span className="text-xs text-black/40 font-medium">Waiting for response…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Resolution Summary Card ───────────────────────────────────────────────────

function ResolutionCard({
  resolved,
  initialPrice,
  callDuration,
}: {
  resolved: ResolvedInfo
  initialPrice: number
  callDuration: number | null
}) {
  const won       = resolved.resolutionReason === 'accepted'
  const bestOffer = resolved.resolutionReason === 'budget_exhausted'
  const noDeal    = !won && !bestOffer

  const outcomeLabel = won ? 'Negotiation won' : bestOffer ? 'Best offer reached' : 'No deal'
  const outcomeColor = won
    ? 'bg-green-50 border-green-200 text-green-700'
    : bestOffer
    ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-[#F5F5F5] border-[#E5E5E5] text-black/50'

  const savingsMo  = resolved.savings
  const savingsYr  = resolved.savingsAnnual

  return (
    <div className={`rounded-xl border p-4 ${outcomeColor}`}>
      {/* Outcome + duration */}
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[.1em]">
          {won ? '✓ ' : bestOffer ? '↓ ' : '✕ '}{outcomeLabel}
        </p>
        {callDuration != null && callDuration > 0 && (
          <span className="text-[10px] font-medium opacity-60">{fmtDuration(callDuration)}</span>
        )}
      </div>

      {/* Price journey */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-sm line-through opacity-40">₹{initialPrice.toLocaleString('en-IN')}</span>
        <span className="text-xl font-semibold" style={{ letterSpacing: '-0.03em' }}>
          ₹{resolved.finalPrice.toLocaleString('en-IN')}
        </span>
        <span className="text-xs opacity-50">/mo</span>
      </div>

      {/* Savings */}
      {savingsMo > 0 && !noDeal && (
        <div className="flex flex-col gap-1 border-t border-current/10 pt-3">
          <div className="flex justify-between text-xs">
            <span className="opacity-60">Monthly saving</span>
            <span className="font-medium">₹{savingsMo.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="opacity-60">Yearly saving</span>
            <span className="font-medium">₹{savingsYr.toLocaleString('en-IN')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Avatar({ label, active, variant }: { label: string; active: boolean; variant: 'black' | 'red' }) {
  const base = variant === 'black'
    ? 'bg-black/8 border-black/12 text-black'
    : 'bg-red-50 border-red-200 text-red-600'
  const ring = active
    ? variant === 'black'
      ? 'ring-2 ring-black/20 ring-offset-1'
      : 'ring-2 ring-red-300 ring-offset-1'
    : ''

  return (
    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] font-semibold flex-shrink-0 transition-all duration-300 ${base} ${ring}`}>
      {label}
    </div>
  )
}

function WaitingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-black/30"
          style={{ animation: `wd 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
      <style>{`@keyframes wd { 0%,80%,100%{opacity:.3;transform:scale(.8)} 40%{opacity:1;transform:scale(1.2)} }`}</style>
    </div>
  )
}
