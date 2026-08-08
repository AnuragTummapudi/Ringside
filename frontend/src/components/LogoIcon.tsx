export default function LogoIcon({ className }: { className?: string }) {
  return (
    <span className={`inline-block shrink-0 overflow-hidden ${className}`} aria-hidden="true">
      <img
        src="/brand/ringside-logo.png"
        alt=""
        className="h-full w-full scale-[1.4] object-contain mix-blend-multiply"
      />
    </span>
  )
}
