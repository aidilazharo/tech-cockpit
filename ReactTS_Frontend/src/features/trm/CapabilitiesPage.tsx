import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { capabilityTree, type CapabilityNode } from './capability-tree'
import { MissingIndicator, RecordLink } from './parts'
import { useCapabilities } from './queries'

/** /trm/capabilities — the business capability tree from ServiceNow. */
export function CapabilitiesPage() {
  const { t } = useTranslation()
  const capabilities = useCapabilities()
  return (
    <>
      <PageHeader title={t('trm.capabilities.title')} intro={t('trm.capabilities.intro')} />
      {capabilities.isPending ? (
        <Loading />
      ) : capabilities.isError ? (
        <LoadFailed onRetry={() => void capabilities.refetch()} />
      ) : capabilities.data.items.length === 0 ? (
        <p className="text-text-subdued">{t('trm.capabilities.none')}</p>
      ) : (
        <ul aria-label={t('trm.capabilities.tree')} className="flex flex-col gap-3">
          {capabilityTree(capabilities.data.items).map((node) => (
            <TreeNode key={node.id} node={node} />
          ))}
        </ul>
      )}
    </>
  )
}

function TreeNode({ node }: { node: CapabilityNode }) {
  const { t } = useTranslation()
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RecordLink to={`/trm/capabilities/${node.id}`} name={node.name} />
        {node.applicationCount > 0 && <span className="text-sm text-text-subdued">{t('trm.capabilities.applications', { count: node.applicationCount })}</span>}
        <MissingIndicator since={node.missingSince} />
      </div>
      {node.children.length > 0 && (
        <ul className="ml-3 flex flex-col gap-2 border-l-2 border-divider-default pl-4">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  )
}
