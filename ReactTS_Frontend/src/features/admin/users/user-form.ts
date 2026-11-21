import { z } from 'zod'

export const USER_TYPES = ['employee', 'vendor'] as const

/** The person fields an administrator sets: Okta username, email, names, Employee/Vendor. */
export function userFormSchema(t: (key: string) => string) {
  return z.object({
    username: z.string().trim().min(1, t('users.errors.username')).max(320).regex(/^\S+$/, t('users.errors.usernameSpaces')),
    email: z.email(t('users.errors.email')).max(320),
    firstName: z.string().trim().max(100),
    lastName: z.string().trim().max(100),
    type: z
      .enum(USER_TYPES)
      .nullable()
      .refine((value) => value !== null, t('users.errors.type')),
    /** Only when adding (the user page changes the department on its own) */
    departmentId: z.string().nullable().optional(),
  })
}
type UserFormSchema = ReturnType<typeof userFormSchema>
export type UserFormInput = z.input<UserFormSchema>
export type UserFormOutput = z.output<UserFormSchema>
