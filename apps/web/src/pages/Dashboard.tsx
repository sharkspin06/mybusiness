import { Link } from 'react-router';
import { Icon, type IconName } from '../components/Icon';
import { Badge, Card, cx } from '../components/ui';
import { useSession } from '../lib/session';

function TipCard({ tone, eyebrow, title, linkText, to }: { tone: 'mint' | 'pink'; eyebrow: string; title: string; linkText: string; to: string }) {
  return (
    <Link
      to={to}
      className={cx(
        'w-[210px] shrink-0 rounded-md p-4 flex flex-col gap-3 h-[148px]',
        tone === 'mint' ? 'bg-accent-soft' : 'bg-danger-soft',
      )}
    >
      <span className={cx('text-xs font-semibold tracking-wide uppercase', tone === 'mint' ? 'text-accent-ink' : 'text-danger')}>{eyebrow}</span>
      <span className="text-base font-semibold leading-snug">{title}</span>
      <span className={cx('mt-auto text-sm font-medium', tone === 'mint' ? 'text-accent-ink' : 'text-danger')}>{linkText} →</span>
    </Link>
  );
}

function PreviewCard({ icon, title, caption, body, to }: { icon: IconName; title: string; caption: string; body: string; to: string }) {
  return (
    <Link to={to} className="w-[210px] shrink-0 flex flex-col gap-2">
      <Card className="h-[148px] p-4 flex flex-col gap-3 hover:border-line-strong">
        <span className="inline-flex items-center gap-1.5 text-base font-semibold">
          <Icon name={icon} size={18} className="text-ink-3" />
          {title}
        </span>
        <div className="flex flex-col gap-2 mt-1">
          <span className="h-2 w-full rounded-full bg-surface-2" />
          <span className="h-2 w-3/4 rounded-full bg-surface-2" />
          <span className="h-2 w-5/6 rounded-full bg-surface-2" />
        </div>
      </Card>
      <span className="text-sm font-semibold">{caption}</span>
      <span className="text-[14px] text-ink-3 -mt-1">{body}</span>
    </Link>
  );
}

export function Dashboard() {
  const { user } = useSession();
  const firstName = user.name.split(' ')[0];
  return (
    <>
      <div>
        <p className="text-sm text-ink-3">Home</p>
        <h1 className="text-[32px] leading-10 font-semibold mt-1">Welcome, {firstName}</h1>
        <p className="text-base text-ink-3 mt-1">Let's start something useful today</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-1 -mx-1 px-1">
        <TipCard tone="mint" eyebrow="Getting set up" title="Learn My Business in 4 minutes" linkText="Explore the quick tour" to="/settings" />
        <PreviewCard icon="tasks" title="Task tracker" caption="Create your first task" body="Stay on top of follow-ups and to-dos." to="/tasks" />
        <PreviewCard icon="calendar" title="Appointments" caption="Book an appointment" body="Keep track of site visits and meetings." to="/calendar" />
        <PreviewCard icon="quotations" title="Quotation" caption="Create a quotation" body="Send a professional quote to a customer." to="/quotations" />
        <TipCard tone="pink" eyebrow="Resources" title="Import your customers" linkText="Import from CSV" to="/customers" />
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-base font-semibold">Recent</span>
          <div className="grow" />
          <button type="button" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink cursor-pointer">
            Sort by viewed
            <Icon name="updown" size={14} />
          </button>
        </div>
        <Card className="divide-y divide-line">
          <Link to="/settings" className="flex items-center gap-3 h-14 px-4 hover:bg-row-hover">
            <span className="size-8 rounded-md bg-ink text-bg flex items-center justify-center shrink-0">
              <Icon name="dashboard" size={16} />
            </span>
            <span className="grow text-base font-medium truncate">{user.name}'s workspace guide</span>
            <Badge tone="teal">Start here!</Badge>
          </Link>
        </Card>
      </div>
    </>
  );
}
