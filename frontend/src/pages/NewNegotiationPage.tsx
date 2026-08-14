import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Bot, Check, FileText, Phone, Sparkles, UploadCloud, X } from 'lucide-react'
import LogoIcon from '../components/LogoIcon'
import { API_BASE } from '../api'
import { BillDraft, NegotiationFormDraft, clearNegotiationDraft, getNegotiationDraft, saveNegotiationDraft } from '../negotiationDraft'

type BillData = BillDraft
type FormState = NegotiationFormDraft

interface AuthUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

const inputClass = 'w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-black/50 focus:ring-2 focus:ring-[rgba(98,71,153,.12)]'

export default function NewNegotiationPage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>({ company: '', currentPrice: '', targetPrice: '', notes: '', tenure: '', competitor: '', phone: '', mode: 'agent' })
  const [bill, setBill] = useState<BillData | null>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)

  useEffect(() => {
    const draft = getNegotiationDraft()
    if (draft) {
      setForm(draft.form)
      setBill(draft.bill)
      setUploadState(draft.uploadState === 'processing' ? 'idle' : draft.uploadState)
      setSuggestion(draft.suggestion)
      setDraftRestored(true)
    }
    fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' }).then((response) => response.ok ? response.json() : { user: null }).then((me) => {
      setUser(me.user || null)
    }).catch(() => setUser(null)).finally(() => setAuthChecked(true))
  }, [])

  function continueToLogin() {
    saveNegotiationDraft({ form, bill, uploadState, suggestion })
    navigate('/login?returnTo=/new')
  }

  async function signOut() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    setUser(null)
  }

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setError(null)
  }

  async function uploadBill(file: File) {
    setUploadState('processing')
    setError(null)
    const data = new FormData()
    data.append('bill', file)
    try {
      const response = await fetch(`${API_BASE}/api/bills/upload`, { method: 'POST', body: data, credentials: 'include' })
      const payload = await response.json()
      if (!response.ok && !payload.bill) throw new Error(payload.error || payload.message || 'Could not analyze this bill')
      const extracted = payload.bill as BillData
      setBill(extracted)
      setForm((current) => ({
        ...current,
        company: extracted.provider || current.company,
        currentPrice: extracted.currentMonthlyPrice ? String(extracted.currentMonthlyPrice) : current.currentPrice,
        tenure: extracted.customerTenure || current.tenure,
        notes: [current.notes, extracted.planName, extracted.speed, extracted.contractStatus].filter(Boolean).join(', '),
      }))
      setUploadState(payload.success ? 'done' : 'error')
      if (!payload.success) setError(payload.message || 'We could not read the document. You can continue with manual entry.')
    } catch (uploadError) {
      setUploadState('error')
      setError(uploadError instanceof Error ? uploadError.message : 'Bill upload failed')
    }
  }

  async function suggestTarget() {
    const current = Number(form.currentPrice)
    if (!current || current < 2) return setError('Enter your current bill first.')
    setSuggesting(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/api/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ company: form.company, notes: `${form.notes} ${form.competitor}`, bill, targetPrice: Math.round(current * 0.7) }),
      })
      const payload = await response.json()
      const suggested = payload.research?.sources?.length ? Math.round(current * 0.72 / 10) * 10 : Math.round(current * 0.7 / 10) * 10
      setSuggestion(suggested)
      setForm((currentForm) => ({ ...currentForm, targetPrice: String(suggested) }))
    } catch {
      const suggested = Math.round(current * 0.7 / 10) * 10
      setSuggestion(suggested)
      setForm((currentForm) => ({ ...currentForm, targetPrice: String(suggested) }))
    } finally {
      setSuggesting(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!user) {
      if (!authChecked) return setError('Checking your sign-in status. Please try again in a moment.')
      continueToLogin()
      return
    }
    const currentPrice = Number(form.currentPrice)
    const targetPrice = Number(form.targetPrice)
    if (!form.company.trim()) return setError('Add the company or service name.')
    if (!currentPrice || currentPrice < 1) return setError('Add your current monthly bill.')
    if (!targetPrice || targetPrice >= currentPrice) return setError('Target price must be lower than your current bill.')
    if (form.mode === 'human' && !/^\+[1-9]\d{7,14}$/.test(form.phone.replace(/[^\d+]/g, ''))) return setError('Use an international phone number, for example +919876543210.')
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/api/call/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          company: form.company.trim(), currentPrice, targetPrice,
          notes: [form.notes, form.tenure && `Customer tenure: ${form.tenure}`, form.competitor && `Comparable offer: ${form.competitor}`].filter(Boolean).join('. '),
          bill, mode: form.mode, phone: form.phone.replace(/[^\d+]/g, ''), transport: form.mode === 'human' ? 'twilio' : 'demo',
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not start negotiation')
      clearNegotiationDraft()
      navigate(`/call/${payload.callId}`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not start negotiation')
      setLoading(false)
    }
  }

  const current = Number(form.currentPrice) || 0
  const target = Number(form.targetPrice) || 0
  const savings = current > target && target > 0 ? current - target : 0
  const strength = Math.min(98, Math.max(22, Math.round(48 + (form.tenure ? 15 : 0) + (form.competitor ? 20 : 0) + (bill ? 8 : 0) + (target && current ? 10 : 0))))

  return (
    <main className="min-h-screen bg-[#F5F5F5] text-black">
      <header className="border-b border-black/10 bg-white">
        <div className="ringside-page-container flex h-[72px] items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="Ringside home"><LogoIcon className="h-7 w-7" /><span className="text-xl font-semibold tracking-[-0.04em]">Ringside</span></Link>
          <div className="flex items-center gap-4">
            {user ? <><span className="hidden text-sm text-black/50 sm:inline">{user.name}</span><button type="button" onClick={() => void signOut()} className="text-sm font-medium text-black/55 transition hover:text-black">Sign out</button></> : <button type="button" onClick={continueToLogin} className="text-sm font-medium text-black/55 transition hover:text-black">Sign in</button>}
            <Link to="/history" className="text-sm font-medium text-black/55 transition hover:text-black">History</Link>
          </div>
        </div>
      </header>

      <div className="ringside-page-container py-7 md:pb-14 md:pt-9">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-black/45 transition hover:text-black"><ArrowLeft className="h-4 w-4" /> Back</Link>
        <div className="mb-8 max-w-2xl md:mb-9">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/42">New negotiation</p>
          <h1 className="text-4xl font-semibold leading-[1.03] tracking-[-0.055em] md:text-6xl">Tell Ringside what to fight for.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-black/55">Upload the bill or enter it manually. Ringside will turn the details into a clear negotiating position.</p>
        </div>

        {draftRestored && <div className="mb-6 flex items-center gap-2 border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-black/58"><Check className="h-4 w-4 shrink-0 text-[#624799]" />Your saved negotiation details are ready.</div>}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
          <form onSubmit={submit} className="rounded-2xl border border-[#E5E5E5] bg-white p-5 md:p-8">
            <div className="mb-8 flex items-center justify-between border-b border-black/10 pb-5"><div><h2 className="text-lg font-semibold tracking-[-0.03em]">Negotiation setup</h2><p className="mt-1 text-sm text-black/45">The essentials are enough to start.</p></div><span className="text-xs text-black/35">01 / 01</span></div>

            <div className="mb-8">
              <div className="mb-3 flex items-center justify-between"><label className="text-sm font-semibold">Upload your bill</label><span className="text-xs text-black/38">PDF, PNG, JPG · 8 MB</span></div>
              <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadBill(file) }} className="group flex min-h-[148px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-black/20 bg-[#F7F4FB] px-5 text-center transition hover:border-black/50 hover:bg-[#F5F2FB]">
                <UploadCloud className="mb-3 h-6 w-6 text-black/45 transition group-hover:-translate-y-0.5 group-hover:text-black" />
                <span className="text-sm font-medium">{uploadState === 'processing' ? 'Analyzing your bill…' : uploadState === 'done' ? 'Bill analyzed. Replace file' : 'Drop a bill here or browse'}</span>
                <span className="mt-1 text-xs text-black/40">We extract only the fields needed for negotiation.</span>
              </button>
              <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt,.md" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadBill(file) }} />
              {bill && <div className="mt-3 flex items-center justify-between rounded-xl border border-[#E5E5E5] bg-[#F7F4FB] px-3 py-2.5 text-xs"><span className="flex items-center gap-2"><FileText className="h-4 w-4 text-black/45" />{bill.sourceFilename || 'Uploaded bill'}<Check className="h-4 w-4 text-[#624799]" /></span><button type="button" onClick={() => { setBill(null); setUploadState('idle') }} aria-label="Remove bill"><X className="h-4 w-4 text-black/35" /></button></div>}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Company or service" required><input className={inputClass} value={form.company} onChange={(event) => update('company', event.target.value)} placeholder="Airtel, Netflix, Jio" /></Field>
              <Field label="Customer tenure"><input className={inputClass} value={form.tenure} onChange={(event) => update('tenure', event.target.value)} placeholder="3 years" /></Field>
              <Field label="Current monthly bill" required><MoneyInput value={form.currentPrice} onChange={(value) => update('currentPrice', value)} /></Field>
              <Field label="Target price" required><div className="flex gap-2"><MoneyInput value={form.targetPrice} onChange={(value) => update('targetPrice', value)} /><button type="button" title="Suggest a target" onClick={() => void suggestTarget()} className="interactive-cta flex shrink-0 items-center justify-center rounded-full border border-black bg-black px-3 text-white transition hover:bg-[#303030] disabled:opacity-50" disabled={suggesting}>{suggesting ? <span className="text-xs">…</span> : <Sparkles className="h-4 w-4" />}</button></div>{suggestion && <p className="mt-2 text-xs text-[#624799]">Suggested from your current bill: ₹{suggestion.toLocaleString('en-IN')}</p>}</Field>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <Field label="Comparable offer"><MoneyInput value={form.competitor} onChange={(value) => update('competitor', value)} placeholder="Optional" /></Field>
              <Field label="Context"><input className={inputClass} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Plan, promotion, contract details" /></Field>
            </div>

            <div className="mt-8 border-t border-[#E5E5E5] pt-6"><p className="mb-3 text-sm font-semibold">How should Ringside connect?</p><div className="grid gap-3 md:grid-cols-2"><ModeButton selected={form.mode === 'agent'} onClick={() => update('mode', 'agent')} icon={<Bot className="h-4 w-4" />} title="Demo mode" text="Instant AI vs AI negotiation" /><ModeButton selected={form.mode === 'human'} onClick={() => update('mode', 'human')} icon={<Phone className="h-4 w-4" />} title="Real call" text="Use Twilio to call a person" /></div>{form.mode === 'human' && <div className="mt-4"><Field label="International phone number" required><input className={inputClass} value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+919876543210" /></Field></div>}</div>

            {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <button type="submit" disabled={loading} className="interactive-cta mt-8 inline-flex items-center gap-3 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:translate-y-px disabled:cursor-wait disabled:opacity-50">{loading ? 'Preparing…' : 'Start negotiation'}<ArrowRight className="h-4 w-4" /></button>
          </form>

          <aside className="self-start rounded-2xl border border-black/10 bg-[#2B2644] p-6 text-white lg:sticky lg:top-6 md:p-7">
            <div className="mb-8 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Ringside preview</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">Your negotiating position</h2></div><Shield /></div>
            <div className="border-y border-white/12 py-5"><PreviewRow label="Company" value={form.company || 'Your provider'} /><PreviewRow label="Current bill" value={current ? `₹${current.toLocaleString('en-IN')}/mo` : 'Add a bill'} /><PreviewRow label="Target" value={target ? `₹${target.toLocaleString('en-IN')}/mo` : 'Set a target'} /></div>
            <div className="grid grid-cols-2 gap-3 border-b border-white/12 py-5"><Metric label="Potential saving" value={savings ? `₹${savings.toLocaleString('en-IN')}` : '—'} /><Metric label="Strength" value={`${strength}/100`} /></div>
            <div className="py-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/42">Opening strategy</p><p className="mt-3 text-sm leading-6 text-white/70">{form.competitor ? 'Lead with a comparable offer, then use loyalty and retention pressure.' : 'Start with loyalty and a clear request, then ask for a retention review.'}</p></div>
            <div className="flex items-start gap-2 border-t border-white/12 pt-5 text-xs leading-5 text-white/45"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#B291E6]" />Your notes stay inside the negotiation context and are filtered before reaching the voice agent.</div>
          </aside>
        </div>
      </div>
    </main>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <label className="block text-sm font-medium text-black/72"><span className="mb-2 block">{label}{required && <span className="ml-1 text-black/35">*</span>}</span>{children}</label> }
function MoneyInput({ value, onChange, placeholder = '₹ 1,499' }: { value: string; onChange: (value: string) => void; placeholder?: string }) { return <div className="relative flex-1"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-black/35">₹</span><input type="number" min="1" className={`${inputClass} pl-8`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder.replace('₹ ', '')} /></div> }
function ModeButton({ selected, onClick, icon, title, text }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) { return <button type="button" onClick={onClick} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${selected ? 'border-[#2B2644] bg-[#2B2644] text-white' : 'border-[#E5E5E5] bg-white text-black hover:border-black/35'}`}><span className={`mt-0.5 ${selected ? 'text-white' : 'text-black/45'}`}>{icon}</span><span><span className="block text-sm font-semibold">{title}</span><span className={`mt-1 block text-xs ${selected ? 'text-white/58' : 'text-black/42'}`}>{text}</span></span></button> }
function PreviewRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 py-2 text-sm"><span className="text-white/45">{label}</span><span className="text-right font-medium">{value}</span></div> }
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-[0.12em] text-white/42">{label}</p><p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{value}</p></div> }
function Shield({ className = '' }: { className?: string }) { return <span className={`flex h-8 w-8 items-center justify-center border border-white/15 text-[#B291E6] ${className}`}><Check className="h-4 w-4" /></span> }
