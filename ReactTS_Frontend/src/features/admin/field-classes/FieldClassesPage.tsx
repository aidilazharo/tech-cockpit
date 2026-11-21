import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, Dropdown, PageMessage } from '../../../components/qi'
import { useFieldClasses, useSetFieldClass } from '../queries'
import { FIELD_CLASSES, type ClassifiedField, type FieldClass } from '../schemas'

/** /admin/field-classes — which structured fields are financial, contract, personal or internal. */
export function FieldClassesPage() {
  const { t } = useTranslation()
  const fields = useFieldClasses()
  const setClass = useSetFieldClass()
  const [saved, setSaved] = useState<string | null>(null)

  const change = (field: ClassifiedField, dataClass: FieldClass | null) => {
    setSaved(null)
    setClass.mutate(
      { key: field.key, dataClass },
      { onSuccess: (result) => setSaved(t('fieldClasses.saved', { field: field.label, class: t(`fieldClasses.classes.${result.dataClass}`) })) },
    )
  }
  const modules = [...new Set((fields.data?.items ?? []).map((field) => field.module))]

  return (
    <>
      <PageHeader title={t('fieldClasses.title')} intro={t('fieldClasses.intro')} />
      <div aria-live="polite">{saved && <PageMessage variant="success">{saved}</PageMessage>}</div>
      <ActionFailed error={setClass.error} />
      {fields.isPending ? (
        <Loading />
      ) : fields.isError ? (
        <LoadFailed onRetry={() => void fields.refetch()} />
      ) : (
        modules.map((module) => (
          <section key={module} aria-labelledby={`fields-${module}`} className="flex flex-col gap-4">
            <h2 id={`fields-${module}`} className="heading-3">
              {t(`fieldClasses.modules.${module}`, { defaultValue: module })}
            </h2>
            <ul className="grid gap-6 md:grid-cols-2">
              {fields.data.items
                .filter((field) => field.module === module)
                .map((field) => (
                  <li key={field.key} className="flex flex-col gap-2">
                    <Dropdown
                      label={field.label}
                      value={field.dataClass}
                      disabled={setClass.isPending}
                      onValueChange={(value) => value && value !== field.dataClass && change(field, value)}
                      hint={`${field.dataClass === field.defaultClass ? t('fieldClasses.default', { class: t(`fieldClasses.classes.${field.defaultClass}`) }) : t('fieldClasses.changed', { class: t(`fieldClasses.classes.${field.defaultClass}`) })} · ${field.key}`}
                      options={FIELD_CLASSES.map((value) => ({ value, label: t(`fieldClasses.classes.${value}`) }))}
                    />
                    {field.dataClass !== field.defaultClass && (
                      <Button variant="tertiary" className="w-fit" aria-label={t('fieldClasses.resetLabel', { field: field.label })} disabled={setClass.isPending} onClick={() => change(field, null)}>
                        {t('fieldClasses.reset')}
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
