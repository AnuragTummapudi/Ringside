import { ArrowRight } from 'lucide-react'
import { MotionItem, Reveal, Stagger } from './Motion'

const INFO_IMAGE =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260423_164207_f243351d-ed59-48ec-83a0-a5e996bdbe3c.png&w=1280&q=85'

export default function InfoSection() {
  return (
    <section className="bg-[#F5F5F5] px-6 py-24">
      <Reveal className="max-w-[88rem] mx-auto">
        {/* Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2
              className="text-black text-4xl md:text-5xl font-medium leading-tight mb-8"
              style={{ letterSpacing: '-0.03em' }}
            >
              Meet Ringside.
            </h2>
            <button className="interactive-cta inline-flex items-center gap-3 bg-black text-white text-base font-medium pl-8 pr-2 py-2 rounded-full">
              See it in action
              <span className="bg-white rounded-full p-2">
                <ArrowRight className="w-4 h-4 text-black" />
              </span>
            </button>
          </div>

          <div className="flex items-center">
            <p className="text-black/70 text-2xl md:text-3xl leading-relaxed">
              Ringside represents you in live negotiations. It reads resistance, weighs the available leverage, and chooses the next move while the conversation is happening.
            </p>
          </div>
        </div>

        {/* Row 2 — 4-col card grid */}
        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: bg image, spans 2 cols */}
          <MotionItem className="lg:col-span-2"><div
            className="interactive-card lg:col-span-2 rounded-2xl"
            style={{
              backgroundImage: `url('${INFO_IMAGE}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="p-7 min-h-80 flex flex-col justify-between">
              <h3
                className="text-black text-2xl font-medium leading-snug"
                style={{ letterSpacing: '-0.02em' }}
              >
                Built for the conversation
              </h3>
              <p className="text-black/70 text-base max-w-xs">
                Every call is guided by your target, constraints, and the room to make a reasonable deal.
              </p>
            </div>
          </div></MotionItem>

          {/* Card 2 */}
          <MotionItem><div className="interactive-card rounded-2xl p-7 min-h-80 flex flex-col justify-between" style={{ backgroundColor: '#2B2644' }}>
            <h3 className="text-white text-2xl font-medium leading-snug" style={{ letterSpacing: '-0.02em' }}>
              Prepared before<br />the call starts.
            </h3>
            <p className="text-white/60 text-base">
              Ringside enters with the facts, the context, and the terms you are prepared to accept.
            </p>
          </div></MotionItem>

          {/* Card 3 */}
          <MotionItem><div className="interactive-card rounded-2xl p-7 min-h-80 flex flex-col justify-between" style={{ backgroundColor: '#2B2644' }}>
            <h3 className="text-white text-2xl font-medium leading-snug" style={{ letterSpacing: '-0.02em' }}>
              Steady through<br />the pushback.
            </h3>
            <p className="text-white/60 text-base">
              It listens, responds naturally, and keeps the negotiation moving without losing sight of your limit.
            </p>
          </div></MotionItem>
        </Stagger>
      </Reveal>
    </section>
  )
}
