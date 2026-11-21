import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { useCan } from '../auth/permissions'
import { cn } from '../lib/cn'
import { NAV_SECTIONS } from './nav-items'

/**
 * Main navigation. `compact` (tablet) shows icons only; the labels stay in the
 * accessibility tree so every link keeps its name.
 */
export function SideNav({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation()
  const can = useCan()
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permission || (Array.isArray(item.permission) ? item.permission : [item.permission]).some(can),
    ),
  })).filter((section) => section.items.length > 0)

  return (
    <div className="flex flex-col gap-4 py-4">
      {sections.map((section) => (
        <div key={section.heading ?? 'main'} className="flex flex-col gap-1">
          {section.heading && (
            <p className="px-4 text-xs font-semibold tracking-wide text-text-subdued uppercase">
              {/* not-sr-only resets padding, so it goes on the inner span */}
              <span className={cn(compact && 'sr-only lg:not-sr-only')}>{t(section.heading)}</span>
            </p>
          )}
          <ul className="flex flex-col gap-1 px-2">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  title={compact ? t(item.label) : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-10 items-center gap-3 rounded-button border-l-4 border-transparent px-3 text-sm text-text-default',
                      'hover:bg-surface-hover-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus',
                      compact && 'justify-center px-0 lg:justify-start lg:px-3',
                      isActive && 'border-button-primary-border bg-surface-hover-1 font-semibold',
                    )
                  }
                >
                  <item.icon className="size-5 shrink-0 text-icon-default" />
                  <span className={cn(compact && 'sr-only lg:not-sr-only')}>{t(item.label)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
