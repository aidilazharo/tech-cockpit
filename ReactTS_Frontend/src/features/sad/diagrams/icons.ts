import { AZURE_ICONS, type AzureIcon } from './azure-icons'

const BY_ID = new Map(AZURE_ICONS.map((icon) => [icon.id, icon]))

/** Where the web app serves an Azure icon (public/azure-icons). */
export const azureIconUrl = (id: string) => `${import.meta.env.BASE_URL}azure-icons/${id}.svg`

/** An icon's product name (Microsoft's terms: show it near the icon). */
export const azureIconName = (id: string) => BY_ID.get(id)?.name ?? id

/** Icons whose name or category holds the text (from two characters), at most 50. */
export function findIcons(text: string): AzureIcon[] {
  const query = text.trim().toLowerCase()
  if (query.length < 2) return []
  return AZURE_ICONS.filter((icon) => icon.name.toLowerCase().includes(query) || icon.categories.some((category) => category.includes(query))).slice(0, 50)
}

export const iconById = (id: string | undefined) => (id ? BY_ID.get(id) : undefined)
