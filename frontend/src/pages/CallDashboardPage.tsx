import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Call, Device } from '@twilio/voice-sdk'
import { ArrowLeft, Bot, ChevronRight, CircleStop, Mic, Phone, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import LogoIcon from '../components/LogoIcon'
import { API_BASE } from '../api'

interface Turn { speaker: string; text: string; action: string; currentOffer?: number | null; offerDetected?: boolean; turn?: number }
interface Report { outcome: string; startingPrice: number; finalPrice: number | null; targetPrice: number; monthlySavings: number; annualSavings: number; turns: number; strategy: string[]; objections: string[]; verification?: { status: string; confidence: number }; summary?: string }
interface TakeoverState { available: boolean; phase: string; browserConnected: boolean; canTakeOver: boolean }
interface CallState { callId: string; config: { company: string; currentPrice: number; targetPrice: number; mode: string }; status: string; startedAt: string; resolved: boolean; finalPrice: number | null; resolutionReason: string | null; conversation: Turn[]; report?: Report | null; takeover?: TakeoverState }

function money(value: number | null | undefined) { return value == null ? '—' : `₹${value.toLocaleString('en-IN')}` }

export default function CallDashboardPage() {
  const { id: callId } = useParams<{ id: string }>()
  const [state, setState] = useState<CallState | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [speaker, setSpeaker] = useState<string | null>(null)
  const [status, setStatus] = useState('Preparing')
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offer, setOffer] = useState<number | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!callId) return
    fetch(`${API_BASE}/api/state/${callId}`, { credentials: 'include' }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Call not found'); return data as CallState }).then((data) => {
      setState(data); setStatus(data.status === 'resolved' ? 'Complete' : data.status || 'Preparing'); setTurns(data.conversation || []); setReport(data.report || null)
      const lastOffer = [...(data.conversation || [])].reverse().find((turn) => turn.offerDetected && typeof turn.currentOffer === 'number')
      setOffer(lastOffer?.currentOffer ?? data.finalPrice ?? null)
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Call not found'))
  }, [callId])

  useEffect(() => {
    if (!callId) return
    const events = new EventSource(`${API_BASE}/api/events?${new URLSearchParams({ callId }).toString()}`, { withCredentials: true })
    const parse = (event: MessageEvent) => JSON.parse(event.data)
    const onPreparing = (event: MessageEvent) => { if (parse(event).callId === callId) setStatus('Preparing') }
    const onAnswered = (event: MessageEvent) => { if (parse(event).callId === callId) setStatus('Listening') }
    const onTurn = (event: MessageEvent) => { const data = parse(event) as Turn & { callId: string }; if (data.callId !== callId) return; setStatus(data.speaker === 'ringside' ? 'Negotiating' : 'Listening'); setSpeaker(data.speaker); if (data.offerDetected && typeof data.currentOffer === 'number') setOffer(data.currentOffer); setTurns((current) => current.some((turn) => turn.turn === data.turn && turn.speaker === data.speaker) ? current : [...current, data]); window.setTimeout(() => feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }), 30) }
    const onResolved = (event: MessageEvent) => { const data = parse(event); if (data.callId !== callId) return; setStatus('Complete'); setSpeaker(null); setOffer(data.finalPrice); if (data.report) setReport(data.report) }
    const onError = (event: MessageEvent) => { const data = parse(event); if (data.callId === callId) { setStatus('Error'); setError(data.error || 'The call ended unexpectedly') } }
    const onTakeover = (event: MessageEvent) => { const data = parse(event); if (data.callId === callId) setState((current) => current ? { ...current, takeover: data.takeover } : current) }
    events.addEventListener('call_preparing', onPreparing); events.addEventListener('call_answered', onAnswered); events.addEventListener('turn_playing', onTurn); events.addEventListener('turn_text', onTurn); events.addEventListener('call_resolved', onResolved); events.addEventListener('call_error', onError); events.addEventListener('takeover_state', onTakeover)
    return () => { events.close() }
  }, [callId])

  const currentPrice = state?.config.currentPrice || report?.startingPrice || 0
  const targetPrice = state?.config.targetPrice || report?.targetPrice || 0
  const latestOffer = offer
  const offerForCalculation = latestOffer ?? currentPrice
  const saved = latestOffer != null ? Math.max(0, currentPrice - latestOffer) : 0
  const strength = useMemo(() => Math.min(98, Math.max(28, Math.round(48 + (state?.config.mode === 'agent' ? 12 : 4) + (saved > 0 ? 18 : 0) + (targetPrice > 0 && offerForCalculation <= targetPrice * 1.1 ? 16 : 0)))), [offerForCalculation, saved, state?.config.mode, targetPrice])

  if (error && !state) return <main className="min-h-screen bg-[#F5F5F5] px-6 py-12"><Link to="/new" className="inline-flex items-center gap-2 text-sm text-black/55"><ArrowLeft className="h-4 w-4" /> New negotiation</Link><div className="mx-auto mt-20 max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div></main>

  return <main className="min-h-screen bg-[#F5F5F5] text-black">
    <header className="border-b border-[#E5E5E5] bg-white"><div className="ringside-page-container flex h-[72px] items-center justify-between"><Link to="/" className="flex items-center gap-2"><LogoIcon className="h-7 w-7" /><span className="text-xl font-semibold tracking-[-0.04em]">Ringside</span></Link><div className="flex items-center gap-4 text-sm"><span className={`inline-flex items-center gap-2 ${status === 'Complete' ? 'text-[#624799]' : status === 'Error' ? 'text-red-600' : 'text-black/55'}`}><span className={`h-2 w-2 rounded-full ${status === 'Complete' ? 'bg-[#B291E6]' : status === 'Error' ? 'bg-red-500' : 'animate-pulse bg-black/45'}`} />{status}</span><Link to="/history" className="text-black/45 transition hover:text-black">History</Link></div></div></header>
    <div className="ringside-page-container py-6 md:py-8"><div className="mb-6 flex items-center justify-between"><div><Link to="/new" className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-black/45 transition hover:text-black"><ArrowLeft className="h-3.5 w-3.5" /> New negotiation</Link><h1 className="text-3xl font-semibold tracking-[-0.05em] md:text-4xl">{state?.config.company || 'Preparing your call'}</h1><p className="mt-2 text-sm text-black/45">{state?.config.mode === 'human' ? 'Real call' : 'Local demo'} · live negotiation console</p></div>{status === 'Complete' && <Link to={`/negotiation/${callId}`} className="hidden items-center gap-2 border border-black/15 bg-white px-4 py-2 text-sm font-medium transition hover:border-black/40 md:inline-flex">Open full report <ChevronRight className="h-4 w-4" /></Link>}</div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(250px,.55fr)_minmax(250px,.55fr)]">
        <section className="flex min-h-[640px] flex-col rounded-2xl border border-[#E5E5E5] bg-white"><div className="flex items-center justify-between border-b border-[#E5E5E5] px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">Live transcript</p><p className="mt-1 text-xs text-black/35">{turns.length} turns · {speaker ? `${speaker === 'ringside' ? 'Ringside' : 'Representative'} speaking` : 'Waiting for signal'}</p></div><span className="flex items-center gap-2 text-xs text-black/45">{state?.config.mode === 'human' ? <Phone className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />} {state?.config.mode === 'human' ? 'Phone' : 'AI vs AI'}</span></div><div ref={feedRef} className="flex-1 space-y-5 overflow-y-auto p-5 md:p-7">{turns.length === 0 && <LoadingTranscript status={status} />}{turns.map((turn, index) => <TranscriptTurn key={`${turn.speaker}-${turn.turn ?? index}`} turn={turn} company={state?.config.company || 'Representative'} />)}{status !== 'Complete' && status !== 'Error' && turns.length > 0 && <div className="flex items-center gap-2 py-2 text-xs text-black/35"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/35" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/35 [animation-delay:120ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/35 [animation-delay:240ms]" /></span>Analyzing the response…</div>}</div></section>
        <section className="rounded-2xl border border-[#E5E5E5] bg-white p-5 md:p-6"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">Negotiation</p><h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">The numbers</h2><div className="mt-8 space-y-6"><PriceBlock label="Current bill" value={currentPrice} muted /><div className="border-l border-[#B291E6] pl-4"><PriceBlock label="Current offer" value={latestOffer} highlight /><p className="mt-2 text-xs text-[#624799]">{latestOffer == null ? 'Waiting for the first offer' : saved ? `${money(saved)} lower per month` : 'No lower offer yet'}</p></div><PriceBlock label="Target" value={targetPrice} muted /></div><div className="mt-10 border-t border-[#E5E5E5] pt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/40">Offer movement</p><div className="mt-4 space-y-3">{turns.filter((turn) => turn.speaker === 'rep' && turn.offerDetected && turn.currentOffer != null && turn.currentOffer < currentPrice).map((turn, index) => <div key={`${turn.turn}-${index}`} className="flex items-center justify-between text-sm"><span className="text-black/45">{turn.action === 'fold' ? 'Retention offer' : 'Rep offer'}</span><span className="font-semibold">{money(turn.currentOffer)}</span></div>)}</div></div></section>
        <section className="rounded-2xl border border-black/10 bg-[#2B2644] p-5 text-white md:p-6"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Intelligence</p><h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">Agent status</h2><div className="mt-7 flex items-center gap-3 border-y border-white/12 py-4"><span className={`flex h-9 w-9 items-center justify-center border border-white/15 ${speaker ? 'text-[#B291E6]' : 'text-white/45'}`}><Sparkles className="h-4 w-4" /></span><div><p className="text-sm font-medium">{status === 'Complete' ? 'Verifying the deal' : status}</p><p className="mt-1 text-xs text-white/45">{speaker === 'rep' ? 'Listening for an offer or objection' : speaker === 'ringside' ? 'Making the next move' : 'State machine is ready'}</p></div></div><div className="mt-7"><div className="flex items-end justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Negotiation strength</p><span className="text-2xl font-semibold tracking-[-0.05em]">{strength}</span></div><div className="mt-3 h-1.5 rounded-full bg-white/12"><div className="h-full rounded-full bg-[#B291E6] transition-all duration-700" style={{ width: `${strength}%` }} /></div><p className="mt-3 text-xs leading-5 text-white/48">{saved > 0 ? 'The offer is moving in your direction.' : 'Add verified leverage to improve the position.'}</p></div><div className="mt-8 border-t border-white/12 pt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Strategy</p><p className="mt-3 text-sm leading-6 text-white/70">{turns.some((turn) => turn.action === 'lever_escalate') ? 'Escalation and retention review' : turns.some((turn) => turn.action === 'lever_loyalty_competitor') ? 'Loyalty and comparable pricing' : 'Opening the conversation'}</p></div><div className="mt-8 flex items-start gap-2 border-t border-white/12 pt-5 text-xs leading-5 text-white/42"><ShieldCheck className="h-4 w-4 shrink-0 text-[#B291E6]" />Private reasoning stays private. This panel shows only decision-relevant status.</div></section>
      </div>
      {report && <section className="mt-4 rounded-2xl border border-[#E5E5E5] bg-white p-5 md:p-7"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#624799]">Negotiation report</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">{report.outcome === 'won' ? 'A better deal is ready.' : 'The call is complete.'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">{report.summary}</p></div><div className="flex items-center gap-3"><div><p className="text-[10px] uppercase tracking-[0.12em] text-black/40">Monthly saving</p><p className="mt-1 text-2xl font-semibold tracking-[-0.05em]">{money(report.monthlySavings)}</p></div><Link to={`/negotiation/${callId}`} className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a2a2a]">View report <ChevronRight className="h-4 w-4" /></Link></div></div></section>}
      {state?.config.mode === 'human' && callId && <TakeoverControl callId={callId} takeover={state.takeover} onTakeover={(takeover) => setState((current) => current ? { ...current, takeover } : current)} onError={setError} />}
    </div>
  </main>
}

function PriceBlock({ label, value, muted, highlight }: { label: string; value: number | null | undefined; muted?: boolean; highlight?: boolean }) { return <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">{label}</p><p className={`mt-2 text-4xl font-semibold tracking-[-0.07em] ${muted ? 'text-black/55' : highlight ? 'text-[#624799]' : 'text-black'}`}>{money(value)}{value != null && <span className="ml-1 text-sm font-normal tracking-normal text-black/30">/mo</span>}</p></div> }
function TranscriptTurn({ turn, company }: { turn: Turn; company: string }) { const ringside = turn.speaker === 'ringside'; return <div className={`flex gap-3 ${ringside ? '' : 'flex-row-reverse'}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[10px] font-semibold ${ringside ? 'bg-white' : 'border border-[#E5E5E5] bg-[#F5F2FB] text-black/55'}`}>{ringside ? <img src="/ringside-logo1.png?v=20260814" alt="" className="h-full w-full scale-[1.35] object-contain mix-blend-multiply" /> : 'REP'}</div><div className={`max-w-[88%] ${ringside ? '' : 'text-right'}`}><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/38">{ringside ? 'Ringside' : company}</p><p className={`text-sm leading-6 ${ringside ? 'text-black' : 'text-black/65'}`}>{turn.text}</p>{turn.offerDetected && turn.currentOffer != null && turn.speaker === 'rep' && turn.currentOffer > 0 && <span className="mt-2 inline-block text-xs font-semibold text-[#624799]">Offer: {money(turn.currentOffer)}/mo</span>}</div></div> }
function TakeoverControl({ callId, takeover, onTakeover, onError }: { callId: string; takeover?: TakeoverState; onTakeover: (value: TakeoverState) => void; onError: (value: string | null) => void }) {
  const deviceRef = useRef<Device | null>(null)
  const connectionRef = useRef<Call | null>(null)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const phase = takeover?.phase || 'idle'
  const connecting = ['prepared', 'browser_joined', 'activating'].includes(phase) || busy

  useEffect(() => () => { deviceRef.current?.destroy(); deviceRef.current = null; connectionRef.current = null }, [])

  async function request(path: string) {
    const response = await fetch(`${API_BASE}/api/call/${callId}/takeover/${path}`, { method: 'POST', credentials: 'include' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Browser takeover could not be completed')
    return data
  }

  async function activateWithRetry() {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { return await request('activate') } catch (error) {
        lastError = error instanceof Error ? error : new Error('Browser microphone is still connecting')
        await new Promise((resolve) => window.setTimeout(resolve, 350))
      }
    }
    throw lastError || new Error('Browser microphone is still connecting')
  }

  async function takeOver() {
    setBusy(true); setLocalError(null); onError(null)
    try {
      const setup = await request('token')
      const { Device: VoiceDevice } = await import('@twilio/voice-sdk')
      const device = new VoiceDevice(setup.token)
      deviceRef.current = device
      device.on('error', (error) => setLocalError(error.message || 'Browser audio connection failed'))
      const connection = await device.connect({ params: { callId } })
      connectionRef.current = connection
      connection.on('disconnect', () => { connectionRef.current = null })
      const active = await activateWithRetry()
      onTakeover(active.takeover)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Browser takeover could not be started'
      setLocalError(message)
      await request('cancel').catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  async function returnToRingside() {
    setBusy(true); setLocalError(null)
    try {
      const response = await request('return')
      onTakeover(response.takeover)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not return control to Ringside')
    } finally {
      setBusy(false)
    }
  }

  if (!takeover?.available) return null
  const active = phase === 'active'
  return <section className="mt-4 flex flex-col gap-4 border border-[#E5E5E5] bg-white p-5 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${active ? 'bg-[#2B2644] text-white' : 'bg-[#F5F2FB] text-[#624799]'}`}><Mic className="h-4 w-4" /></span><div><p className="text-sm font-semibold">{active ? 'You are on the call' : connecting ? 'Connecting your microphone' : 'Take over the call'}</p><p className="mt-1 text-xs leading-5 text-black/45">{active ? 'Your browser microphone is connected to the live phone call.' : connecting ? 'Keep this page open while Ringside connects the call.' : 'Speak directly from this browser when you need to step in.'}</p>{localError && <p className="mt-2 text-xs text-red-600">{localError}</p>}</div></div>{active ? <button type="button" onClick={returnToRingside} disabled={busy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-black/15 px-4 py-2.5 text-sm font-semibold transition hover:border-black/40 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw className="h-4 w-4" />Return to Ringside</button> : <button type="button" onClick={takeOver} disabled={connecting || !takeover.canTakeOver} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-50"><Mic className="h-4 w-4" />{connecting ? 'Connecting' : 'Take over'}</button>}</section>
}
function LoadingTranscript({ status }: { status: string }) { return <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center"><CircleStop className="mb-4 h-6 w-6 animate-pulse text-black/25" /><p className="text-sm font-medium">{status === 'Preparing' ? 'Building the negotiation' : 'Waiting for the call to connect'}</p><p className="mt-2 text-xs text-black/38">The live transcript will appear here.</p></div> }
