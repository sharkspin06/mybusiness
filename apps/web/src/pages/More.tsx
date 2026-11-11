import { Link } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { Avatar, Badge } from '../components/ui';
import { useTaskSummary } from '../features/tasks/api';
import { useLogout, useSession, useSwitchBusiness } from '../lib/session';

const rows: { to: string; label: string; icon: IconName }[] = [
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/documents', label: 'Documents', icon: 'documents' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const sectionTitle = 'text-xs font-semibold text-ink-3 uppercase tracking-wide px-4 pt-4 pb-2';
const rowCls = 'w-full flex items-center gap-3 min-h-16 px-4 border-b border-line-soft text-ink text-left hover:bg-row-hover cursor-pointer';

/** Phone-only menu for sections that are not in the bottom tab bar, plus account actions. */
export function More() {
  const { user, business, businesses } = useSession();
  const switchBiz = useSwitchBusiness();
  const logout = useLogout();
  const { data: tasks } = useTaskSummary();
  const others = businesses.filter((b) => b.id !== business.id);
  return (
    <div className="-mx-4 -mt-4">
      <div className="flex items-center gap-3 min-h-[76px] px-4 border-b border-line-soft">
        <Avatar name={user.name} size="touch" />
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="text-base font-semibold truncate">{user.name}</span>
          <span className="text-[14px] text-ink-3 truncate">
            <span className="capitalize">{user.role}</span> · {business.name}
          </span>
        </span>
      </div>
      <p className={sectionTitle}>Workspace</p>
      {rows.map((r) => (
        <Link key={r.to} to={r.to} className={rowCls}>
          <Icon name={r.icon} size={22} />
          <span className="grow text-base">{r.label}</span>
          {r.to === '/tasks' && !!tasks?.overdue && <Badge tone="red">{tasks.overdue} overdue</Badge>}
          <Icon name="chevronRight" className="text-ink-4" />
        </Link>
      ))}
      <p className={sectionTitle}>Account</p>
      {others.map((b) => (
        <button key={b.id} type="button" className={rowCls} disabled={switchBiz.isPending} onClick={() => switchBiz.mutate(b.id)}>
          <span className="grow text-base">Switch to {b.name}</span>
          <Icon name="chevronRight" className="text-ink-4" />
        </button>
      ))}
      <div className="flex items-center gap-3 min-h-16 px-4 border-b border-line-soft">
        <span className="grow text-base">Signed in as</span>
        <span className="text-[14px] text-ink-3 truncate max-w-[60%]">{user.email}</span>
      </div>
      <button type="button" className={rowCls} disabled={logout.isPending} onClick={() => logout.mutate()}>
        <span className="grow text-base text-danger">{logout.isPending ? 'Signing out…' : 'Sign out'}</span>
      </button>
    </div>
  );
}
