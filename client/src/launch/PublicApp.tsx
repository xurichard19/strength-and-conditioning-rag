import { getPageFromPath, isInfoPage } from '../routing'
import { ComingSoonPage } from './ComingSoonPage'
import PublicInfoPage from './PublicInfoPage'

export function PublicApp() {
  const currentPage = getPageFromPath(window.location.pathname)
  return isInfoPage(currentPage) ? <PublicInfoPage page={currentPage} /> : <ComingSoonPage />
}
