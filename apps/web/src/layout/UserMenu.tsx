import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '../components/Icon';
import { Avatar, cx } from '../components/ui';
import { useLogout, useSession } from '../lib/session';

/** Sidebar footer: avatar + name/role, opens a menu with account links and sign out. */
export function UserMenu({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
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

  const go = (to: string) => {
    setOpen(false);
    onNavigate?.();
    navigate(to);
  };

  return (
    <div ref={box} className={cx('relative border-t border-line pt-2.5 mt-2', compact ? '' : 'px-0.5')}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx('flex items-center gap-2.5 rounded-sm hover:bg-hover cursor-pointer w-full text-left', compact ? 'justify-center py-1' : 'px-2 h-11')}
      >
        <Avatar name={user.name} />
        {!compact && (
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="text-base font-medium truncate">{user.name}</span>
            <span className="text-sm text-ink-3 capitalize">{user.role}</span>
          </span>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 bottom-full mb-1 z-30 w-64 bg-bg border border-line rounded-md shadow-pop py-2">
          <div className="flex items-center gap-2.5 px-3 pb-2">
            <Avatar name={user.name} size="touch" />
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate">{user.name}</span>
              <span className="text-xs text-ink-3 truncate">{user.email}</span>
            </span>
          </div>
          <div className="px-3 pb-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => go('/settings/subscription')}
              className="w-full h-9 rounded-sm bg-accent-soft text-accent-ink text-sm font-semibold hover:opacity-90 cursor-pointer"
            >
              Upgrade plan
            </button>
          </div>
          <div className="h-px bg-line my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => go('/settings/team')}
            className="w-full flex items-center gap-2.5 px-3 h-10 text-sm text-left hover:bg-surface-1 cursor-pointer"
          >
            <Icon name="settings" size={16} className="text-ink-3" />
            Admin settings
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => go('/settings/account')}
            className="w-full flex items-center gap-2.5 px-3 h-10 text-sm text-left hover:bg-surface-1 cursor-pointer"
          >
            <Icon name="customers" size={16} className="text-ink-3" />
            Account settings
          </button>
          <div className="h-px bg-line my-1" />
          <button
            type="button"
            role="menuitem"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="w-full flex items-center px-3 h-10 text-sm text-left text-danger hover:bg-danger-soft cursor-pointer"
          >
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
