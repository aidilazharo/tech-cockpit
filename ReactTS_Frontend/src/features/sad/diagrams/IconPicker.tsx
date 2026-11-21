import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, SearchSelect } from '../../../components/qi'
import type { Box } from '../schemas'
import type { AzureIcon } from './azure-icons'
import type { Change } from './helpers'
import { azureIconName, findIcons, iconById } from './icons'
import { updateBox } from './model'

/** Finds an Azure icon by name or category. */
export function IconPicker({ label, value, onPick, error }: { label: string; value?: string; onPick: (id: string) => void; error?: string }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  return (
    <SearchSelect<AzureIcon>
      label={label}
      hint={t('sad.diagram.iconHint')}
      value={iconById(value) ?? null}
      onValueChange={(icon) => icon && onPick(icon.id)}
      items={findIcons(query)}
      onQueryChange={setQuery}
      itemKey={(icon) => icon.id}
      itemLabel={(icon) => icon.name}
      itemDescription={(icon) => icon.categories.join(', ')}
      emptyText={query.trim().length >= 2 ? t('sad.diagram.noIcons') : t('sad.diagram.trmTypeMore')}
      error={error}
    />
  )
}

/**
 * A selected box's Azure icon (any box may show one). An infrastructure Azure service (`service`) is named by its
 * icon, so it keeps one; a box drawn with a generic service shape becomes an Azure service when its service is picked.
 */
export function IconField({ box, change, service = false }: { box: Box; change: Change; service?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <IconPicker
        key={`${box.id}-icon`}
        label={service ? t('sad.diagram.azureService') : t('sad.diagram.azureIcon')}
        value={box.icon}
        onPick={(icon) => change((d) => updateBox(d, box.id, service ? { type: 'azure', icon } : { icon }))}
      />
      {box.icon && <p className="text-sm">{azureIconName(box.icon)}</p>}
      {box.icon && !service && (
        <div>
          <Button variant="tertiary" onClick={() => change((d) => updateBox(d, box.id, { icon: undefined }))}>
            {t('sad.diagram.removeIcon')}
          </Button>
        </div>
      )}
    </div>
  )
}
