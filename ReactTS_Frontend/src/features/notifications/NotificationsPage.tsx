import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, Checkbox, Pagination } from '../../components/qi'
import { NotificationList } from './NotificationList'
import { PAGE_SIZE, useMarkAllRead, useNotifications } from './queries'

export function NotificationsPage() {
  const { t } = useTranslation()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)
  const notifications = useNotifications(unreadOnly, page)
  const markAllRead = useMarkAllRead()

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        intro={t('notifications.intro')}
        actions={
          (notifications.data?.unread ?? 0) > 0 && (
            <Button variant="secondary" onClick={() => markAllRead.mutate()} loading={markAllRead.isPending}>
              {t('notifications.markAllRead')}
            </Button>
          )
        }
      />
      <Checkbox
        label={t('notifications.unreadOnly')}
        checked={unreadOnly}
        onCheckedChange={(checked) => {
          setUnreadOnly(checked)
          setPage(1)
        }}
      />
      {notifications.isPending ? (
        <Loading />
      ) : notifications.isError ? (
        <LoadFailed onRetry={() => void notifications.refetch()} />
      ) : notifications.data.items.length === 0 ? (
        <p className="text-text-subdued">{unreadOnly ? t('notifications.noneUnread') : t('notifications.none')}</p>
      ) : (
        <>
          <div className="rounded-card border border-divider-default">
            <NotificationList items={notifications.data.items} />
          </div>
          <Pagination
            page={page}
            pageCount={Math.ceil(notifications.data.total / PAGE_SIZE)}
            onPageChange={setPage}
            labels={{ label: t('notifications.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </>
      )}
    </>
  )
}
