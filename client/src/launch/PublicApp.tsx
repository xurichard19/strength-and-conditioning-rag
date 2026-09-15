import { lazy, Suspense } from 'react'
import { getPageFromPath, isInfoPage } from '../routing'
import { ComingSoonPage } from './ComingSoonPage'

const PublicInfoPage = lazy(() => import('./PublicInfoPage'))

export function PublicApp() {
  const currentPage = getPageFromPath(window.location.pathname)
  return (
    <Suspense fallback={<p role="status">Loading page…</p>}>
      {isInfoPage(currentPage) ? <PublicInfoPage page={currentPage} /> : <ComingSoonPage />}
    </Suspense>
  )
}
