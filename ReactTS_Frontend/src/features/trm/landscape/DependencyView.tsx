import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApplicationCalls } from '../../sad/calls/CallsViews'
import { ApplicationPicker } from '../ApplicationPicker'
import type { Ref } from '../schemas'

/** One picked application with the applications calling it and those it calls, from every application's approved SAD. */
export function DependencyView() {
  const { t } = useTranslation()
  const [application, setApplication] = useState<Ref | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-md">
        <ApplicationPicker label={t('trm.landscape.application')} value={application} onChange={setApplication} />
      </div>
      {application ? <ApplicationCalls key={application.id} applicationId={application.id} /> : <p className="text-sm text-text-subdued">{t('trm.landscape.pickApplication')}</p>}
    </div>
  )
}
