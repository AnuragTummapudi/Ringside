export default function LogoIcon({ className }: { className?: string }) {
  return (
    <span className={`inline-block shrink-0 overflow-hidden ${className}`} aria-hidden="true">
      <img
        src="/ringside-logo1.png?v=20260814"
        alt=""
        className="h-full w-full scale-[1.4] object-contain mix-blend-multiply"
      />
    </span>
  )
}
