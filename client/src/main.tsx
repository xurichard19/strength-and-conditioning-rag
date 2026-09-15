import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ComingSoonPage } from './launch/ComingSoonPage'
import { getPageFromPath, isInfoPage } from './routing'

const PublicInfoPage = lazy(() => import('./launch/PublicInfoPage'))
const currentPage = getPageFromPath(window.location.pathname)

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <Suspense fallback={<p role="status">Loading page…</p>}>
      {isInfoPage(currentPage) ? <PublicInfoPage page={currentPage} /> : <ComingSoonPage />}
    </Suspense>
  </StrictMode>,
)
