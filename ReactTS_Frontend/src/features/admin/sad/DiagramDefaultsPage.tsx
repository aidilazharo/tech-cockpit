import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, PageMessage } from '../../../components/qi'
import { HostingFields } from '../../sad/diagrams/HostingFields'
import { hostingProblems } from '../../sad/diagrams/infrastructure'
import { useDiagramDefaults, useSaveDiagramDefaults } from '../../sad/queries'
import type { DiagramDefaults, Hosting } from '../../sad/schemas'

function DefaultsForm({ defaults, save }: { defaults: DiagramDefaults; save: ReturnType<typeof useSaveDiagramDefaults> }) {
  const { t } = useTranslation()
  const { version, ...initial } = defaults
  const [value, setValue] = useState<Hosting>(initial)
  const [tried, setTried] = useState(false)
  const submit = () => {
    setTried(true)
    if (Object.keys(hostingProblems(value)).length > 0) return
    const trim = (name: string) => name.trim()
    save.mutate({ ...value, subscription: trim(value.subscription), primaryDc: trim(value.primaryDc), drDc: trim(value.drDc), officeNetwork: trim(value.officeNetwork), version })
  }
  return (
    <form
      className="flex max-w-3xl flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {save.isSuccess && <PageMessage variant="success">{t('sad.diagramDefaults.saved')}</PageMessage>}
      <ActionFailed error={save.error} />
      <HostingFields value={value} onChange={setValue} showProblems={tried} />
      <div>
        <Button type="submit" loading={save.isPending}>
          {t('sad.diagramDefaults.save')}
        </Button>
      </div>
    </form>
  )
}

/** /admin/sad-diagram-defaults — the hosting names new infrastructure diagrams start with. */
export function DiagramDefaultsPage() {
  const { t } = useTranslation()
  const defaults = useDiagramDefaults()
  // Here, not in the form: the form starts afresh with each saved version, the message stays.
  const save = useSaveDiagramDefaults()
  return (
    <>
      <PageHeader title={t('sad.diagramDefaults.title')} intro={t('sad.diagramDefaults.intro')} />
      {defaults.isPending ? (
        <Loading />
      ) : defaults.isError ? (
        <LoadFailed onRetry={() => void defaults.refetch()} />
      ) : (
        <DefaultsForm key={defaults.data.version} defaults={defaults.data} save={save} />
      )}
    </>
  )
}
