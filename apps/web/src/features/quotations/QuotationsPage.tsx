import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { QUOTE_FILTERS, formatMoney, isoToDisplay, type QuoteStatus } from '@mybusiness/shared';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/form';
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { QUOTE_PAGE_SIZE, useQuotations } from './api';
import { quoteStatusLabel, quoteTone } from './status';

type Filter = 'all' | QuoteStatus;
const money = (cents: number) => formatMoney(cents / 100);

/** Quotations list: status tabs, search, desktop table / phone rows. Filters live in the URL. */
export function QuotationsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const status = (QUOTE_FILTERS as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as QuoteStatus) : undefined;
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
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

  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => update({ q: search.trim() || null, page: null }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuotations({ status, q: q || undefined, page });
  const counts = data?.counts;
  const filter: Filter = status ?? 'all';
  const label = (name: string, n?: number) => (n === undefined ? name : `${name} ${n}`);
  const options: { value: Filter; label: string }[] = [
    { value: 'all', label: label('All', counts?.all) },
    { value: 'draft', label: label('Draft', counts?.draft) },
    { value: 'sent', label: label('Sent', counts?.sent) },
    { value: 'accepted', label: label('Accepted', counts?.accepted) },
    { value: 'expired', label: label('Expired', counts?.expired) },
  ];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / QUOTE_PAGE_SIZE)) : 1;
  const subtitle = counts && !q ? `${counts.sent} open · ${money(data!.openTotalCents)} awaiting reply` : undefined;

  return (
    <>
      <div className="hidden md:block">
        <PageHeader
          title="Quotations"
          subtitle={subtitle}
          actions={
            <Button variant="primary" onClick={() => navigate('/quotations/new')}>
              <Icon name="plus" />
              New quotation
            </Button>
          }
        />
      </div>

      <div className="flex flex-col-reverse md:flex-row md:flex-wrap md:items-center gap-3">
        <Segmented label="Show" value={filter} options={options} onChange={(v) => update({ status: v === 'all' ? null : v, page: null })} />
        <div className="grow hidden md:block" />
        <label className="relative md:w-72">
          <span className="sr-only">Search quotations</span>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
            <Icon name="search" />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, customer, title"
            className="w-full h-11 md:h-9 pl-10 pr-3 rounded-md md:rounded-sm border border-line bg-surface-1 md:bg-bg md:border-line-strong placeholder:text-ink-3 focus:bg-bg focus:border-accent"
          />
        </label>
      </div>

      {isError ? (
        <EmptyState title="Could not load quotations" body={errorMessage(error)} action={<Button onClick={() => refetch()}>Try again</Button>} />
      ) : isLoading ? (
        <Card className="p-6 text-ink-3">Loading quotations…</Card>
      ) : data && data.items.length === 0 ? (
        q || status ? (
          <EmptyState title="No matching quotations" body="Try a different search or status." action={<Button onClick={() => update({ q: null, status: null, page: null })}>Clear filters</Button>} />
        ) : (
          <EmptyState
            title="No quotations yet"
            body="Create a quotation, then download it as a PDF or send it on WhatsApp."
            action={
              <Button variant="primary" onClick={() => navigate('/quotations/new')}>
                New quotation
              </Button>
            }
          />
        )
      ) : data ? (
        <div className={isFetching ? 'opacity-70 transition-opacity' : undefined}>
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm border-collapse">
                <thead>
                  <tr className="bg-row-hover border-b border-line text-left text-xs text-ink-3">
                    <th className="px-3 py-2.5 font-medium">Quote</th>
                    <th className="px-3 py-2.5 font-medium">Customer</th>
                    <th className="px-3 py-2.5 font-medium">Title</th>
                    <th className="px-3 py-2.5 font-medium">Issued</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Valid until</th>
                    <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Total (incl. GST)</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((qt) => (
                    <tr key={qt.id} onClick={() => navigate(`/quotations/${qt.id}`)} className="border-b border-line-soft last:border-0 hover:bg-row-hover cursor-pointer">
                      <td className="px-3 py-3 font-medium whitespace-nowrap">
                        <Link to={`/quotations/${qt.id}`} onClick={(e) => e.stopPropagation()} className="text-ink hover:underline">
                          {qt.number}
                        </Link>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{qt.customer.name}</td>
                      <td className="px-3 py-3 text-ink-3 max-w-[260px] truncate">{qt.title ?? '—'}</td>
                      <td className="px-3 py-3 text-ink-3 whitespace-nowrap">{isoToDisplay(qt.issueDate)}</td>
                      <td className="px-3 py-3 text-ink-3 whitespace-nowrap">{isoToDisplay(qt.validUntil)}</td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{money(qt.totalCents)}</td>
                      <td className="px-3 py-3">
                        <Badge tone={quoteTone[qt.status]}>{quoteStatusLabel[qt.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} totalPages={totalPages} total={data.total} shown={data.items.length} onPage={(p) => update({ page: p === 1 ? null : String(p) })} />
          </Card>

          <div className="md:hidden -mx-4 border-t border-line-soft">
            {data.items.map((qt) => (
              <Link key={qt.id} to={`/quotations/${qt.id}`} className="flex items-center gap-3 min-h-[76px] px-4 py-2.5 border-b border-line-soft text-ink active:bg-row-hover">
                <span className="grow min-w-0 flex flex-col gap-0.5">
                  <span className="text-[16px] font-medium truncate">{qt.customer.name}</span>
                  <span className="text-[14px] text-ink-3 truncate">
                    {qt.number}
                    {qt.title ? ` · ${qt.title}` : ''}
                  </span>
                  <span className="text-xs text-ink-3">Issued {isoToDisplay(qt.issueDate)}</span>
                </span>
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[16px] font-semibold tabular-nums">{money(qt.totalCents)}</span>
                  <Badge tone={quoteTone[qt.status]}>{quoteStatusLabel[qt.status]}</Badge>
                </span>
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
    </>
  );
}

function Pager({ page, totalPages, total, shown, onPage }: { page: number; totalPages: number; total: number; shown: number; onPage: (p: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * QUOTE_PAGE_SIZE + 1;
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
