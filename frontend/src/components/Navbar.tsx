import { Link } from 'react-router-dom'
import LogoIcon from './LogoIcon'

interface NavbarProps {
  onCta?: () => void
}

export default function Navbar({ onCta }: NavbarProps) {
  return (
    <nav className="absolute top-0 left-0 right-0 z-20 py-5">
      <div className="ringside-page-container flex items-center justify-between">
        {/* Left: logo + wordmark */}
        <Link to="/" aria-label="Ringside home" className="brand-home flex items-center gap-2">
          <LogoIcon className="w-7 h-7 text-black" />
          <span className="text-2xl font-medium tracking-tight text-black">Ringside</span>
        </Link>

        {/* Center: nav links */}
        <div className="hidden md:flex items-center gap-8">
          <Link
            to="/how-to-use"
            className="text-base text-gray-700 hover:text-black font-medium transition-colors duration-200"
          >
            How it works
          </Link>
          <Link
            to="/use-cases"
            className="text-base text-gray-700 hover:text-black font-medium transition-colors duration-200"
          >
            Use cases
          </Link>
        </div>

        {/* Right: CTA */}
        <button
          onClick={onCta}
          className="interactive-cta bg-black text-white text-base font-medium px-7 py-2.5 rounded-full"
        >
          Start a Call
        </button>
      </div>
    </nav>
  )
}
