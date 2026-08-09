import { useEffect, useRef, useState } from 'react'

const STATS = [
  { target: 479, prefix: '₹', suffix: '', label: 'Average monthly savings', sub: 'per negotiation' },
  { target: 60, prefix: '< ', suffix: 's', label: 'Typical call duration', sub: 'start to close' },
  { target: 7, prefix: '', suffix: '', label: 'Turns to close', sub: 'on average' },
  { target: 100, prefix: '', suffix: '%', label: 'Autonomous', sub: 'no human needed' },
]

function AnimatedStat({ target, prefix, suffix }: Pick<(typeof STATS)[number], 'target' | 'prefix' | 'suffix'>) {
  const [value, setValue] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)
  const statRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = statRef.current
    if (!element) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setHasStarted(true)
        observer.disconnect()
      }
    }, { threshold: 0.45 })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!hasStarted) return

    const duration = 1300
    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setValue(Math.round(target * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [hasStarted, target])

  return (
    <div
      ref={statRef}
      className="text-5xl md:text-6xl font-medium text-black mb-2 tabular-nums"
      style={{ letterSpacing: '-0.04em' }}
      aria-label={`${prefix}${target}${suffix}`}
    >
      {prefix}{value}{suffix}
    </div>
  )
}

export default function StatsSection() {
  return (
    <section className="bg-white border-y border-[#E5E5E5] px-6 py-20">
      <div className="max-w-[88rem] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-y md:divide-y-0 md:divide-x divide-[#E5E5E5]">
          {STATS.map((s) => (
            <div key={s.label} className="px-8 py-8 md:py-0 first:pl-0 last:pr-0">
              <AnimatedStat target={s.target} prefix={s.prefix} suffix={s.suffix} />
              <div className="text-black text-sm font-medium mb-1">{s.label}</div>
              <div className="text-black/40 text-xs font-medium tracking-[.08em] uppercase">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
