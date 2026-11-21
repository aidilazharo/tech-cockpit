import { useTranslation } from 'react-i18next'
import { Checkbox } from '../../../components/qi'
import type { Permission } from '../schemas'

const SECTION_PERMISSION = /^sad:([a-z-]+):(read|update)$/

/** SAD permissions: a View / Edit grid per section, then any other SAD permission as a tick box. Edit includes View. */
export function SadSectionGrid({ permissions, value, onChange, disabled }: { permissions: Permission[]; value: string[]; onChange: (value: string[]) => void; disabled: boolean }) {
  const { t } = useTranslation()
  const sections = [...new Set(permissions.map((p) => SECTION_PERMISSION.exec(p.code)?.[1]).filter((key): key is string => key !== undefined))]
  const others = permissions.filter((p) => !SECTION_PERMISSION.test(p.code))
  const has = (code: string) => value.includes(code)
  const set = (add: string[], remove: string[]) => onChange([...value.filter((code) => !remove.includes(code)), ...add.filter((code) => !value.includes(code))])

  return (
    <fieldset className="flex flex-col gap-2 lg:col-span-2">
      <legend className="mb-2 font-semibold">{t('role.modules.sad')}</legend>
      <div role="region" aria-label={t('role.sad.caption')} tabIndex={0} className="overflow-x-auto rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
        <table className="w-full border-collapse">
          <caption className="sr-only">{t('role.sad.caption')}</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-divider-default px-2 py-2 text-left">
                {t('role.sad.section')}
              </th>
              <th scope="col" className="border-b border-divider-default px-2 py-2 text-left">
                {t('role.sad.view')}
              </th>
              <th scope="col" className="border-b border-divider-default px-2 py-2 text-left">
                {t('role.sad.edit')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const read = `sad:${section}:read`
              const update = `sad:${section}:update`
              const title = t(`role.sad.sections.${section}`, { defaultValue: section })
              return (
                <tr key={section}>
                  <th scope="row" className="border-b border-divider-subdued px-2 py-1 text-left font-normal">
                    {title}
                  </th>
                  <td className="border-b border-divider-subdued px-2 py-1">
                    <Checkbox label={t('role.sad.viewSection', { section: title })} disabled={disabled} checked={has(read) || has(update)} onCheckedChange={(checked) => (checked ? set([read], []) : set([], [read, update]))} />
                  </td>
                  <td className="border-b border-divider-subdued px-2 py-1">
                    <Checkbox label={t('role.sad.editSection', { section: title })} disabled={disabled} checked={has(update)} onCheckedChange={(checked) => (checked ? set([read, update], []) : set([], [update]))} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {others.map((permission) => (
        <Checkbox
          key={permission.code}
          label={permission.description}
          description={permission.code}
          disabled={disabled}
          checked={has(permission.code)}
          onCheckedChange={(checked) => (checked ? set([permission.code], []) : set([], [permission.code]))}
        />
      ))}
    </fieldset>
  )
}
