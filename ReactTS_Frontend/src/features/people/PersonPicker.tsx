import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCan } from '../../auth/permissions'
import { SearchSelect } from '../../components/qi'
import { usePeopleSearch } from './queries'
import type { Person } from './schemas'

export interface PersonPickerProps {
  label: string
  value: Person | null
  onChange: (person: Person | null) => void
  /** Only people whose role can act for staff (out-of-office delegates, roadmap owners) */
  actsForStaff?: boolean
  /** People who cannot be chosen (e.g. yourself) */
  excludeIds?: string[]
  hint?: string
  error?: string
}

/** Find an active person by name or email (Qi dropdown with search). Needs "Search the staff directory". */
export function PersonPicker({ label, value, onChange, actsForStaff = false, excludeIds = [], hint, error }: PersonPickerProps) {
  const { t } = useTranslation()
  const can = useCan()
  const allowed = can('people:directory:read')
  const [query, setQuery] = useState('')
  const people = usePeopleSearch(allowed ? query : '', { actsForStaff })
  const items = (people.data?.items ?? []).filter((person) => !excludeIds.includes(person.id))

  return (
    <SearchSelect<Person>
      label={label}
      value={value}
      onValueChange={onChange}
      items={query.trim().length >= 2 ? items : []}
      onQueryChange={setQuery}
      itemKey={(person) => person.id}
      itemLabel={(person) => person.name}
      itemDescription={(person) => person.email}
      placeholder={t('people.placeholder')}
      emptyText={query.trim().length < 2 ? t('people.typeMore') : t('people.none')}
      hint={allowed ? hint : t('people.noDirectory')}
      error={error}
      disabled={!allowed}
    />
  )
}
