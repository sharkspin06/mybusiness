import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './ui';

const control =
  'w-full rounded-sm border bg-bg px-3 text-ink placeholder:text-ink-4 focus:outline-2 focus:outline-accent-ring focus:border-accent md:text-sm';

/** Label + control + helper or error text. `children` receives the id and describedby to wire up. */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  const msg = error ?? hint;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[14px] font-medium text-ink-2 mb-1.5">
        {label}
      </label>
      {children({ id, 'aria-describedby': msg ? msgId : undefined, 'aria-invalid': error ? true : undefined })}
      {msg && (
        <p id={msgId} className={cx('text-xs mt-1.5', error ? 'text-danger' : 'text-ink-3')}>
          {msg}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(control, 'h-11 md:h-9', p['aria-invalid'] ? 'border-danger' : 'border-line-strong', className)}
      {...p}
    />
  );
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(control, 'h-11 md:h-9 pr-8 border-line-strong', className)} {...p}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(control, 'py-2.5 leading-normal border-line-strong resize-y', className)} {...p} />;
}

/** Segmented control (Day/Week/Month, All/Active/Leads…). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto p-[3px] bg-surface-2 rounded-[8px] gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-[38px] md:h-[30px] px-3 rounded-sm text-sm md:text-[14px] font-medium whitespace-nowrap cursor-pointer',
            value === o.value ? 'bg-bg text-ink shadow-seg' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
