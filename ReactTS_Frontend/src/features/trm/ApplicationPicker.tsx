import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchSelect } from '../../components/qi'
import { useApplicationSearch } from './queries'
import type { Ref } from './schemas'
import { useText } from './text'

/** Find a TRM application by name or number (e.g. to scope a role to it). */
export function ApplicationPicker({ label, value, onChange, error }: { label: string; value: Ref | null; onChange: (application: Ref | null) => void; error?: string }) {
  const { t } = useTranslation()
  const { named } = useText()
  const [query, setQuery] = useState('')
  const applications = useApplicationSearch(query)
  const ready = query.trim().length >= 2
  return (
    <SearchSelect<Ref & { number?: string | null }>
      label={label}
      value={value}
      onValueChange={onChange}
      items={ready ? (applications.data?.items ?? []) : []}
      onQueryChange={setQuery}
      itemKey={(app) => app.id}
      itemLabel={(app) => named(app.name)}
      itemDescription={(app) => app.number}
      placeholder={t('trm.picker.placeholder')}
      emptyText={ready ? t('trm.picker.none') : t('trm.picker.typeMore')}
      error={error}
    />
  )
}
