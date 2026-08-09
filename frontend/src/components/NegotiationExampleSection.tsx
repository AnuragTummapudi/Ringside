import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Reveal } from './Motion'

function TimedNegotiation() {
  const [visibleCount, setVisibleCount] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) {
      setVisibleCount(4)
      return
    }

    const delay = visibleCount === 0 ? 450 : visibleCount === 4 ? 3200 : 1250
    const timer = window.setTimeout(() => {
      setVisibleCount((current) => current === 4 ? 0 : current + 1)
    }, delay)

    return () => window.clearTimeout(timer)
  }, [visibleCount, reduceMotion])

  const message = (index: number, className: string, content: ReactNode) => (
    visibleCount > index ? (
      <motion.p
        className={className}
        initial={{ opacity: 0, y: 14, filter: 'blur(3px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
      >
        {content}
      </motion.p>
    ) : null
  )

  return (
    <div className="space-y-4 min-h-[330px]">
      {message(0, 'negotiation-bubble negotiation-seller', <>“The lowest I can do is ₹900.”</>)}
      {visibleCount > 0 && (
        <motion.div
          className="negotiation-wave"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
        >
          <i /><i /><i /><i /><i /><i /><i /><i /><i />
        </motion.div>
      )}
      {message(1, 'negotiation-bubble negotiation-ringside', <><Sparkles className="h-4 w-4 shrink-0" /> “If we can make ₹800 work today, we can close this.”</>)}
      {message(2, 'negotiation-bubble negotiation-seller', <>“I can&apos;t go below ₹850.”</>)}
      {message(3, 'negotiation-bubble negotiation-ringside', <><Check className="h-4 w-4 shrink-0" /> “Let&apos;s meet at ₹825 and finalize.”</>)}
    </div>
  )
}

export default function NegotiationExampleSection() {
  return (
    <section className="bg-white border-y border-[#E5E5E5] px-6 py-24">
      <Reveal className="max-w-[88rem] mx-auto grid grid-cols-1 lg:grid-cols-[.8fr_1.2fr] gap-12 items-center">
        <div><p className="text-black/50 text-sm font-medium tracking-[.12em] uppercase mb-3">A real negotiation</p><h2 className="text-4xl md:text-5xl font-medium leading-tight text-black mb-5" style={{ letterSpacing: '-0.03em' }}>Not a script.<br />A live strategy.</h2><p className="max-w-md text-black/60 text-base leading-relaxed">Ringside listens to the other side, responds to the actual conversation, and moves toward the outcome you set.</p></div>
        <div className="negotiation-example rounded-3xl border border-[#E5E5E5] bg-[#F5F5F5] p-6 md:p-8"><div className="flex items-center justify-between border-b border-black/10 pb-5 mb-6"><span className="text-sm font-medium text-black">Negotiation in progress</span><span className="inline-flex items-center gap-2 text-xs font-medium text-black/50"><span className="stat-status-dot" /> Live call</span></div><TimedNegotiation /></div>
      </Reveal>
    </section>
  )
}
