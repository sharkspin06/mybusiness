import { NavLink, useNavigate } from 'react-router';
import { Icon } from '../components/Icon';
import { Button, cx } from '../components/ui';
import { useSession } from '../lib/session';
import { useTaskSummary } from '../features/tasks/api';
import { BusinessMenu } from './BusinessMenu';
import { mainNav, settingsNav, type NavItem } from './nav';
import { UserMenu } from './UserMenu';

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function SideLink({ item, compact, onNavigate, badge }: { item: NavItem; compact: boolean; onNavigate?: () => void; badge?: number }) {
  const label = badge ? `${item.label}, ${badge} overdue` : item.label;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      title={compact ? label : undefined}
      aria-label={compact || badge ? label : undefined}
      className={({ isActive }) =>
        cx(
          'relative flex items-center gap-2.5 h-10 rounded-sm text-base font-medium',
          compact ? 'justify-center w-10 mx-auto' : 'px-2.5',
          isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-hover',
        )
      }
    >
      <Icon name={item.icon} />
      {!compact && item.label}
      {!!badge &&
        (compact ? (
          <span aria-hidden="true" className="absolute top-1 right-1 size-2 rounded-full bg-danger" />
        ) : (
          <span aria-hidden="true" className="ml-auto text-sm font-semibold text-danger tabular-nums">
            {badge}
          </span>
        ))}
    </NavLink>
  );
}

/** Full sidebar (240px) on desktop, or a 64px icon rail on tablets (compact). */
export function Sidebar({ compact = false, onNavigate, onExpand }: { compact?: boolean; onNavigate?: () => void; onExpand?: () => void }) {
  const { business } = useSession();
  const { data: tasks } = useTaskSummary();
  const navigate = useNavigate();
  return (
    <aside
      className={cx(
        'h-full bg-surface-1 border-r border-line flex flex-col gap-1 py-3',
        compact ? 'w-16 px-2' : 'w-[220px] px-3',
      )}
    >
      {compact ? (
        <button
          type="button"
          onClick={onExpand}
          aria-label="Open menu"
          className="size-10 mx-auto mb-2 rounded-sm flex items-center justify-center hover:bg-hover cursor-pointer"
        >
          <span className="size-7 rounded-[7px] bg-accent text-white text-xs font-bold flex items-center justify-center">
            {initials(business.name)}
          </span>
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2 h-10 px-0.5 mb-2">
            <span className="size-6 rounded-[6px] bg-accent text-white text-[12px] font-bold flex items-center justify-center shrink-0">MB</span>
            <span className="grow text-base font-semibold truncate">My Business</span>
            <button
              type="button"
              aria-label="Notifications"
              className="size-7 shrink-0 rounded-sm flex items-center justify-center text-ink-3 hover:bg-hover hover:text-ink cursor-pointer"
            >
              <Icon name="bell" size={16} />
            </button>
          </div>
          <Button variant="primary" size="md" onClick={() => navigate('/customers?new=1')} className="w-full mb-3">
            <Icon name="plus" size={16} />
            New
          </Button>
          <BusinessMenu />
        </>
      )}

      <nav aria-label="Main" className="flex flex-col gap-1">
        {mainNav.map((item) => (
          <SideLink key={item.to} item={item} compact={compact} onNavigate={onNavigate} badge={item.to === '/tasks' ? tasks?.overdue : undefined} />
        ))}
      </nav>

      <div className="grow" />
      <SideLink item={settingsNav} compact={compact} onNavigate={onNavigate} />
      <UserMenu compact={compact} onNavigate={onNavigate} />
    </aside>
  );
}
