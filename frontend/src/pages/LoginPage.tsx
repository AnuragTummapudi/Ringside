import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { API_BASE } from '../api'
import { getNegotiationDraft } from '../negotiationDraft'
import LogoIcon from '../components/LogoIcon'

function safeReturnTo(value: string | null) {
  const path = value || '/new'
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : '/new'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('returnTo')), [searchParams])
  const draft = useMemo(() => getNegotiationDraft(), [])
  const [checking, setChecking] = useState(true)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' }).then((response) => response.ok ? response.json() : { user: null }),
      fetch(`${API_BASE}/api/auth/config`, { credentials: 'include' }).then((response) => response.ok ? response.json() : { googleEnabled: false }),
    ]).then(([me, config]) => {
      if (me.user) navigate(returnTo, { replace: true })
      setGoogleEnabled(Boolean(config.googleEnabled))
    }).catch(() => setError('We could not reach the sign-in service. Please try again.')).finally(() => setChecking(false))
  }, [navigate, returnTo])

  function continueWithGoogle() {
    if (!googleEnabled) {
      setError('Google sign-in is not configured yet.')
      return
    }
    setLoading(true)
    window.location.assign(`${API_BASE}/auth/google?returnTo=${encodeURIComponent(returnTo)}`)
  }

  return <main className="ringside-login-grid relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 py-10 text-black">
    <div aria-hidden="true" className="pointer-events-none absolute left-8 top-1/2 hidden -translate-y-1/2 lg:block"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/32">Your side</p><span className="mt-3 block h-16 w-px bg-black/15" /></div>
    <div aria-hidden="true" className="pointer-events-none absolute bottom-10 right-10 hidden text-right lg:block"><span className="block h-px w-20 bg-black/15" /><p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-black/32">Private record</p></div>

    <section className="login-reveal relative z-10 w-full max-w-[470px] text-center">
      <LogoIcon className="mx-auto h-16 w-16" />
      <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/42">Ringside</p>
      <h1 className="login-title mt-4 text-4xl font-semibold leading-[1.06] tracking-[-0.055em] sm:text-5xl">A better deal<br />starts here.</h1>
      <p className="login-reveal-delay mt-4 text-base leading-7 text-black/55">Sign in to keep every negotiation in your corner.</p>

      <div className="login-reveal-delay mt-10">
        <button type="button" onClick={continueWithGoogle} disabled={checking || loading} className="flex w-full items-center justify-center gap-3 rounded-full border border-black/10 bg-white px-6 py-4 text-base font-semibold text-[#26232A] shadow-[0_14px_28px_rgba(49,39,78,.1)] transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_18px_32px_rgba(49,39,78,.14)] active:translate-y-0 active:scale-[0.99] disabled:cursor-wait disabled:opacity-55"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="h-5 w-5" />{loading ? 'Opening Google…' : checking ? 'Checking sign-in…' : 'Continue with Google'}</button>
      </div>

      {draft && <div className="login-reveal-delay mt-7 border-t border-black/10 pt-5 text-sm text-black/58"><p className="flex items-center justify-center gap-2"><Check className="h-4 w-4 text-[#624799]" />Your negotiation details are saved.</p><p className="mt-2 text-xs text-black/42">{draft.form.company || 'Your draft'} will be ready when you return.</p></div>}
      {error && <p role="alert" className="mt-6 text-sm text-red-700">{error}</p>}
    </section>
  </main>
}
