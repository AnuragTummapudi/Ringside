const STATS = [
  { value: '₹479',  label: 'Average monthly savings',  sub: 'per negotiation'   },
  { value: '< 60s', label: 'Typical call duration',    sub: 'start to close'    },
  { value: '7',     label: 'Turns to close',           sub: 'on average'        },
  { value: '100%',  label: 'Autonomous',               sub: 'no human needed'   },
]

export default function StatsSection() {
  return (
    <section className="bg-white border-y border-[#E5E5E5] px-6 py-20">
      <div className="max-w-[88rem] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-y md:divide-y-0 md:divide-x divide-[#E5E5E5]">
          {STATS.map((s) => (
            <div key={s.value} className="px-8 py-8 md:py-0 first:pl-0 last:pr-0">
              <div
                className="text-5xl md:text-6xl font-medium text-black mb-2"
                style={{ letterSpacing: '-0.04em' }}
              >
                {s.value}
              </div>
              <div className="text-black text-sm font-medium mb-1">{s.label}</div>
              <div className="text-black/40 text-xs font-medium tracking-[.08em] uppercase">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
