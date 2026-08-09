import type { CSSProperties } from 'react'

type Backer = {
  label: string
  style?: CSSProperties
}

const BACKERS: Backer[] = [
  {
    label: 'Anthropic',
    style: { fontFamily: "'Times New Roman', serif", fontWeight: 400, letterSpacing: '0.02em', fontSize: '14px' },
  },
  {
    label: 'TWILIO',
    style: { fontFamily: "'Arial Black', sans-serif", fontWeight: 900, letterSpacing: '0.08em', fontSize: '16px' },
  },
  {
    label: 'Maya Research',
    style: { fontFamily: 'Impact, sans-serif', fontWeight: 700, letterSpacing: '0.05em', fontSize: '18px' },
  },
  {
    label: 'Claude',
    style: { fontFamily: 'Georgia, serif', fontWeight: 600, letterSpacing: '-0.02em', fontSize: '17px' },
  },
  {
    label: 'NGROK',
    style: { fontFamily: 'Verdana, sans-serif', fontWeight: 700, letterSpacing: '0.06em', fontSize: '14px', textTransform: 'uppercase' as const },
  },
]

function MayaMark() {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-black">
      <img src="/brand/partners/maya.png" alt="" className="w-6 h-6 object-contain" />
      <span className="text-[16px] font-semibold tracking-[0.01em]">Maya Research</span>
    </span>
  )
}

function BackerMark({ backer }: { backer: Backer }) {
  if (backer.label === 'Anthropic') {
    return <img src="/brand/partners/anthropic.png" alt="Anthropic" className="w-[112px] h-auto" />
  }
  if (backer.label === 'TWILIO') {
    return <img src="/brand/partners/twilio.png" alt="Twilio" className="w-[88px] h-auto" />
  }
  if (backer.label === 'Maya Research') {
    return <MayaMark />
  }
  if (backer.label === 'Claude') {
    return <img src="/brand/partners/claude.png" alt="Claude" className="w-[104px] h-auto" />
  }

  return <span style={backer.style}>{backer.label}</span>
}

export default function BackedBySection() {
  return (
    <section className="bg-[#F5F5F5] px-6 py-16">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 items-center">
        {/* Left: text */}
        <p className="text-black/70 text-base leading-relaxed">
          Built on trusted infrastructure<br />and cutting-edge AI.
        </p>

        {/* Right: marquee (3/4 width) */}
        <div className="md:col-span-3 overflow-hidden">
          <div className="backers-track">
            {[...BACKERS, ...BACKERS].map((backer, i) => (
              <span
                key={i}
                className="mx-10 inline-flex h-8 shrink-0 items-center text-black whitespace-nowrap"
              >
                <BackerMark backer={backer} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
