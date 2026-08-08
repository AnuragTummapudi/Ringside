const BACKERS = [
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
    label: 'Vercel',
    style: { fontFamily: 'Helvetica, sans-serif', fontWeight: 700, letterSpacing: '-0.01em', fontSize: '15px' },
  },
  {
    label: 'NGROK',
    style: { fontFamily: 'Verdana, sans-serif', fontWeight: 700, letterSpacing: '0.06em', fontSize: '14px', textTransform: 'uppercase' as const },
  },
  {
    label: 'NODE.JS',
    style: { fontFamily: "'Courier New', monospace", fontWeight: 700, letterSpacing: '0.18em', fontSize: '14px' },
  },
  {
    label: 'React',
    style: { fontFamily: "'Palatino', serif", fontWeight: 500, letterSpacing: '0.03em', fontSize: '15px' },
  },
]

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
                className="mx-10 shrink-0 text-black/50 whitespace-nowrap"
                style={backer.style}
              >
                {backer.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
