import { ApiError } from '../../../lib/api'
import type { Upload } from '../schemas'

/** PMO's rules (docs/modules/sad.md, Uploads); the API checks them again, by content too. */
export const MAX_FILES = 20
const MAX_BYTES = 25 * 1024 * 1024
export const ACCEPTED = ['docx', 'xlsx', 'pptx', 'vsdx', 'pdf', 'png', 'jpg', 'jpeg', 'drawio']
export const DOWNLOADABLE: Upload['scan'][] = ['clean', 'unscanned']

export const formatSize = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
const extensionOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '')

/** Whether a file may be uploaded: the reason it may not, or null. */
export function fileProblem(t: (key: string) => string, file: { name: string; size: number }): string | null {
  if (!ACCEPTED.includes(extensionOf(file.name))) return t('sad.diagram.files.type')
  return file.size > MAX_BYTES ? t('sad.diagram.files.size') : null
}

/** What the API said about a refused file. */
export function refusal(t: (key: string) => string, error: unknown): string {
  if (error instanceof ApiError && error.status === 413) return t('sad.diagram.files.size')
  if (error instanceof ApiError) return error.errors[0]?.message ?? error.detail ?? error.message
  return (error as Error).message
}
