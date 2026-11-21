import type { SVGProps } from 'react'

// Minimal line icons until the AIA icon library is supplied. Decorative: hidden from
// assistive technology; the surrounding control carries the accessible name.
type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6l4 4 4-4" />
  </Icon>
)

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Icon>
)

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
)

export const SortIcon = ({ sort, ...props }: IconProps & { sort: 'asc' | 'desc' | false }) => (
  <Icon {...props}>
    {sort !== 'desc' && <path d="M5 6l3-3 3 3" opacity={sort === 'asc' ? 1 : 0.4} />}
    {sort !== 'asc' && <path d="M5 10l3 3 3-3" opacity={sort === 'desc' ? 1 : 0.4} />}
  </Icon>
)

export const ErrorIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75v3.75M8 11h.01" />
  </Icon>
)

export const SpinnerIcon = (props: IconProps) => (
  <Icon className="animate-spin" {...props}>
    <path d="M8 1.75A6.25 6.25 0 1 1 1.75 8" />
  </Icon>
)

export const InfoIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.25v4M8 4.75v.01" />
  </Icon>
)

export const SuccessIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M5.25 8.25l2 2 3.5-4" />
  </Icon>
)

export const WarningIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 2.25l6 11H2z" />
    <path d="M8 6.75v3M8 11.5v.01" />
  </Icon>
)

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 4L6 8l4 4" />
  </Icon>
)

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 4l4 4-4 4" />
  </Icon>
)

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </Icon>
)

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 01-.5.5H9.5V10h-3v3.5H3a.5.5 0 01-.5-.5z" />
  </Icon>
)

export const UsersIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M2 13c0-2.2 1.8-3.75 4-3.75S10 10.8 10 13" />
    <path d="M10.5 3.5a2.25 2.25 0 010 4.25M12 9.5c1.2.5 2 1.8 2 3.5" />
  </Icon>
)

export const ShieldIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4z" />
    <path d="M5.75 8l1.5 1.5 3-3" />
  </Icon>
)

export const BuildingIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 14V2.5h7V14M10 6h3v8M1.5 14h13" />
    <path d="M5 5h1.5M5 7.5h1.5M5 10h1.5" />
  </Icon>
)

export const KeyIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="5" cy="10.5" r="2.75" />
    <path d="M7 8.5l6-6M11 4.5l1.5 1.5M9.5 6l1.25 1.25" />
  </Icon>
)

export const CalendarIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.5" />
    <path d="M2.25 6.5h11.5M5.25 2v2.5M10.75 2v2.5" />
  </Icon>
)

export const BellIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 11.5V7a4 4 0 018 0v4.5l1 1.25H3z" />
    <path d="M6.75 14a1.25 1.25 0 002.5 0" />
  </Icon>
)

export const ListIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
    <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
  </Icon>
)

export const RulesIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 3.5h4M9 3.5h4M3 12.5h10" />
    <path d="M5 3.5V8h6V3.5M8 8v4.5" />
  </Icon>
)

export const AppsIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </Icon>
)

export const ServiceIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 2l6 3-6 3-6-3 6-3z" />
    <path d="M2 8l6 3 6-3" />
    <path d="M2 11l6 3 6-3" />
  </Icon>
)

export const CapabilityIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="6" y="1.5" width="4" height="3" rx="0.5" />
    <rect x="1.5" y="11.5" width="4" height="3" rx="0.5" />
    <rect x="10.5" y="11.5" width="4" height="3" rx="0.5" />
    <path d="M8 4.5v3.5M3.5 11.5V8h9v3.5" />
  </Icon>
)

export const SoftwareIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 1.5l5.5 3v7L8 14.5l-5.5-3v-7L8 1.5z" />
    <path d="M2.5 4.5L8 7.5l5.5-3M8 7.5v7" />
  </Icon>
)

export const StandardIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="8" cy="6.5" r="4.5" />
    <path d="M6 6.5l1.5 1.5L10 5" />
    <path d="M5.5 10.5L5 14.5l3-1.5 3 1.5-.5-4" />
  </Icon>
)

export const ServerIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2" y="2" width="12" height="5" rx="1" />
    <rect x="2" y="9" width="12" height="5" rx="1" />
    <path d="M5 4.5h.01M5 11.5h.01" />
  </Icon>
)

export const SyncIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M13.5 6.5A5.5 5.5 0 0 0 3.2 4.7M2.5 9.5a5.5 5.5 0 0 0 10.3 1.8" />
    <path d="M3 2v3h3M13 14v-3h-3" />
  </Icon>
)

export const PortfolioIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="1.5" y="5" width="13" height="9" rx="1" />
    <path d="M5.5 5V3.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V5M1.5 9h13" />
  </Icon>
)

export const LandscapeIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="1.5" y="2" width="13" height="12" rx="1" />
    <path d="M1.5 6h13M6 6v8M10.5 6v8" />
  </Icon>
)

export const RoadmapIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2 4h7M2 8h11M2 12h5" />
    <circle cx="11" cy="4" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
  </Icon>
)

export const DocumentIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 1.5h5l3 3v10H4z" />
    <path d="M9 1.5v3h3M6 8h4M6 11h4" />
  </Icon>
)

export const ApiIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3M9 3.5 7 12.5" />
  </Icon>
)

export const BackupIcon = (props: IconProps) => (
  <Icon {...props}>
    <ellipse cx="8" cy="4" rx="5" ry="2" />
    <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />
  </Icon>
)
