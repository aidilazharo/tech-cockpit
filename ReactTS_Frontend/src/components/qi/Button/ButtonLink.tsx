import { Link, type LinkProps } from 'react-router'
import { cn } from '../../../lib/cn'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-classes'

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
}

/** A link that looks like a Qi button: for actions that open another page (e.g. "New initiative"). */
export function ButtonLink({ variant = 'primary', size = 'md', className, ...rest }: ButtonLinkProps) {
  return <Link data-variant={variant} className={cn(buttonClasses(variant, size, 'link'), className)} {...rest} />
}
