import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import LogoIcon from './LogoIcon'

const FOOTER_LINKS = [
  { label: 'How it works', to: '/how-to-use' },
  { label: 'Use cases', to: '/use-cases' },
]

export default function FooterSection({ onCta }: { onCta?: () => void }) {
  return (
    <>
      {/* ── CTA Band ── */}
      <section className="bg-black px-6 py-28">
        <div className="max-w-[88rem] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-10">
          <div>
            <h2
              className="text-white text-5xl md:text-6xl font-medium leading-tight mb-4"
              style={{ letterSpacing: '-0.04em' }}
            >
              Ready to<br />win your call?
            </h2>
            <p className="text-white/50 text-lg leading-relaxed max-w-sm">
              Set your target, hit start, and let Ringside do the rest.
            </p>
          </div>

          <button onClick={onCta} className="interactive-cta inline-flex items-center gap-3 bg-white text-black text-base font-medium pl-8 pr-2 py-2 rounded-full self-start md:self-center">
            Start a Call
            <span className="bg-black rounded-full p-2">
              <ArrowRight className="w-5 h-5 text-white" />
            </span>
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative isolate min-h-[440px] overflow-hidden border-t border-[#E5E5E5] bg-[#E7E5F0] px-6 py-16">
        <div className="footer-scene-image absolute inset-0" aria-hidden="true" />
        <div className="footer-content relative z-10 max-w-[88rem] mx-auto">

          {/* Top row: brand + current product navigation */}
          <div className="flex flex-col justify-between gap-12 md:flex-row md:items-start mb-16">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <LogoIcon className="w-6 h-6 text-black" />
                <span
                  className="text-xl font-medium text-black"
                  style={{ letterSpacing: '-0.03em' }}
                >
                  RINGSIDE
                </span>
              </div>
              <p className="text-black/75 text-sm leading-relaxed max-w-[200px]">
                Stop overpaying for your bills.<br />AI that calls. Negotiates. Saves.
              </p>
            </div>

            <div className="md:pr-24">
              <p className="text-black text-xs font-medium tracking-[.12em] uppercase mb-5">Explore</p>
              <ul className="flex flex-col gap-3">
                {FOOTER_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="text-black/75 text-sm hover:text-black transition-colors duration-200">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-black/10 pt-8">
            <p className="text-black/70 text-sm">
              &copy; 2026 Ringside. All rights reserved.
            </p>
          </div>

        </div>
      </footer>
    </>
  )
}
