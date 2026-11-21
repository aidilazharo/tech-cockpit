import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, DataTable } from '../../../components/qi'
import { WarningIcon } from '../../../components/qi/icons'
import { formatDate } from '../../../lib/format'
import { uploadUrl, useAddUpload, useRemoveUpload, useUploads } from '../queries'
import type { DiagramSlot, Upload } from '../schemas'
import { ACCEPTED, DOWNLOADABLE, fileProblem, formatSize, MAX_FILES, refusal } from './files'
import { FileChooser } from './parts'

/**
 * The files under one diagram: everyone who sees the diagram downloads them once they may; the editors who draw it add
 * and remove them at once (a new diagram must be saved first).
 */
export function DiagramFiles({ versionId, slot, diagramId, editable, saved }: { versionId: string; slot: DiagramSlot; diagramId: string; editable: boolean; saved: boolean }) {
  const { t } = useTranslation()
  const uploads = useUploads(versionId)
  const add = useAddUpload(versionId)
  const remove = useRemoveUpload(versionId)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  if (uploads.isPending) return <Loading />
  if (uploads.isError) return <LoadFailed onRetry={() => void uploads.refetch()} />
  const files = uploads.data.items.filter((item) => item.slot === slot && item.diagramId === diagramId)
  const status = (file: Upload) =>
    ({ scanning: t('sad.diagram.files.scanning'), malicious: t('sad.diagram.files.malicious'), failed: t('sad.diagram.files.failed') })[file.scan as 'scanning'] ?? '—'
  const choose = async (file: File) => {
    const problem = fileProblem(t, file)
    if (problem) return setMessage({ error: true, text: problem })
    try {
      await add.mutateAsync({ slot, diagramId, file, name: file.name })
      setMessage({ error: false, text: t('sad.diagram.files.added', { name: file.name }) })
    } catch (error) {
      setMessage({ error: true, text: refusal(t, error) })
    }
  }
  const removeFile = async (file: Upload) => {
    try {
      await remove.mutateAsync(file.id)
      setMessage(null)
    } catch (error) {
      setMessage({ error: true, text: refusal(t, error) })
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <DataTable<Upload>
        caption={t('sad.diagram.files.caption', { count: files.length, max: MAX_FILES })}
        getRowId={(file) => file.id}
        rows={files}
        emptyState={<p className="p-4 text-sm text-text-subdued">{t('sad.diagram.files.none')}</p>}
        columns={[
          {
            id: 'name',
            header: t('sad.diagram.name'),
            cell: (file) =>
              DOWNLOADABLE.includes(file.scan) ? (
                <a href={uploadUrl(versionId, file.id)} download={file.name} className="font-semibold text-text-link underline-offset-4 hover:underline">
                  {file.name}
                </a>
              ) : (
                file.name
              ),
          },
          { id: 'type', header: t('sad.diagram.files.typeColumn'), accessor: (file) => file.type.toUpperCase() },
          { id: 'size', header: t('sad.diagram.files.sizeColumn'), accessor: (file) => formatSize(file.size) },
          { id: 'by', header: t('sad.diagram.files.by'), accessor: (file) => file.uploadedBy?.name ?? t('common.restricted') },
          { id: 'at', header: t('sad.diagram.files.at'), accessor: (file) => formatDate(file.uploadedAt) },
          {
            id: 'status',
            header: t('sad.diagram.files.status'),
            cell: (file) => (
              <span className="inline-flex items-center gap-1">
                {(file.scan === 'malicious' || file.scan === 'failed') && <WarningIcon aria-hidden="true" className="shrink-0 text-icon-warning" />}
                {status(file)}
              </span>
            ),
          },
          ...(editable
            ? [
                {
                  id: 'remove',
                  header: t('sad.diagram.files.removeColumn'),
                  cell: (file: Upload) => (
                    <Button variant="tertiary" aria-label={t('sad.diagram.files.remove', { name: file.name })} onClick={() => void removeFile(file)}>
                      {t('sad.diagram.remove')}
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
      {editable &&
        (!saved ? (
          <p className="text-sm text-text-subdued">{t('sad.diagram.files.saveFirst')}</p>
        ) : files.length >= MAX_FILES ? (
          <p className="text-sm text-text-subdued">{t('sad.diagram.files.full', { max: MAX_FILES })}</p>
        ) : (
          <div className="max-w-md">
            <FileChooser label={t('sad.diagram.files.add')} hint={t('sad.diagram.files.hint')} accept={ACCEPTED.map((type) => `.${type}`).join(',')} disabled={add.isPending} onFile={(file) => void choose(file)} />
          </div>
        ))}
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm font-semibold text-text-error' : 'text-sm'}>
          {message.text}
        </p>
      )}
    </div>
  )
}
