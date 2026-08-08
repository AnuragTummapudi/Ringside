const STEPS = [
  {
    n: '01',
    title: 'Set your target',
    body: 'Tell Ringside your current bill and the price you want. It loads the right arguments before ever picking up the phone.',
  },
  {
    n: '02',
    title: 'Ringside calls',
    body: 'A real call is placed. Ringside introduces itself, reads the rep\'s responses, and chooses the right lever at every turn.',
  },
  {
    n: '03',
    title: 'You save',
    body: 'The call closes on your terms. No hold music. No scripts to babysit. Just a new rate, confirmed on the line.',
  },
]

export default function HowItWorksSection() {
  return (
    <section className="bg-[#F5F5F5] px-6 py-24">
      <div className="max-w-[88rem] mx-auto">

        {/* Header row */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
          <div>
            <p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">
              How it works
            </p>
            <h2
              className="text-4xl md:text-5xl font-medium leading-tight text-black"
              style={{ letterSpacing: '-0.03em' }}
            >
              Three steps.<br />One outcome.
            </h2>
          </div>
          <p className="text-black/60 text-base leading-relaxed max-w-xs md:text-right">
            From setup to savings in under two minutes. No account required for the demo.
          </p>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className="bg-white border border-[#E5E5E5] rounded-2xl p-8 flex flex-col justify-between min-h-64 relative overflow-hidden"
            >
              {/* Ghost step number */}
              <span
                className="absolute top-4 right-6 text-8xl font-medium text-black/[0.04] select-none leading-none"
                style={{ letterSpacing: '-0.04em' }}
              >
                {step.n}
              </span>

              {/* Small step badge */}
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-black text-white text-xs font-medium mb-10">
                {step.n.replace('0', '')}
              </span>

              <div>
                <h3
                  className="text-black text-xl font-medium mb-3"
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {step.title}
                </h3>
                <p className="text-black/60 text-base leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
