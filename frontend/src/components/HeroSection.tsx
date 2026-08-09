import { ArrowRight } from 'lucide-react'

interface HeroSectionProps {
  onCta?: () => void
}

const BRANDS = [
  'Anthropic',
  'TWILIO',
  'Maya Research',
  'Claude',
  'NGROK',
]

function BrandMark({ brand }: { brand: string }) {
  if (brand === 'Anthropic') {
    return <img src="/brand/partners/anthropic.png" alt="Anthropic" className="w-[96px] h-auto" />
  }
  if (brand === 'TWILIO') {
    return <img src="/brand/partners/twilio.png" alt="Twilio" className="w-[78px] h-auto" />
  }
  if (brand === 'Maya Research') {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap text-black">
        <img src="/brand/partners/maya.png" alt="" className="w-5 h-5 object-contain" />
        <span className="text-sm font-semibold tracking-[0.01em]">Maya Research</span>
      </span>
    )
  }
  if (brand === 'Claude') {
    return <img src="/brand/partners/claude.png" alt="Claude" className="w-[90px] h-auto" />
  }
  return <span className="text-sm font-bold tracking-[0.06em] text-black">{brand}</span>
}

export default function HeroSection({ onCta }: HeroSectionProps) {
  return (
    <div className="flex-1 px-6 pt-20 pb-6 flex items-end">
      <div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{ height: 'calc(100vh - 96px)' }}
      >
        {/* Background video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          className="hero-video absolute inset-0 w-full h-full object-cover"
          src="/videos/lavender-icons-rising-loop-60fps.mp4"
        />

        {/* Content overlay */}
        <div className="hero-copy relative z-10 flex flex-col items-start justify-start h-full p-12 pt-36">
          <h1
            className="text-black text-5xl md:text-6xl font-medium leading-tight max-w-xl mb-4"
            style={{ letterSpacing: '-0.04em' }}
          >
            Negotiation,<br />represented.
          </h1>

          <p
            className="text-black/70 text-base md:text-lg max-w-md mb-8 leading-relaxed"
            style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
          >
            Ringside is an autonomous AI negotiation agent that represents you in real conversations, works within your limits, and pursues a better outcome.
          </p>

          {/* Get Started pill */}
          <button onClick={onCta} className="interactive-cta inline-flex items-center gap-3 bg-black text-white text-base md:text-lg font-medium pl-8 pr-2 py-2 rounded-full">
            Get Started
            <span className="bg-white rounded-full p-2">
              <ArrowRight className="w-5 h-5 text-black" />
            </span>
          </button>

          {/* Brand marquee */}
          <div className="mt-24 w-full max-w-md overflow-hidden">
            <div className="marquee-track">
              {[...BRANDS, ...BRANDS].map((brand, i) => (
                <span
                  key={i}
                  className="mx-7 inline-flex h-8 shrink-0 items-center whitespace-nowrap"
                >
                  <BrandMark brand={brand} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
