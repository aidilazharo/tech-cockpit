import { useAuthStore } from './auth-store'

/** Whether the signed-in user holds a permission (the API enforces it again). */
export function useCan(): (permission: string) => boolean {
  const permissions = useAuthStore((state) => state.me?.permissions)
  return (permission) => permissions?.includes(permission) ?? false
}
