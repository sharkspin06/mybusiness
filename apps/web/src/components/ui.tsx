import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Base components from the approved design system. Keep variants in sync with the Design system board.

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent border-accent text-white hover:bg-accent-hover hover:border-accent-hover',
  secondary: 'bg-bg border-line-strong text-ink hover:bg-surface-1',
  ghost: 'bg-transparent border-transparent text-ink hover:bg-surface-2',
  danger: 'bg-danger border-danger text-white hover:opacity-90',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-[30px] px-2.5 text-[14px] rounded-sm',
  md: 'h-9 px-3.5 text-sm rounded-sm',
  lg: 'h-11 px-4 text-[16px] font-semibold rounded-md', // touch size
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 border font-medium whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    />
  );
}

export type BadgeTone = 'green' | 'blue' | 'grey' | 'amber' | 'red' | 'teal';
const badgeTones: Record<BadgeTone, string> = {
  green: 'bg-success-soft text-success',
  blue: 'bg-info-soft text-info',
  grey: 'bg-surface-2 text-neutral',
  amber: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  teal: 'bg-accent-soft text-accent-ink',
};

export function Badge({ tone = 'grey', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-xs font-medium whitespace-nowrap', badgeTones[tone])}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('bg-bg border border-line rounded-md', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="grow min-w-0">
        <h1 className="text-2xl leading-8 font-semibold">{title}</h1>
        {subtitle && <p className="text-[14px] text-ink-3 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'touch' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const sizes = { sm: 'size-6 text-[11px]', md: 'size-8 text-xs', touch: 'size-10 text-sm', lg: 'size-14 text-lg' };
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink font-semibold', sizes[size])}>
      {initials}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="p-8 flex flex-col items-center text-center gap-2">
      <p className="text-base font-semibold">{title}</p>
      <p className="text-ink-3 max-w-md">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export { cx };
