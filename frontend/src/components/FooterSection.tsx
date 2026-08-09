import { ArrowRight } from 'lucide-react'
import LogoIcon from './LogoIcon'

const NAV_COLS = [
  {
    heading: 'Product',
    links: ['How it works', 'Use cases', 'Pricing', 'Changelog'],
  },
  {
    heading: 'Company',
    links: ['About', 'Blog', 'Careers', 'Press'],
  },
  {
    heading: 'Legal',
    links: ['Privacy', 'Terms', 'Security'],
  },
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

          {/* Top row: brand + nav cols */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <LogoIcon className="w-6 h-6 text-black" />
                <span
                  className="text-xl font-medium text-black"
                  style={{ letterSpacing: '-0.03em' }}
                >
                  Ringside
                </span>
              </div>
              <p className="text-black/75 text-sm leading-relaxed max-w-[200px]">
                The AI that fights for you on the phone.
              </p>
            </div>

            {/* Nav columns */}
            {NAV_COLS.map((col) => (
              <div key={col.heading}>
                <p className="text-black text-xs font-medium tracking-[.12em] uppercase mb-5">
                  {col.heading}
                </p>
                <ul className="flex flex-col gap-3">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-black/75 text-sm hover:text-black transition-colors duration-200"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-8">
            <p className="text-black/70 text-sm">
              &copy; 2026 Ringside. All rights reserved.
            </p>
            <p className="text-black/70 text-xs">
              Built at Push to Prod &mdash; Anthropic &times; Elevation Capital, Bengaluru
            </p>
          </div>

        </div>
      </footer>
    </>
  )
}
