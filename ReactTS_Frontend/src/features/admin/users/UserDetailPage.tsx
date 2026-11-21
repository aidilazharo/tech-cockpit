import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ConfirmDialog } from '../../../components/page/ConfirmDialog'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, DataTable, Dropdown, PageMessage, StatusIndicator, Tag, type DataTableColumn } from '../../../components/qi'
import { useMe } from '../../../auth/use-me'
import { useCan } from '../../../auth/permissions'
import { ApiError } from '../../../lib/api'
import { formatDate, formatDateTime } from '../../../lib/format'
import { useAssignments, useDepartments, useEndAssignment, useRevokeUserApiKey, useRoles, useUpdateUser, useUser, useUserApiKeys } from '../queries'
import type { ApiKey, Assignment, User } from '../schemas'
import { lastDayMy } from '../../../lib/dates'
import { assignmentStatus } from './assignment-status'
import { useApplication, usePortfolios } from '../../trm/queries'
import { AssignRoleDialog } from './AssignRoleDialog'
import { EditUserDialog } from './EditUserDialog'

export function UserDetailPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const user = useUser(id)

  return (
    <>
      <Link to="/admin/users" className="w-fit text-sm font-semibold text-text-link underline underline-offset-4">
        {t('user.back')}
      </Link>
      {user.isPending ? (
        <Loading />
      ) : user.isError ? (
        user.error instanceof ApiError && user.error.status === 404 ? (
          <PageMessage variant="warning">{t('user.notFound')}</PageMessage>
        ) : (
          <LoadFailed onRetry={() => void user.refetch()} />
        )
      ) : (
        <UserDetail user={user.data} />
      )}
    </>
  )
}

function UserDetail({ user }: { user: User }) {
  const { t } = useTranslation()
  const can = useCan()
  const me = useMe()
  const name = `${user.firstName} ${user.lastName}`.trim() || user.username
  const departments = useDepartments()
  const updateUser = useUpdateUser(user.id)
  const [departmentId, setDepartmentId] = useState<string | null>(user.departmentId)
  const [confirmStatus, setConfirmStatus] = useState(false)
  const [editing, setEditing] = useState(false)
  const isSelf = me.user.id === user.id
  const canManage = can('access:user:manage')
  // Nobody disables their own account, system administrators included.
  const canChangeStatus = canManage && !isSelf
  const departmentName = new Map((departments.data?.items ?? []).map((d) => [d.id, d.name]))
  const disabling = user.status === 'active'

  const toggleStatus = async () => {
    await updateUser.mutateAsync({ status: disabling ? 'disabled' : 'active', version: user.version })
    setConfirmStatus(false)
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="heading-1">{name}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {user.status === 'active' ? (
              <StatusIndicator tone="positive">{t('status.active')}</StatusIndicator>
            ) : (
              <StatusIndicator tone="ended">{t('status.disabled')}</StatusIndicator>
            )}
            {user.isExternal && <Tag>{t('user.vendor')}</Tag>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('user.edit')}
            </Button>
          )}
          {canChangeStatus && (
            <Button variant="secondary" onClick={() => setConfirmStatus(true)}>
              {disabling ? t('user.disable') : t('user.enable')}
            </Button>
          )}
        </div>
      </div>
      {editing && <EditUserDialog user={user} name={name} onClose={() => setEditing(false)} />}
      {isSelf && !canChangeStatus && <PageMessage>{t('user.self')}</PageMessage>}

      <section aria-labelledby="user-details" className="flex flex-col gap-4">
        <h2 id="user-details" className="heading-3">
          {t('user.details')}
        </h2>
        <dl className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-sm font-semibold text-text-subdued">{t('user.username')}</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-text-subdued">{t('user.email')}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {user.email}
              {user.emailFromOkta && <Tag>{t('user.fromOkta')}</Tag>}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-text-subdued">{t('user.lastSignIn')}</dt>
            <dd>{formatDateTime(user.lastLoginAt) ?? t('users.neverSignedIn')}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-text-subdued">{t('user.type')}</dt>
            <dd>{user.isExternal ? t('user.vendor') : t('user.employee')}</dd>
          </div>
          {!canManage && (
            <div>
              <dt className="text-sm font-semibold text-text-subdued">{t('user.department')}</dt>
              <dd>{(user.departmentId && departmentName.get(user.departmentId)) || t('common.none')}</dd>
            </div>
          )}
        </dl>
        {canManage && (
          <div className="flex max-w-md flex-col gap-2">
            <Dropdown
              label={t('user.department')}
              placeholder={t('users.noDepartment')}
              value={departmentId}
              onValueChange={setDepartmentId}
              options={(departments.data?.items ?? []).filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))}
            />
            <Button
              variant="secondary"
              className="w-fit"
              disabled={departmentId === user.departmentId}
              loading={updateUser.isPending && !confirmStatus}
              onClick={() => updateUser.mutate({ departmentId, version: user.version })}
            >
              {t('user.saveDepartment')}
            </Button>
          </div>
        )}
        {!confirmStatus && <ActionFailed error={updateUser.error} />}
      </section>

      {can('access:assignment:read') && <UserRoles user={user} name={name} />}
      {can('apikey:any:revoke') && <UserApiKeys user={user} name={name} />}

      <ConfirmDialog
        open={confirmStatus}
        onClose={() => {
          setConfirmStatus(false)
          updateUser.reset()
        }}
        title={disabling ? t('user.disableTitle', { name }) : t('user.enableTitle', { name })}
        description={disabling ? t('user.disableBody') : t('user.enableBody')}
        confirmLabel={disabling ? t('user.disable') : t('user.enable')}
        onConfirm={() => void toggleStatus().catch(() => undefined)}
        pending={updateUser.isPending}
        error={updateUser.error}
      />
    </>
  )
}

function UserRoles({ user, name }: { user: User; name: string }) {
  const { t } = useTranslation()
  const can = useCan()
  const assignments = useAssignments(user.id)
  const departments = useDepartments()
  const endAssignment = useEndAssignment(user.id)
  const [assigning, setAssigning] = useState(false)
  const [ending, setEnding] = useState<Assignment | null>(null)
  const canManage = can('access:assignment:manage')
  // Ending the system administrator role needs "Grant the system administrator role".
  const roles = useRoles(canManage && can('access:role:read'))
  const adminRoles = new Set((roles.data?.items ?? []).filter((role) => role.isSystemAdmin).map((role) => role.code))
  const canEnd = (a: Assignment) => assignmentStatus(a) !== 'ended' && (!adminRoles.has(a.roleCode) || can('access:system-admin:manage'))
  const departmentName = new Map((departments.data?.items ?? []).map((d) => [d.id, d.name]))
  const trm = can('trm:application:read')
  const portfolios = usePortfolios(trm)
  const portfolioName = new Map((portfolios.data?.items ?? []).map((p) => [p.id, p.name]))

  const scopeLabel = (assignment: Assignment) => {
    if (assignment.scopeType === 'global') return t('user.global')
    if (assignment.scopeType === 'department') {
      return t('user.scopeDepartment', { name: (assignment.scopeId && departmentName.get(assignment.scopeId)) || assignment.scopeId })
    }
    if (assignment.scopeType === 'portfolio') {
      return t('user.scopePortfolio', { name: (assignment.scopeId && portfolioName.get(assignment.scopeId)) || assignment.scopeId })
    }
    if (assignment.scopeType === 'application') return t('user.scopeApplication', { name: assignment.scopeId })
    return t('user.scopeOther', { type: assignment.scopeType, id: assignment.scopeId })
  }

  const columns: DataTableColumn<Assignment>[] = [
    { id: 'role', header: t('user.colRole'), accessor: (a) => a.roleName },
    {
      id: 'scope',
      header: t('user.colScope'),
      accessor: scopeLabel,
      cell: (a) => (a.scopeType === 'application' && a.scopeId && trm ? <ApplicationScope id={a.scopeId} /> : scopeLabel(a)),
    },
    { id: 'from', header: t('user.colFrom'), accessor: (a) => formatDate(a.validFrom) },
    { id: 'to', header: t('user.colTo'), accessor: (a) => (a.validTo ? formatDate(lastDayMy(a.validTo)) : t('user.openEnded')) },
    {
      id: 'status',
      header: t('user.colStatus'),
      cell: (a) => {
        const status = assignmentStatus(a)
        const tone = status === 'active' ? 'positive' : status === 'scheduled' ? 'informative' : 'ended'
        return <StatusIndicator tone={tone}>{t(`status.${status}`)}</StatusIndicator>
      },
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: t('user.colActions'),
            cell: (a: Assignment) =>
              canEnd(a) && (
                <Button variant="tertiary" aria-label={t('user.endLabel', { role: a.roleName })} onClick={() => setEnding(a)}>
                  {t('user.end')}
                </Button>
              ),
          },
        ]
      : []),
  ]

  return (
    <section aria-labelledby="user-roles" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="user-roles" className="heading-3">
          {t('user.roles')}
        </h2>
        {canManage && can('access:role:read') && user.status === 'active' && (
          <Button onClick={() => setAssigning(true)}>{t('user.assign')}</Button>
        )}
      </div>
      {assignments.isPending ? (
        <Loading />
      ) : assignments.isError ? (
        <LoadFailed onRetry={() => void assignments.refetch()} />
      ) : (
        <DataTable
          caption={t('user.rolesCaption')}
          hideCaption
          columns={columns}
          rows={assignments.data.items}
          getRowId={(a) => a.id}
          emptyState={t('user.noRoles')}
        />
      )}
      <AssignRoleDialog user={user} name={name} open={assigning} onOpenChange={setAssigning} />
      <ConfirmDialog
        open={ending !== null}
        onClose={() => {
          setEnding(null)
          endAssignment.reset()
        }}
        title={t('user.endTitle', { role: ending?.roleName, name })}
        description={t('user.endBody')}
        confirmLabel={t('user.end')}
        onConfirm={() => ending && endAssignment.mutate(ending.id, { onSuccess: () => setEnding(null) })}
        pending={endAssignment.isPending}
        error={endAssignment.error}
      />
    </section>
  )
}

function UserApiKeys({ user, name }: { user: User; name: string }) {
  const { t } = useTranslation()
  const keys = useUserApiKeys(user.id, true)
  const revoke = useRevokeUserApiKey(user.id)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)
  const active = (key: ApiKey) => !key.revokedAt && Date.parse(key.expiresAt) > Date.now()

  const columns: DataTableColumn<ApiKey>[] = [
    { id: 'name', header: t('apiKeys.colName'), accessor: (key) => key.name },
    { id: 'key', header: t('apiKeys.colKey'), cell: (key) => <code>{`${key.keyPrefix}…`}</code> },
    { id: 'expires', header: t('apiKeys.colExpires'), accessor: (key) => formatDate(key.expiresAt) },
    { id: 'lastUsed', header: t('apiKeys.colLastUsed'), accessor: (key) => formatDateTime(key.lastUsedAt) ?? t('apiKeys.never') },
    {
      id: 'status',
      header: t('apiKeys.colStatus'),
      cell: (key) => {
        const status = key.revokedAt ? 'revoked' : active(key) ? 'active' : 'expired'
        return <StatusIndicator tone={status === 'active' ? 'positive' : 'ended'}>{t(`status.${status}`)}</StatusIndicator>
      },
    },
    {
      id: 'actions',
      header: t('apiKeys.colActions'),
      cell: (key) =>
        active(key) && (
          <Button variant="tertiary" aria-label={t('apiKeys.revokeLabel', { name: key.name })} onClick={() => setRevoking(key)}>
            {t('apiKeys.revoke')}
          </Button>
        ),
    },
  ]

  return (
    <section aria-labelledby="user-api-keys" className="flex flex-col gap-4">
      <h2 id="user-api-keys" className="heading-3">
        {t('user.apiKeys')}
      </h2>
      <p className="text-text-subdued">{t('user.apiKeysIntro')}</p>
      {keys.isPending ? (
        <Loading />
      ) : keys.isError ? (
        <LoadFailed onRetry={() => void keys.refetch()} />
      ) : (
        <DataTable caption={t('user.apiKeysCaption', { name })} hideCaption columns={columns} rows={keys.data.items} getRowId={(key) => key.id} emptyState={t('user.noApiKeys')} />
      )}
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => {
          setRevoking(null)
          revoke.reset()
        }}
        title={t('apiKeys.revokeTitle', { name: revoking?.name })}
        description={t('apiKeys.revokeBody')}
        confirmLabel={t('apiKeys.revoke')}
        onConfirm={() => revoking && revoke.mutate(revoking.id, { onSuccess: () => setRevoking(null) })}
        pending={revoke.isPending}
        error={revoke.error}
      />
    </section>
  )
}

/** "Application: <name>" for an application-scoped assignment (the id until the name loads). */
function ApplicationScope({ id }: { id: string }) {
  const { t } = useTranslation()
  const application = useApplication(id)
  return <>{t('user.scopeApplication', { name: application.data?.name ?? id })}</>
}
