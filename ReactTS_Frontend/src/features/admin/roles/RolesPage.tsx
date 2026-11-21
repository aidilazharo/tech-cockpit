import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '../../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, DataTable, Tag, type DataTableColumn } from '../../../components/qi'
import { useCan } from '../../../auth/permissions'
import { useRoles } from '../queries'
import type { Role } from '../schemas'

export function RolesPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const roles = useRoles()

  const columns: DataTableColumn<Role>[] = [
    {
      id: 'name',
      header: t('roles.colName'),
      accessor: (role) => role.name,
      sortable: true,
      cell: (role) => (
        <Link to={`/admin/roles/${role.id}`} className="font-semibold text-text-link underline-offset-4 hover:underline">
          {role.name}
        </Link>
      ),
    },
    { id: 'code', header: t('roles.colCode'), accessor: (role) => role.code, sortable: true },
    { id: 'permissions', header: t('roles.colPermissions'), accessor: (role) => role.permissions.length, sortable: true },
    {
      id: 'type',
      header: t('roles.colType'),
      cell: (role) => (role.isSystem ? <Tag>{t('roles.system')}</Tag> : t('roles.custom')),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('roles.title')}
        intro={t('roles.intro')}
        actions={can('access:role:manage') && <Button onClick={() => void navigate('/admin/roles/new')}>{t('roles.new')}</Button>}
      />
      {roles.isPending ? (
        <Loading />
      ) : roles.isError ? (
        <LoadFailed onRetry={() => void roles.refetch()} />
      ) : (
        <DataTable caption={t('roles.caption')} hideCaption columns={columns} rows={roles.data.items} getRowId={(role) => role.id} emptyState={t('roles.none')} />
      )}
    </>
  )
}
