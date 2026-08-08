import { ArrowRight } from 'lucide-react'

const INFO_IMAGE =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260423_164207_f243351d-ed59-48ec-83a0-a5e996bdbe3c.png&w=1280&q=85'

export default function InfoSection() {
  return (
    <section className="bg-[#F5F5F5] px-6 py-24">
      <div className="max-w-[88rem] mx-auto">
        {/* Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
          <div>
            <h2
              className="text-black text-4xl md:text-5xl font-medium leading-tight mb-8"
              style={{ letterSpacing: '-0.03em' }}
            >
              Meet Ringside.
            </h2>
            <button className="inline-flex items-center gap-3 bg-black text-white text-base font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-800 transition-colors duration-200">
              See it in action
              <span className="bg-white rounded-full p-2">
                <ArrowRight className="w-4 h-4 text-black" />
              </span>
            </button>
          </div>

          <div className="flex items-center">
            <p className="text-black/70 text-2xl md:text-3xl leading-relaxed">
              Ringside is a voice agent that calls on your behalf and negotiates live — holding its ground, reading pushback, and closing on your terms.
            </p>
          </div>
        </div>

        {/* Row 2 — 4-col card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: bg image, spans 2 cols */}
          <div
            className="lg:col-span-2 rounded-2xl"
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
                Built to win
              </h3>
              <p className="text-black/70 text-base max-w-xs">
                Every call runs a live negotiation loop — reading resistance, choosing the right lever, and pushing until it converges on your target.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl p-7 min-h-80 flex flex-col justify-between" style={{ backgroundColor: '#2B2644' }}>
            <h3 className="text-white text-2xl font-medium leading-snug" style={{ letterSpacing: '-0.02em' }}>
              Always sharp,<br />always prepared.
            </h3>
            <p className="text-white/60 text-base">
              Every argument is backed by real leverage — history, comparisons, and a credible walk-away.
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-2xl p-7 min-h-80 flex flex-col justify-between" style={{ backgroundColor: '#2B2644' }}>
            <h3 className="text-white text-2xl font-medium leading-snug" style={{ letterSpacing: '-0.02em' }}>
              Fully<br />autonomous.
            </h3>
            <p className="text-white/60 text-base">
              No scripts to babysit. Ringside runs the whole call itself, live, start to finish.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
