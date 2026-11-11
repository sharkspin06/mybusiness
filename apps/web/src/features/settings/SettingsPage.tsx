import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, useParams } from 'react-router';
import { roleLabel } from '@mybusiness/shared';
import { Icon } from '../../components/Icon';
import { PageHeader, cx } from '../../components/ui';
import { useBusiness } from '../../lib/business';
import { planLabel, useSession } from '../../lib/session';
import { useCrumb } from '../../layout/crumb';
import { AccountSection } from './AccountSection';
import { BusinessProfileSection, DataSection, QuotationDefaultsSection, RemindersSection, SubscriptionSection } from './BusinessSections';
import { TeamSection } from './TeamSection';

interface Section {
  key: string;
  label: string;
  group: 'Business' | 'Team' | 'Data' | 'You';
  render: (p: { canManage: boolean }) => ReactNode;
}

const SECTIONS: Section[] = [
  { key: 'business', label: 'Business profile', group: 'Business', render: ({ canManage }) => <BusinessProfileSection canEdit={canManage} /> },
  { key: 'team', label: 'Users & permissions', group: 'Team', render: () => <TeamSection /> },
  { key: 'quotes', label: 'Quotation & GST', group: 'Business', render: ({ canManage }) => <QuotationDefaultsSection canEdit={canManage} /> },
  { key: 'reminders', label: 'Reminders', group: 'Business', render: () => <RemindersSection /> },
  { key: 'subscription', label: 'Subscription', group: 'Data', render: () => <SubscriptionSection /> },
  { key: 'data', label: 'Data export & backups', group: 'Data', render: ({ canManage }) => <DataSection canExport={canManage} /> },
  { key: 'account', label: 'Your account', group: 'You', render: () => <AccountSection /> },
];

function useIsPhone() {
  const q = '(max-width: 767px)';
  const [phone, setPhone] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

/** Settings: left section menu on desktop; on phones a grouped list that opens each section. */
export function SettingsPage() {
  const { section } = useParams();
  const isPhone = useIsPhone();
  const { user } = useSession();
  const canManage = user.role === 'owner' || user.role === 'admin';
  const current = SECTIONS.find((s) => s.key === section);
  useCrumb(current?.label);

  if (section && !current) return <Navigate to="/settings" replace />;
  if (!section) return isPhone ? <PhoneIndex /> : <Navigate to="/settings/business" replace />;

  return (
    <>
      <div className="hidden md:block">
        <PageHeader title="Settings" />
      </div>
      <div className="flex flex-wrap gap-6 items-start">
        <nav aria-label="Settings sections" className="hidden md:flex flex-[1_1_200px] max-w-[240px] flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.key}
              to={`/settings/${s.key}`}
              className={({ isActive }) =>
                cx('flex items-center h-9 px-2.5 rounded-sm text-sm font-medium', isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-hover')
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-[999_1_520px] min-w-0 flex flex-col gap-4">
          {current!.render({ canManage })}
        </div>
      </div>
    </>
  );
}

function PhoneIndex() {
  const { data: b } = useBusiness();
  const { user, business } = useSession();
  const hint: Record<string, string | undefined> = {
    business: b?.uen ? `UEN ${b.uen}` : undefined,
    quotes: b ? (b.gstRegistered ? 'GST 9%' : 'No GST') : undefined,
    reminders: 'Not set up',
    team: roleLabel[user.role],
    data: 'CSV, full export',
    subscription: b ? planLabel(b.plan) : undefined,
    account: user.email,
  };
  const groups = ['Business', 'Team', 'Data', 'You'] as const;
  return (
    <div className="-mx-4 -mt-4">
      <p className="px-4 pt-4 text-[14px] text-ink-3">{business.name}</p>
      {groups.map((g) => (
        <div key={g}>
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-wide px-4 pt-4 pb-2">{g === 'You' ? 'Your account' : g}</p>
          {SECTIONS.filter((s) => s.group === g).map((s) => (
            <Link key={s.key} to={`/settings/${s.key}`} className="flex items-center gap-3 min-h-16 px-4 border-b border-line-soft text-ink hover:bg-row-hover">
              <span className="grow text-base">{s.label}</span>
              {hint[s.key] && <span className="text-[14px] text-ink-3 truncate max-w-[45%]">{hint[s.key]}</span>}
              <Icon name="chevronRight" className="text-ink-4 shrink-0" />
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
