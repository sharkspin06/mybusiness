import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { cx } from '../components/ui';
import { planLabel, useLogout, useSession, useSwitchBusiness } from '../lib/session';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** Sidebar business switcher: lists the user's businesses and signs out. */
export function BusinessMenu() {
  const { business, businesses, user } = useSession();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const switchBiz = useSwitchBusiness();
  const logout = useLogout();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative mb-2">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 h-12 px-2.5 rounded-sm hover:bg-hover text-left cursor-pointer"
      >
        <span className="size-7 rounded-[7px] bg-accent text-white text-xs font-bold flex items-center justify-center shrink-0">{initials(business.name)}</span>
        <span className="flex flex-col gap-0.5 grow min-w-0">
          <span className="text-base font-semibold truncate">{business.name}</span>
          <span className="text-sm text-ink-3">{planLabel(business.plan)}</span>
        </span>
        <Icon name="updown" className="text-ink-3" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 right-0 top-full mt-1 z-30 bg-bg border border-line rounded-md shadow-pop py-1.5">
          <p className="px-3 pt-1 pb-1.5 text-sm text-ink-3 truncate">{user.email}</p>
          {businesses.map((b) => (
            <button
              key={b.id}
              type="button"
              role="menuitemradio"
              aria-checked={b.id === business.id}
              disabled={switchBiz.isPending}
              onClick={() => {
                setOpen(false);
                if (b.id !== business.id) switchBiz.mutate(b.id);
              }}
              className="w-full flex items-center gap-2.5 px-3 h-10 text-base text-left hover:bg-surface-1 cursor-pointer"
            >
              <span className="size-6 rounded-[6px] bg-accent-soft text-accent-ink text-[11px] font-bold flex items-center justify-center shrink-0">{initials(b.name)}</span>
              <span className="grow truncate">{b.name}</span>
              <span className={cx('text-accent', b.id === business.id ? 'visible' : 'invisible')} aria-hidden="true">
                ✓
              </span>
            </button>
          ))}
          <div className="h-px bg-line my-1.5" />
          <button
            type="button"
            role="menuitem"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="w-full flex items-center px-3 h-10 text-base text-left text-danger hover:bg-danger-soft cursor-pointer"
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
