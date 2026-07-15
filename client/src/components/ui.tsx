import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react'
import type { LucideIcon } from 'lucide-react'

import { classes } from '../lib/classes'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({
  children,
  className,
  icon: Icon,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes('btn', `btn-${variant}`, className)}
      {...props}
    >
      {Icon && <Icon aria-hidden="true" size={17} strokeWidth={2} />}
      {children}
    </button>
  )
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
  size?: number
}

export function IconButton({
  className,
  icon: Icon,
  label,
  size = 18,
  title = label,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title}
      className={classes('icon-button', className)}
      {...props}
    >
      <Icon aria-hidden="true" size={size} strokeWidth={2} />
    </button>
  )
}

type PanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
  raised?: boolean
}

export function Panel({ children, className, raised, ...props }: PanelProps) {
  return (
    <section className={classes('panel', raised && 'panel-raised', className)} {...props}>
      {children}
    </section>
  )
}

type PageHeaderProps = {
  actions?: ReactNode
  description?: string
  eyebrow: string
  icon?: LucideIcon
  title: string
}

export function PageHeader({ actions, description, eyebrow, icon: Icon, title }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <p className="page-eyebrow">
          {Icon && <Icon aria-hidden="true" size={14} strokeWidth={2.25} />}
          {eyebrow}
        </p>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

type EmptyStateProps = {
  description: string
  icon: LucideIcon
  title: string
}

export function EmptyState({ description, icon: Icon, title }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
      </span>
      <h3 className="text-base font-semibold text-[var(--text-h)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6">{description}</p>
    </div>
  )
}
