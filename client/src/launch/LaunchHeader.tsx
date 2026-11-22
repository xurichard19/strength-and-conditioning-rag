import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import appIcon from '../../../mobile/assets/images/splash-icon.png'

export function LaunchHeader({ home = false }: { home?: boolean }) {
  return <>
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className="landing-nav landing-container">
      <a className="landing-wordmark" href="/" aria-label="Arcel home">
        <img src={appIcon} width="36" height="36" alt="" />
        <span>Arcel</span>
      </a>
      <nav aria-label="Main navigation">
        {home
          ? <a className="landing-nav-link" href="/about">About us <ArrowUpRight size={16} aria-hidden="true" /></a>
          : <a className="landing-nav-link" href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to home</a>}
      </nav>
    </header>
  </>
}
