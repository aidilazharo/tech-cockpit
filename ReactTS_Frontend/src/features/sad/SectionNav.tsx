import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { StatusIndicator } from '../../components/qi'
import { cn } from '../../lib/cn'
import { questionsLeft } from './format'
import type { SadSectionKey, Template, Version } from './schemas'

/** The sections the reader may view, with how complete each is (drafts) and which one is shown. */
export function SectionNav({
  template,
  version,
  current,
  to,
}: {
  template: Template
  version: Version
  current: SadSectionKey | null
  to: (key: SadSectionKey) => string
}) {
  const { t } = useTranslation()
  const open = version.status === 'draft' || version.status === 'in_approval'
  const readable = new Set(version.sections.filter((section) => section.readable).map((section) => section.key))
  return (
    <nav aria-label={t('sad.sectionsNav')}>
      <ol className="flex flex-col gap-1">
        {template.sections
          .filter((section) => readable.has(section.key))
          .map((section) => {
            const left = questionsLeft(version, section.key)
            const completion = version.completion.find((c) => c.section === section.key)
            const percent = completion && completion.total > 0 ? Math.round((completion.answered / completion.total) * 100) : 100
            const editable = version.sections.find((s) => s.key === section.key)?.editable
            return (
              <li key={section.key}>
                <Link
                  to={to(section.key)}
                  aria-current={current === section.key ? 'true' : undefined}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-button px-3 py-2 hover:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-border-focus',
                    current === section.key && 'bg-surface-selected-1 font-semibold',
                  )}
                >
                  <span>{section.title}</span>
                  {open && (
                    <span className="text-xs font-normal">
                      {left === 0 ? (
                        <StatusIndicator tone="positive">{t('sad.complete')}</StatusIndicator>
                      ) : (
                        <span className={current === section.key ? 'text-text-default' : 'text-text-subdued'}>{t('sad.toAnswer', { count: left })}</span>
                      )}
                      {editable === false && version.status === 'draft' && <span className={cn('ml-2', current === section.key ? 'text-text-default' : 'text-text-subdued')}>{t('sad.viewOnly')}</span>}
                      {completion && (
                        <span
                          role="progressbar"
                          aria-label={t('sad.answeredOf', { section: section.title, answered: completion.answered, total: completion.total })}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percent}
                          className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-alternate"
                        >
                          <span className="block h-full rounded-full bg-icon-success" style={{ width: `${percent}%` }} />
                        </span>
                      )}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
      </ol>
    </nav>
  )
}
