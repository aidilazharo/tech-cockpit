import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '../../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, DataTable, Pagination, StatusIndicator, Tag, TextField, type DataTableColumn } from '../../../components/qi'
import { useCan } from '../../../auth/permissions'
import { formatDateTime } from '../../../lib/format'
import { PAGE_SIZE, useDepartments, useUsers } from '../queries'
import type { User } from '../schemas'
import { AddUserDialog, type UserPrefill } from './AddUserDialog'
import { RefusedSignIns } from './RefusedSignIns'

const SEARCH_DELAY_MS = 300

export function UsersPage() {
  const { t } = useTranslation()
  const can = useCan()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [search, setSearch] = useState(q)
  // false: closed; null: a blank form; otherwise filled in from a refused sign-in
  const [adding, setAdding] = useState<UserPrefill | null | false>(false)
  const users = useUsers(q, page)
  const departments = useDepartments()
  const departmentName = new Map((departments.data?.items ?? []).map((d) => [d.id, d.name]))

  // Search as the user types, without a request per keystroke; the URL keeps the search.
  useEffect(() => {
    if (search.trim() === q) return
    const timer = setTimeout(() => setParams(search.trim() ? { q: search.trim() } : {}, { replace: true }), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search, q, setParams])

  const columns: DataTableColumn<User>[] = [
    {
      id: 'name',
      header: t('users.colName'),
      cell: (user) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link to={`/admin/users/${user.id}`} className="font-semibold text-text-link underline-offset-4 hover:underline">
            {`${user.firstName} ${user.lastName}`.trim() || user.username}
          </Link>
          {user.isExternal && <Tag>{t('auth.external')}</Tag>}
        </span>
      ),
    },
    { id: 'username', header: t('users.colUsername'), accessor: (user) => user.username },
    { id: 'email', header: t('users.colEmail'), accessor: (user) => user.email },
    {
      id: 'department',
      header: t('users.colDepartment'),
      accessor: (user) => (user.departmentId && departmentName.get(user.departmentId)) || t('common.none'),
    },
    {
      id: 'status',
      header: t('users.colStatus'),
      cell: (user) =>
        user.status === 'active' ? (
          <StatusIndicator tone="positive">{t('status.active')}</StatusIndicator>
        ) : (
          <StatusIndicator tone="ended">{t('status.disabled')}</StatusIndicator>
        ),
    },
    {
      id: 'lastSignIn',
      header: t('users.colLastSignIn'),
      accessor: (user) => formatDateTime(user.lastLoginAt) ?? t('users.neverSignedIn'),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('users.title')}
        intro={t('users.intro')}
        actions={can('access:user:manage') && <Button onClick={() => setAdding(null)}>{t('users.add')}</Button>}
      />
      <div className="max-w-md">
        <TextField label={t('users.search')} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {users.isPending ? (
        <Loading />
      ) : users.isError ? (
        <LoadFailed onRetry={() => void users.refetch()} />
      ) : (
        <>
          <p className="text-sm text-text-subdued" aria-live="polite">
            {t('users.total', { count: users.data.total })}
          </p>
          <DataTable
            caption={t('users.caption')}
            hideCaption
            columns={columns}
            rows={users.data.items}
            getRowId={(user) => user.id}
            emptyState={t('users.none')}
          />
          <Pagination
            page={page}
            pageCount={Math.ceil(users.data.total / PAGE_SIZE)}
            onPageChange={(next) => setParams({ ...(q && { q }), page: String(next) })}
            labels={{ label: t('users.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </>
      )}
      {can('access:user:manage') && <RefusedSignIns onAdd={setAdding} />}
      <AddUserDialog key={adding ? adding.username : 'blank'} open={adding !== false} prefill={adding || null} onOpenChange={() => setAdding(false)} />
    </>
  )
}
