import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { appointmentStatusLabel, formatDate, formatMoney, formatPhoneSG, formatTime, isoToDisplay, sgDate, sgTime, whatsappLink, type Customer } from '@mybusiness/shared';
import { useCustomerAppointments } from '../calendar/api';
import { appointmentTone } from '../calendar/AppointmentDetail';
import { Icon, type IconName } from '../../components/Icon';
import { Avatar, Badge, Button, Card, EmptyState, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useCrumb } from '../../layout/crumb';
import { useCustomer, useCustomerHistory, useCustomerSummary } from './api';
import { useQuotations } from '../quotations/api';
import { quoteStatusLabel, quoteTone } from '../quotations/status';
import { CustomerFormDialog } from './CustomerFormDialog';
import { customerStatusLabel, statusTone } from './status';

const TABS = [
  { id: 'info', label: 'Info' },
  { id: 'quotations', label: 'Quotations' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'payments', label: 'Payments' },
  { id: 'documents', label: 'Documents' },
  { id: 'history', label: 'History' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const contactLabel = { whatsapp: 'WhatsApp', phone: 'Phone call', email: 'Email' } as const;

export function CustomerProfile() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab: TabId = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'info') as TabId;
  const [editing, setEditing] = useState(false);
  const { data: c, isLoading, isError, error, refetch } = useCustomer(id);
  const { data: summary } = useCustomerSummary(id);
  useCrumb(c?.name);

  if (isLoading) return <Card className="p-6 text-ink-3">Loading customer…</Card>;
  if (isError || !c) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <EmptyState
        title={missing ? 'Customer not found' : 'Could not load this customer'}
        body={missing ? 'It may have been deleted.' : errorMessage(error)}
        action={missing ? <Link to="/customers" className="text-accent font-medium">Back to customers</Link> : <Button onClick={() => refetch()}>Try again</Button>}
      />
    );
  }

  const setTab = (t: TabId) => setParams(t === 'info' ? {} : { tab: t }, { replace: true });
  const first = c.name.split(/\s+/)[0] ?? c.name;
  const wa = c.phone ? whatsappLink(c.phone, `Hi ${first}, `) : undefined;
  const contactLine = [c.phone ? formatPhoneSG(c.phone) : null, c.email, c.postalCode ? `Singapore ${c.postalCode}` : null].filter(Boolean).join(' · ');

  return (
    <>
      {/* Header: phone (centred) */}
      <div className="md:hidden flex flex-col items-center text-center gap-2 pt-2">
        <Avatar name={c.name} size="lg" />
        <h2 className="text-xl font-semibold">{c.name}</h2>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Badge tone={statusTone[c.status]}>{customerStatusLabel[c.status]}</Badge>
          <Badge tone="grey">{c.company ?? (c.customerType === 'individual' ? 'Individual' : 'Business')}</Badge>
        </div>
        {c.phone && <p className="text-[14px] text-ink-3">{formatPhoneSG(c.phone)}</p>}
        <div className="grid grid-cols-3 gap-2 w-full mt-2">
          <QuickAction icon="phone" label="Call" href={c.phone ? `tel:${c.phone}` : undefined} />
          <QuickAction icon="message" label="WhatsApp" href={wa} external />
          <QuickAction icon="quotations" label="Quote" onClick={() => navigate(`/quotations/new?customer=${c.id}`)} />
        </div>
        <button type="button" onClick={() => setEditing(true)} className="h-11 px-4 text-accent font-medium cursor-pointer">
          Edit details
        </button>
      </div>

      {/* Header: desktop */}
      <div className="hidden md:flex flex-wrap items-start gap-4">
        <Avatar name={c.name} size="lg" />
        <div className="grow min-w-0 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl leading-8 font-semibold">{c.name}</h1>
            <Badge tone={statusTone[c.status]}>{customerStatusLabel[c.status]}</Badge>
            <Badge tone="grey">{c.company ?? (c.customerType === 'individual' ? 'Individual' : 'Business')}</Badge>
          </div>
          {contactLine && <p className="text-[14px] text-ink-3">{contactLine}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-sm border border-line-strong bg-bg text-sm font-medium hover:bg-surface-1">
              <Icon name="message" />
              WhatsApp
            </a>
          ) : (
            <Button disabled title="No mobile number">
              <Icon name="message" />
              WhatsApp
            </Button>
          )}
          <Button onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="primary" onClick={() => navigate(`/quotations/new?customer=${c.id}`)}>
            New quotation
          </Button>
        </div>
      </div>

      {/* Summary (filled in as Quotations, Payments and Calendar are built) */}
      <div className="hidden md:grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <Stat label="Total quoted" value={summary ? formatMoney(summary.quotedCents / 100) : undefined} />
        <Stat label="Paid" />
        <Stat label="Outstanding" />
        <Stat
          label="Next appointment"
          value={summary?.nextAppointment ? `${isoToDisplay(sgDate(summary.nextAppointment.startsAt))} ${sgTime(summary.nextAppointment.startsAt)}` : summary ? 'None' : undefined}
        />
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Customer sections" className="flex overflow-x-auto border-b border-line -mx-4 px-2 md:mx-0 md:px-0 gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cx(
              'h-11 md:h-10 px-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px cursor-pointer',
              tab === t.id ? 'text-ink border-accent' : 'text-ink-3 border-transparent hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'info' && <InfoTab c={c} />}
        {tab === 'quotations' && <QuotationsTab customerId={c.id} />}
        {tab === 'appointments' && <AppointmentsTab customerId={c.id} />}
        {tab === 'payments' && <Later what="Payments from this customer" section="Payments" />}
        {tab === 'documents' && <Later what="Files and documents for this customer" section="Documents" />}
        {tab === 'history' && <HistoryTab id={c.id} />}
      </div>

      <CustomerFormDialog open={editing} customer={c} onClose={() => setEditing(false)} onDeleted={() => navigate('/customers', { replace: true })} />
    </>
  );
}

function QuickAction({ icon, label, href, external, onClick }: { icon: IconName; label: string; href?: string; external?: boolean; onClick?: () => void }) {
  const cls = 'h-[60px] flex flex-col items-center justify-center gap-1 rounded-md border border-line-strong bg-bg text-xs font-medium';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(cls, 'cursor-pointer')}>
        <Icon name={icon} size={22} />
        {label}
      </button>
    );
  }
  if (!href) {
    return (
      <span aria-disabled="true" className={cx(cls, 'opacity-50')}>
        <Icon name={icon} size={22} />
        {label}
      </span>
    );
  }
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className={cls}>
      <Icon name={icon} size={22} />
      {label}
    </a>
  );
}

function Stat({ label, value }: { label: string; value?: string }) {
  return (
    <Card className="px-3.5 py-3">
      <p className="text-[14px] text-ink-3">{label}</p>
      <p className="text-lg font-semibold mt-1 tabular-nums">{value ?? '—'}</p>
    </Card>
  );
}

function InfoTab({ c }: { c: Customer }) {
  const rows: [string, ReactNode][] = [
    ['Full name', c.name],
    ['Company', c.company ?? '—'],
    ['Mobile', c.phone ? formatPhoneSG(c.phone) : '—'],
    ['Email', c.email ?? '—'],
    ['Address', c.address || c.postalCode ? [c.address, c.postalCode ? `Singapore ${c.postalCode}` : null].filter(Boolean).join(', ') : '—'],
    ['Customer type', c.customerType === 'individual' ? 'Individual' : 'Business'],
    ['Preferred contact', contactLabel[c.preferredContact]],
    ['Customer since', formatDate(new Date(c.createdAt))],
    [
      'Tags',
      c.tags.length ? (
        <span className="flex flex-wrap gap-1.5">
          {c.tags.map((t) => (
            <Badge key={t} tone="teal">
              {t}
            </Badge>
          ))}
        </span>
      ) : (
        '—'
      ),
    ],
  ];
  return (
    <div className="flex flex-wrap gap-4 items-start">
      <Card className="flex-[2_1_420px] min-w-0 p-0 md:p-5 max-md:border-0 max-md:-mx-4 max-md:rounded-none">
        <h2 className="hidden md:block text-base font-semibold mb-4">Details</h2>
        <dl className="md:grid md:grid-cols-[160px_minmax(0,1fr)] md:gap-x-4 md:gap-y-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents max-md:block max-md:px-4 max-md:py-3 max-md:border-b max-md:border-line-soft">
              <dt className="text-ink-3 max-md:text-xs">{k}</dt>
              <dd className="m-0 max-md:text-[16px] max-md:mt-0.5 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="flex-[1_1_280px] min-w-0 p-5">
        <h2 className="text-base font-semibold mb-3">Notes</h2>
        <p className="text-sm leading-relaxed text-ink-2 whitespace-pre-line">{c.notes || 'No notes yet.'}</p>
      </Card>
    </div>
  );
}

function Later({ what, section }: { what: string; section: string }) {
  return <EmptyState title={`${what} will show here`} body={`This fills in once the ${section} section is built.`} />;
}

function HistoryTab({ id }: { id: string }) {
  const { data, isLoading, isError, error } = useCustomerHistory(id, true);
  if (isLoading) return <Card className="p-6 text-ink-3">Loading history…</Card>;
  if (isError) return <EmptyState title="Could not load history" body={errorMessage(error)} />;
  if (!data?.items.length) return <EmptyState title="No history yet" body="Changes to this customer will be listed here." />;
  return (
    <Card className="px-4 md:px-5 py-1">
      {data.items.map((h) => {
        const d = new Date(h.createdAt);
        return (
          <div key={h.id} className="flex flex-col md:flex-row md:items-center gap-0.5 md:gap-3 py-3 border-b border-line-soft last:border-0 text-sm">
            <span className="md:w-36 shrink-0 text-[14px] text-ink-3 tabular-nums max-md:order-2">
              {formatDate(d)} {formatTime(d)}
              <span className="md:hidden">{h.userName ? ` · ${h.userName}` : ''}</span>
            </span>
            <span className="grow max-md:text-[16px]">{h.summary}</span>
            <span className="hidden md:inline text-[14px] text-ink-3">{h.userName ?? 'System'}</span>
          </div>
        );
      })}
    </Card>
  );
}

function QuotationsTab({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useQuotations({ customerId, page: 1 });
  const newQuote = (
    <Button variant="primary" onClick={() => navigate(`/quotations/new?customer=${customerId}`)} className="max-md:h-11">
      New quotation
    </Button>
  );
  if (isLoading) return <Card className="p-6 text-ink-3">Loading quotations…</Card>;
  if (isError) return <EmptyState title="Could not load quotations" body={errorMessage(error)} />;
  if (!data?.items.length) return <EmptyState title="No quotations yet" body="Quotations for this customer will be listed here." action={newQuote} />;
  return (
    <Card className="overflow-hidden max-md:-mx-4 max-md:rounded-none max-md:border-x-0">
      {data.items.map((q) => (
        <Link key={q.id} to={`/quotations/${q.id}`} className="flex items-center gap-3 min-h-16 px-4 py-2.5 border-b border-line-soft last:border-0 text-ink hover:bg-row-hover">
          <span className="grow min-w-0 flex flex-col gap-0.5">
            <span className="font-medium truncate">{q.title ?? q.number}</span>
            <span className="text-[14px] text-ink-3">
              {q.number} · {isoToDisplay(q.issueDate)}
            </span>
          </span>
          <span className="flex flex-col md:flex-row md:items-center items-end gap-1 md:gap-4 shrink-0">
            <span className="font-semibold tabular-nums">{formatMoney(q.totalCents / 100)}</span>
            <Badge tone={quoteTone[q.status]}>{quoteStatusLabel[q.status]}</Badge>
          </span>
        </Link>
      ))}
    </Card>
  );
}

function AppointmentsTab({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useCustomerAppointments(customerId);
  const book = (
    <Button variant="primary" onClick={() => navigate(`/calendar?new=1&customer=${customerId}`)} className="max-md:h-11">
      New appointment
    </Button>
  );
  if (isLoading) return <Card className="p-6 text-ink-3">Loading appointments…</Card>;
  if (isError) return <EmptyState title="Could not load appointments" body={errorMessage(error)} />;
  if (!data?.items.length) return <EmptyState title="No appointments yet" body="Appointments with this customer will be listed here." action={book} />;
  const now = Date.now();
  // API returns newest first: show upcoming soonest-first, then past.
  const upcoming = data.items.filter((a) => Date.parse(a.endsAt) >= now).reverse();
  const past = data.items.filter((a) => Date.parse(a.endsAt) < now);
  const row = (a: (typeof data.items)[number]) => (
    <Link
      key={a.id}
      to={`/calendar?view=day&date=${sgDate(a.startsAt)}&appt=${a.id}`}
      className="flex items-center gap-3 min-h-16 px-4 py-2.5 border-b border-line-soft last:border-0 text-ink hover:bg-row-hover"
    >
      <span className="grow min-w-0 flex flex-col gap-0.5">
        <span className="font-medium truncate">{a.title}</span>
        <span className="text-[14px] text-ink-3">
          {isoToDisplay(sgDate(a.startsAt))} · {sgTime(a.startsAt)}–{sgTime(a.endsAt)}
          {a.assignee ? ` · ${a.assignee.name}` : ''}
        </span>
      </span>
      <Badge tone={appointmentTone[a.status]}>{appointmentStatusLabel[a.status]}</Badge>
    </Link>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{book}</div>
      {upcoming.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-2">Upcoming</h3>
          <Card className="overflow-hidden max-md:-mx-4 max-md:rounded-none max-md:border-x-0">{upcoming.map(row)}</Card>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-2">Past</h3>
          <Card className="overflow-hidden max-md:-mx-4 max-md:rounded-none max-md:border-x-0">{past.map(row)}</Card>
        </section>
      )}
    </div>
  );
}
