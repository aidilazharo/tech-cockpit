import { z } from 'zod'

export const PersonSchema = z.object({ id: z.uuid(), name: z.string(), email: z.string(), isExternal: z.boolean() })
export type Person = z.infer<typeof PersonSchema>
export const PeopleSchema = z.object({ items: z.array(PersonSchema) })
