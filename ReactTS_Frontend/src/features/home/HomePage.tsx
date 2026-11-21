import { useTranslation } from 'react-i18next'
import { useMe } from '../../auth/use-me'

export function HomePage() {
  const { t } = useTranslation()
  const me = useMe()

  return (
    <>
      <h1 className="heading-1">{t('home.welcome', { name: me.user.firstName || me.user.username })}</h1>
      <p className="text-text-subdued">{t('home.intro')}</p>
    </>
  )
}
