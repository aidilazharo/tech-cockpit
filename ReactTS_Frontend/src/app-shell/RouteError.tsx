import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useRouteError } from 'react-router'
import { Button, PageMessage } from '../components/qi'
import { isChunkLoadError, pageReload, reloadOnceForUpdate } from '../lib/page-reload'

/**
 * Shown instead of a page that failed. A page whose code could not be downloaded (new
 * release, server unreachable) reloads once by itself; nothing technical is shown.
 */
export function RouteError() {
  const { t } = useTranslation()
  const error = useRouteError()
  const notLoaded = isChunkLoadError(error)

  useEffect(() => {
    if (notLoaded) reloadOnceForUpdate()
  }, [notLoaded])

  return (
    <>
      <h1 className="heading-1">{notLoaded ? t('routeError.loadTitle') : t('routeError.title')}</h1>
      <PageMessage variant="error" title={notLoaded ? t('routeError.loadTitle') : t('routeError.title')}>
        {notLoaded ? t('routeError.loadBody') : t('routeError.body')}
      </PageMessage>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => pageReload.reload()}>{t('routeError.reload')}</Button>
        <Link to="/" className="font-semibold text-text-link underline underline-offset-4">
          {t('notFound.home')}
        </Link>
      </div>
    </>
  )
}
