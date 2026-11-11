import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CUSTOMER_STATUSES, formatDate, formatPhoneSG, type Customer, type CustomerStatus } from '@mybusiness/shared';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/form';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { PAGE_SIZE, useCustomers } from './api';
import { CustomerFormDialog } from './CustomerFormDialog';
import { customerStatusLabel, statusTone } from './status';

type Filter = 'all' | CustomerStatus;

/** Customers list: view tabs, search, desktop table / phone rows, paging. Filters live in the URL. */
export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const status = (CUSTOMER_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as CustomerStatus) : undefined;
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const adding = params.get('new') === '1';

  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  // Search as you type, a moment after typing stops.
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => update({ q: search.trim() || null, page: null }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading, isError, error, isFetching, refetch } = useCustomers({ status, q: q || undefined, page });
  const counts = data?.counts;
  const filter: Filter = status ?? 'all';
  const filterOptions: { value: Filter; label: string }[] = [
    { value: 'all', label: `All${counts ? ` ${counts.all}` : ''}` },
    { value: 'active', label: `Active${counts ? ` ${counts.active}` : ''}` },
    { value: 'lead', label: `Leads${counts ? ` ${counts.lead}` : ''}` },
    { value: 'inactive', label: `Inactive${counts ? ` ${counts.inactive}` : ''}` },
  ];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const subtitle = counts && !q ? `${counts.all} customer${counts.all === 1 ? '' : 's'} · ${counts.lead} lead${counts.lead === 1 ? '' : 's'}` : undefined;

  return (
    <>
      <div className="hidden md:block">
        <PageHeader
          title="Customers"
          subtitle={subtitle}
          actions={
            <>
              <Button disabled title="Coming soon">
                Import CSV
              </Button>
              <Button variant="primary" onClick={() => update({ new: '1' })}>
                <Icon name="plus" />
                Add customer
              </Button>
            </>
          }
        />
      </div>

      <div className="flex flex-col-reverse md:flex-row md:flex-wrap md:items-center gap-3">
        <Segmented label="Show" value={filter} options={filterOptions} onChange={(v) => update({ status: v === 'all' ? null : v, page: null })} />
        <div className="grow hidden md:block" />
        <label className="relative md:w-72">
          <span className="sr-only">Search customers</span>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
            <Icon name="search" />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, company"
            className="w-full h-11 md:h-9 pl-10 pr-3 rounded-md md:rounded-sm border border-line bg-surface-1 md:bg-bg md:border-line-strong placeholder:text-ink-3 focus:bg-bg focus:border-accent"
          />
        </label>
      </div>

      {isError ? (
        <EmptyState title="Could not load customers" body={errorMessage(error)} action={<Button onClick={() => refetch()}>Try again</Button>} />
      ) : isLoading ? (
        <Card className="p-6 text-ink-3">Loading customers…</Card>
      ) : data && data.items.length === 0 ? (
        q || status ? (
          <EmptyState title="No matching customers" body="Try a different name, phone number or filter." action={<Button onClick={() => update({ q: null, status: null, page: null })}>Clear filters</Button>} />
        ) : (
          <EmptyState
            title="No customers yet"
            body="Add your first customer to start sending quotations and booking appointments."
            action={
              <Button variant="primary" onClick={() => update({ new: '1' })}>
                Add customer
              </Button>
            }
          />
        )
      ) : data ? (
        <div className={isFetching ? 'opacity-70 transition-opacity' : undefined}>
          {/* Desktop and tablet: table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm border-collapse">
                <thead>
                  <tr className="bg-row-hover border-b border-line text-left text-xs font-medium text-ink-3">
                    <th className="px-3 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">Phone</th>
                    <th className="px-3 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Last activity</th>
                    <th className="px-3 py-2.5 font-medium text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/customers/${c.id}`)}
                      className="border-b border-line-soft last:border-0 hover:bg-row-hover cursor-pointer"
                    >
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={c.name} />
                          <span className="flex flex-col gap-0.5 min-w-0 whitespace-nowrap">
                            {/* Real link so keyboard and screen-reader users can open the profile. */}
                            <Link to={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:underline">
                              {c.name}
                            </Link>
                            <span className="text-[14px] text-ink-3">{subline(c)}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap tabular-nums">{c.phone ? formatPhoneSG(c.phone) : '—'}</td>
                      <td className="px-3 py-3 text-ink-3">{c.email ?? '—'}</td>
                      <td className="px-3 py-3">
                        <Badge tone={statusTone[c.status]}>{customerStatusLabel[c.status]}</Badge>
                      </td>
                      <td className="px-3 py-3 text-ink-3 whitespace-nowrap">{formatDate(new Date(c.updatedAt))}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-3" title="Shown once Payments is built">
                        —
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} total={data.total} shown={data.items.length} onPage={(p) => update({ page: p === 1 ? null : String(p) })} />
          </Card>

          {/* Phone: stacked rows */}
          <div className="md:hidden -mx-4 border-t border-line-soft">
            {data.items.map((c) => (
              <Link key={c.id} to={`/customers/${c.id}`} className="flex items-center gap-3 min-h-[72px] px-4 py-2.5 border-b border-line-soft text-ink active:bg-row-hover">
                <Avatar name={c.name} size="touch" />
                <span className="grow min-w-0 flex flex-col gap-0.5">
                  <span className="text-base font-medium truncate">{c.name}</span>
                  <span className="text-[14px] text-ink-3 truncate">
                    {[c.phone ? formatPhoneSG(c.phone) : null, c.company].filter(Boolean).join(' · ') || subline(c)}
                  </span>
                </span>
                <Badge tone={statusTone[c.status]}>{customerStatusLabel[c.status]}</Badge>
              </Link>
            ))}
            {totalPages > 1 && (
              <div className="px-4 pt-3">
                <Pager page={page} totalPages={totalPages} total={data.total} shown={data.items.length} onPage={(p) => update({ page: p === 1 ? null : String(p) })} />
              </div>
            )}
          </div>
        </div>
      ) : null}

      <CustomerFormDialog open={adding} onClose={() => update({ new: null })} onSaved={(c) => navigate(`/customers/${c.id}`)} />
    </>
  );
}

function subline(c: Customer) {
  return c.company ?? (c.customerType === 'individual' ? 'Individual' : 'Business');
}

function Pager({ page, totalPages, total, shown, onPage }: { page: number; totalPages: number; total: number; shown: number; onPage: (p: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  return (
    <div className="flex items-center gap-2 md:px-4 py-2.5 md:border-t border-line text-[14px] text-ink-3">
      <span className="grow">
        Showing {from}–{from + shown - 1} of {total}
      </span>
      <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} className="max-md:h-11 max-md:px-4">
        Previous
      </Button>
      <Button size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="max-md:h-11 max-md:px-4">
        Next
      </Button>
    </div>
  );
}
