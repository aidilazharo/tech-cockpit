import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../../components/page/PageHeader'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, DataTable, Dropdown, StatusIndicator } from '../../../components/qi'
import { useCreateLayer, useLayers, useSetLayerMapping, useUpdateLayer } from '../../trm/queries'
import type { Layer } from '../../trm/schemas'
import { NameDialog } from './NameDialog'

const NOT_MAPPED = 'none'

/** /admin/technology-layers — layers and which product-standard categories belong to each. */
export function LayersPage() {
  const { t } = useTranslation()
  const layers = useLayers()
  const createLayer = useCreateLayer()
  const updateLayer = useUpdateLayer()
  const setMapping = useSetLayerMapping()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<Layer | null>(null)
  const close = () => {
    setAdding(false)
    setRenaming(null)
    createLayer.reset()
    updateLayer.reset()
  }

  if (layers.isPending)
    return (
      <>
        <PageHeader title={t('trm.layers.title')} intro={t('trm.layers.intro')} />
        <Loading />
      </>
    )
  if (layers.isError)
    return (
      <>
        <PageHeader title={t('trm.layers.title')} intro={t('trm.layers.intro')} />
        <LoadFailed onRetry={() => void layers.refetch()} />
      </>
    )

  const ordered = layers.data.layers
  const move = (layer: Layer, offset: -1 | 1) => {
    const other = ordered[ordered.indexOf(layer) + offset]
    updateLayer.mutate({ id: layer.id, position: other.position, version: layer.version })
    updateLayer.mutate({ id: other.id, position: layer.position, version: other.version })
  }
  const categories = [...layers.data.mappings.map((m) => ({ category: m.standardCategory, layerId: m.layerId })), ...layers.data.unmappedCategories.map((category) => ({ category, layerId: null }))].sort((a, b) =>
    a.category.localeCompare(b.category),
  )

  return (
    <>
      <PageHeader title={t('trm.layers.title')} intro={t('trm.layers.intro')} actions={<Button onClick={() => setAdding(true)}>{t('trm.layers.add')}</Button>} />
      <ActionFailed error={updateLayer.error ?? setMapping.error} />
      <DataTable
        caption={t('trm.layers.caption')}
        hideCaption
        rows={ordered}
        getRowId={(layer) => layer.id}
        columns={[
          { id: 'name', header: t('trm.layers.colName'), accessor: (layer) => layer.name },
          {
            id: 'status',
            header: t('portfolios.colStatus'),
            cell: (layer) => (layer.active ? <StatusIndicator tone="positive">{t('status.active')}</StatusIndicator> : <StatusIndicator tone="ended">{t('portfolios.inactive')}</StatusIndicator>),
          },
          {
            id: 'actions',
            header: t('portfolios.colActions'),
            cell: (layer) => {
              const index = ordered.indexOf(layer)
              return (
                <div className="flex flex-wrap gap-2">
                  <Button variant="tertiary" disabled={index === 0} aria-label={t('trm.layers.moveUp', { name: layer.name })} onClick={() => move(layer, -1)}>
                    <span aria-hidden="true">↑</span>
                  </Button>
                  <Button variant="tertiary" disabled={index === ordered.length - 1} aria-label={t('trm.layers.moveDown', { name: layer.name })} onClick={() => move(layer, 1)}>
                    <span aria-hidden="true">↓</span>
                  </Button>
                  <Button variant="tertiary" aria-label={t('portfolios.renameLabel', { name: layer.name })} onClick={() => setRenaming(layer)}>
                    {t('portfolios.rename')}
                  </Button>
                  <Button
                    variant="tertiary"
                    aria-label={t(layer.active ? 'portfolios.deactivateLabel' : 'portfolios.reactivateLabel', { name: layer.name })}
                    onClick={() => updateLayer.mutate({ id: layer.id, active: !layer.active, version: layer.version })}
                  >
                    {layer.active ? t('portfolios.deactivate') : t('portfolios.reactivate')}
                  </Button>
                </div>
              )
            },
          },
        ]}
      />
      <section aria-labelledby="trm-layer-mapping" className="flex flex-col gap-3">
        <h2 id="trm-layer-mapping" className="heading-3">
          {t('trm.layers.mapping')}
        </h2>
        <p className="text-sm text-text-subdued">{t('trm.layers.mappingIntro')}</p>
        <DataTable
          caption={t('trm.layers.mapping')}
          hideCaption
          rows={categories}
          getRowId={(row) => row.category}
          emptyState={t('trm.layers.noCategories')}
          columns={[
            { id: 'category', header: t('trm.layers.colCategory'), accessor: (row) => row.category },
            {
              id: 'layer',
              header: t('trm.layers.colLayer'),
              cell: (row) => (
                <Dropdown<string>
                  label={t('trm.layers.layerFor', { category: row.category })}
                  value={row.layerId ?? NOT_MAPPED}
                  onValueChange={(value) => setMapping.mutate({ standardCategory: row.category, layerId: value === NOT_MAPPED ? null : value })}
                  options={[{ value: NOT_MAPPED, label: t('trm.landscape.notMapped') }, ...ordered.filter((l) => l.active || l.id === row.layerId).map((l) => ({ value: l.id, label: l.name }))]}
                />
              ),
            },
          ]}
        />
      </section>
      {adding && <NameDialog title={t('trm.layers.add')} submitLabel={t('trm.layers.add')} pending={createLayer.isPending} error={createLayer.error} onSave={(name) => createLayer.mutate(name, { onSuccess: close })} onClose={close} />}
      {renaming && (
        <NameDialog
          title={t('portfolios.renameLabel', { name: renaming.name })}
          initial={renaming.name}
          submitLabel={t('common.save')}
          pending={updateLayer.isPending}
          error={updateLayer.error}
          onSave={(name) => updateLayer.mutate({ id: renaming.id, name, version: renaming.version }, { onSuccess: close })}
          onClose={close}
        />
      )}
    </>
  )
}
