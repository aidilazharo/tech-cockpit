import { useTranslation } from 'react-i18next'
import { Dropdown, TextField } from '../../../components/qi'
import { AZURE_REGIONS } from '../azure-regions'
import type { Hosting, HostingField } from '../schemas'
import { hostingProblems } from './infrastructure'

const REGIONS = AZURE_REGIONS.map((region) => ({ value: region.code, label: region.name }))

/** The six hosting settings: subscription, Azure regions (from Azure's list), data centres and office network. */
export function HostingFields({ value, onChange, showProblems }: { value: Hosting; onChange: (value: Hosting) => void; showProblems: boolean }) {
  const { t } = useTranslation()
  const problems = showProblems ? hostingProblems(value) : {}
  const error = (field: HostingField) => (problems[field] ? t(problems[field]) : undefined)
  const text = (field: 'subscription' | 'primaryDc' | 'drDc' | 'officeNetwork') => (
    <TextField label={t(`sad.diagram.hostingFields.${field}`)} value={value[field]} onChange={(event) => onChange({ ...value, [field]: event.target.value })} error={error(field)} />
  )
  const region = (field: 'primaryRegion' | 'drRegion') => (
    <Dropdown label={t(`sad.diagram.hostingFields.${field}`)} options={REGIONS} value={value[field]} onValueChange={(code) => onChange({ ...value, [field]: code })} error={error(field)} />
  )
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {text('subscription')}
      <span className="hidden md:block" />
      {region('primaryRegion')}
      {region('drRegion')}
      {text('primaryDc')}
      {text('drDc')}
      {text('officeNetwork')}
    </div>
  )
}
