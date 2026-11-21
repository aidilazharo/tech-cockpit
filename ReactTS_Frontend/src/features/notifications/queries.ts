import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { NotificationPageSchema, NotificationSchema, UnreadCountSchema } from './schemas'

/** The header badge checks for new notifications this often (while the tab is visible). */
export const UNREAD_POLL_MS = 60_000
export const PAGE_SIZE = 20

export const notificationKeys = {
  all: ['notifications'] as const,
  unread: ['notifications', 'unread-count'] as const,
  page: (unreadOnly: boolean, page: number) => ['notifications', 'page', { unreadOnly, page }] as const,
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: ({ signal }) => api('/api/v1/me/notifications/unread-count', { schema: UnreadCountSchema, signal }),
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
  })
}

export function useNotifications(unreadOnly: boolean, page: number, pageSize = PAGE_SIZE, enabled = true) {
  return useQuery({
    enabled,
    queryKey: [...notificationKeys.page(unreadOnly, page), pageSize],
    queryFn: ({ signal }) =>
      api(`/api/v1/me/notifications?unread=${unreadOnly}&page=${page}&pageSize=${pageSize}`, { schema: NotificationPageSchema, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useMarkRead() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/v1/me/notifications/${id}/read`, { method: 'POST', schema: NotificationSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export function useMarkAllRead() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api('/api/v1/me/notifications/read-all', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
