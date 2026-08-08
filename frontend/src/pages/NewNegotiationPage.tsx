import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowRight, ArrowLeft, Bot, Phone } from 'lucide-react'
import LogoIcon from '../components/LogoIcon'

interface FormState {
  company: string
  dialCode: string
  localPhone: string
  currentPrice: string
  targetPrice: string
  notes: string
  mode: 'agent' | 'human'
}

const COUNTRIES = [
  { code: 'IN', flag: '🇮🇳', name: 'India',         dialCode: '+91',  minLen: 10, maxLen: 10 },
  { code: 'US', flag: '🇺🇸', name: 'United States', dialCode: '+1',   minLen: 10, maxLen: 10 },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom',dialCode: '+44',  minLen: 10, maxLen: 10 },
  { code: 'AE', flag: '🇦🇪', name: 'UAE',           dialCode: '+971', minLen: 9,  maxLen: 9  },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore',     dialCode: '+65',  minLen: 8,  maxLen: 8  },
]

export default function NewNegotiationPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>({
    company: '',
    dialCode: '+91',
    localPhone: '',
    currentPrice: '',
    targetPrice: '',
    notes: '',
    mode: 'agent',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const cur = parseInt(form.currentPrice, 10)
    const tar = parseInt(form.targetPrice, 10)
    if (!form.company.trim())   return setError('Company name is required.')
    if (isNaN(cur) || cur <= 0) return setError('Enter a valid current price.')
    if (isNaN(tar) || tar <= 0) return setError('Enter a valid target price.')
    if (tar >= cur)             return setError('Target price must be lower than current price.')

    // Phone validation for human mode
    let phone: string | undefined
    if (form.mode === 'human') {
      const digits = form.localPhone.replace(/\D/g, '')
      const country = COUNTRIES.find((c) => c.dialCode === form.dialCode) ?? COUNTRIES[0]
      if (!digits) return setError('Phone number is required for real-call mode.')
      if (digits.length < country.minLen || digits.length > country.maxLen) {
        return setError(`Phone number must be ${country.minLen} digits for ${country.name}.`)
      }
      phone = `${form.dialCode}${digits}`
    }

    setLoading(true)
    setError(null)

    try {
      const resp = await fetch('/api/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company:      form.company.trim(),
          phone,
          currentPrice: cur,
          targetPrice:  tar,
          notes:        form.notes.trim(),
          mode:         form.mode,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Failed to start call')
      navigate(`/call/${data.callId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      {/* Minimal nav */}
      <nav className="px-8 py-5 flex items-center justify-between border-b border-[#E5E5E5] bg-white">
        <Link to="/" className="flex items-center gap-2 text-black">
          <LogoIcon className="w-6 h-6" />
          <span className="text-lg font-medium" style={{ letterSpacing: '-0.03em' }}>Ringside</span>
        </Link>
        <Link to="/history" className="text-sm font-medium text-black/50 hover:text-black transition-colors duration-200">
          History
        </Link>
      </nav>

      {/* Main */}
      <div className="flex-1 flex items-start justify-center px-6 py-16">
        <div className="w-full max-w-2xl">

          {/* Back */}
          <Link to="/" className="inline-flex items-center gap-2 text-black/40 hover:text-black text-sm font-medium transition-colors duration-200 mb-10">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>

          {/* Heading */}
          <h1
            className="text-5xl font-medium text-black mb-3"
            style={{ letterSpacing: '-0.04em' }}
          >
            New negotiation
          </h1>
          <p className="text-black/50 text-base mb-12">
            Tell Ringside what to fight for. It handles the rest.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">

            {/* Company */}
            <Field label="Company / service name" required>
              <input
                type="text"
                placeholder="e.g. Airtel, Netflix, Jio"
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-black text-base placeholder-black/30 focus:outline-none focus:border-black/40 transition-colors"
              />
            </Field>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Current monthly bill (₹)" required>
                <input
                  type="number"
                  placeholder="1499"
                  min={1}
                  value={form.currentPrice}
                  onChange={(e) => set('currentPrice', e.target.value)}
                  className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-black text-base placeholder-black/30 focus:outline-none focus:border-black/40 transition-colors"
                />
              </Field>
              <Field label="Target price (₹)" required>
                <input
                  type="number"
                  placeholder="999"
                  min={1}
                  value={form.targetPrice}
                  onChange={(e) => set('targetPrice', e.target.value)}
                  className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-black text-base placeholder-black/30 focus:outline-none focus:border-black/40 transition-colors"
                />
              </Field>
            </div>

            {/* Notes */}
            <Field label="Context / leverage (optional)">
              <textarea
                placeholder="e.g. Customer for 3 years, competitor offers ₹950 for same speed, threatening to cancel"
                rows={3}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-black text-base placeholder-black/30 focus:outline-none focus:border-black/40 transition-colors resize-none"
              />
            </Field>

            {/* Mode toggle */}
            <div>
              <label className="block text-xs font-medium text-black/50 uppercase tracking-[.12em] mb-3">
                Who answers the call?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <ModeCard
                  selected={form.mode === 'agent'}
                  onClick={() => set('mode', 'agent')}
                  icon={<Bot className="w-5 h-5" />}
                  title="AI Agent"
                  desc="Ringside vs. a scripted AI rep — instant, repeatable demo"
                />
                <ModeCard
                  selected={form.mode === 'human'}
                  onClick={() => set('mode', 'human')}
                  icon={<Phone className="w-5 h-5" />}
                  title="Real call"
                  desc="Ringside negotiates live with whoever actually picks up"
                />
              </div>
            </div>

            {/* Phone (required for human mode) */}
            {form.mode === 'human' && (
              <Field label="Phone number to call" required>
                <PhoneField
                  dialCode={form.dialCode}
                  localPhone={form.localPhone}
                  onDialCode={(v) => set('dialCode', v)}
                  onLocalPhone={(v) => set('localPhone', v)}
                />
              </Field>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-3 bg-black text-white text-base font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-900 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed self-start mt-2"
            >
              {loading ? 'Starting call…' : 'Start negotiation'}
              <span className="bg-white rounded-full p-2">
                <ArrowRight className="w-5 h-5 text-black" />
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-black/50 uppercase tracking-[.12em] mb-2">
        {label}{required && <span className="text-black/30 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}

function PhoneField({
  dialCode, localPhone, onDialCode, onLocalPhone,
}: {
  dialCode: string
  localPhone: string
  onDialCode: (v: string) => void
  onLocalPhone: (v: string) => void
}) {
  const selected = COUNTRIES.find((c) => c.dialCode === dialCode) ?? COUNTRIES[0]

  return (
    <div className="flex rounded-xl border border-[#E5E5E5] bg-white overflow-hidden focus-within:border-black/40 transition-colors">
      {/* Country select */}
      <div className="relative flex-shrink-0 border-r border-[#E5E5E5]">
        <select
          value={dialCode}
          onChange={(e) => onDialCode(e.target.value)}
          className="appearance-none bg-transparent pl-3 pr-7 py-3 text-base text-black focus:outline-none cursor-pointer"
          style={{ minWidth: '90px' }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.dialCode}>
              {c.flag} {c.dialCode}
            </option>
          ))}
        </select>
        {/* Chevron */}
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-black/30 text-xs">▾</div>
      </div>

      {/* Local number input */}
      <input
        type="tel"
        placeholder={selected.minLen === 10 ? '9876543210' : `${selected.minLen}-digit number`}
        value={localPhone}
        onChange={(e) => onLocalPhone(e.target.value)}
        className="flex-1 bg-transparent px-4 py-3 text-black text-base placeholder-black/30 focus:outline-none"
      />
    </div>
  )
}

function ModeCard({
  selected, onClick, icon, title, desc,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-all duration-200 ${
        selected
          ? 'bg-black text-white border-black'
          : 'bg-white text-black border-[#E5E5E5] hover:border-black/30'
      }`}
    >
      <div className={`mb-2 ${selected ? 'text-white' : 'text-black/60'}`}>{icon}</div>
      <div className="font-medium text-sm mb-1">{title}</div>
      <div className={`text-xs leading-relaxed ${selected ? 'text-white/60' : 'text-black/40'}`}>{desc}</div>
    </button>
  )
}
