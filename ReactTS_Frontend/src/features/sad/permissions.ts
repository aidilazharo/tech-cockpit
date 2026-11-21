import { SAD_SECTION_KEYS, type SadSectionKey } from './schemas'

export const sadRead = (key: SadSectionKey) => `sad:${key}:read`
export const sadUpdate = (key: SadSectionKey) => `sad:${key}:update`
/** Any SAD section, viewed or edited */
export const SAD_ANY = SAD_SECTION_KEYS.flatMap((key) => [sadRead(key), sadUpdate(key)])
export const SAD_EDIT = SAD_SECTION_KEYS.map(sadUpdate)
export const SAD_APIS = [sadRead('api-inventory'), sadUpdate('api-inventory')]
/** Approvers may open the version they approve without SAD permissions. */
export const SAD_VERSION_READERS = [...SAD_ANY, 'approvals:task:act', 'approvals:instance:read']
export const RETENTION_MANAGE = 'sad:retention:manage'
export const DIAGRAM_DEFAULTS_MANAGE = 'sad:diagram-defaults:manage'
export const RETENTION_READERS = [sadRead('backup'), sadUpdate('backup'), RETENTION_MANAGE]
