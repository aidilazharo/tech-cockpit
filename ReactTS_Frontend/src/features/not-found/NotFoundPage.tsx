import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <>
      <h1 className="heading-1">{t('notFound.title')}</h1>
      <p className="text-text-subdued">{t('notFound.body')}</p>
      <Link to="/" className="w-fit font-semibold text-text-link underline underline-offset-4">
        {t('notFound.home')}
      </Link>
    </>
  )
}
