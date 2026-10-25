import { useEffect, useRef } from 'react'

const clamp = (value: number) => Math.max(0, Math.min(1, value))

const reveal = (element: HTMLElement) => {
  element.dataset.scrollState = 'visible'
}

function observeReveals(elements: NodeListOf<HTMLElement>) {
  if (!('IntersectionObserver' in window)) return () => {}

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) reveal(entry.target as HTMLElement)
    }
  }, { threshold: 0, rootMargin: '0px 0px -64px 0px' })

  // Separate reveal and reset boundaries prevent flickering near the reveal point.
  const resetObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const element = entry.target as HTMLElement
      if (!entry.isIntersecting && entry.boundingClientRect.top > window.innerHeight && !element.contains(document.activeElement)) {
        element.dataset.scrollState = 'pending'
      }
    }
  }, { threshold: 0, rootMargin: '0px 0px 24px 0px' })

  for (const element of elements) {
    // Keep content visible at restored scroll positions and while it has focus.
    element.style.setProperty('--reveal-delay', `${Number(element.dataset.scrollDelay ?? 0)}ms`)
    if (element.getBoundingClientRect().top < window.innerHeight - 64 || element.contains(document.activeElement)) {
      reveal(element)
    } else {
      element.dataset.scrollState = 'pending'
    }
    observer.observe(element)
    resetObserver.observe(element)
  }

  return () => {
    observer.disconnect()
    resetObserver.disconnect()
  }
}

/** Native scrolling with progressive motion enhancement and a readable static fallback. */
export function useScrollReveal() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const elements = root.querySelectorAll<HTMLElement>('[data-scroll-reveal]')
    const emphasis = root.querySelectorAll<HTMLElement>('[data-scroll-emphasis]')
    const hero = root.querySelector<HTMLElement>('.landing-hero')
    let disconnectReveals = () => {}
    let frame = 0

    const updateProgress = () => {
      frame = 0
      // Read all geometry before CSS writes, so each scroll frame needs one layout pass.
      const heroBounds = hero?.getBoundingClientRect()
      const emphasisBounds = Array.from(emphasis, (element) => ({ element, top: element.getBoundingClientRect().top }))
      if (heroBounds) {
        const { top, height } = heroBounds
        const progress = clamp(-top / height)
        root.style.setProperty('--hero-offset', `${progress * 64}px`)
        root.style.setProperty('--hero-opacity', `${1 - progress * 0.45}`)
      }
      for (const { element, top } of emphasisBounds) {
        const progress = clamp((window.innerHeight * 0.9 - top) / (window.innerHeight * 0.45))
        element.style.setProperty('--text-emphasis', `${progress * 100}%`)
      }
    }

    const queueUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress)
    }

    const revealOnFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(':focus-visible')) return
      const element = event.target.closest<HTMLElement>('[data-scroll-reveal]')
      if (element) reveal(element)
    }

    const reset = () => {
      disconnectReveals()
      window.cancelAnimationFrame(frame)
      frame = 0
      window.removeEventListener('scroll', queueUpdate)
      window.removeEventListener('resize', queueUpdate)
      root.removeAttribute('data-scroll-motion')
      for (const property of ['--hero-offset', '--hero-opacity']) root.style.removeProperty(property)
      elements.forEach((element) => {
        element.removeAttribute('data-scroll-state')
        element.style.removeProperty('--reveal-delay')
      })
      emphasis.forEach((element) => element.style.removeProperty('--text-emphasis'))
    }

    const setup = () => {
      reset()
      if (preference.matches) return
      root.dataset.scrollMotion = 'active'

      disconnectReveals = observeReveals(elements)
      updateProgress()
      window.addEventListener('scroll', queueUpdate, { passive: true })
      window.addEventListener('resize', queueUpdate)
    }

    setup()
    root.addEventListener('focusin', revealOnFocus)
    preference.addEventListener('change', setup)
    return () => {
      reset()
      root.removeEventListener('focusin', revealOnFocus)
      preference.removeEventListener('change', setup)
    }
  }, [])

  return rootRef
}
