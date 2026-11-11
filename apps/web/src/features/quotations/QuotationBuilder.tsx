import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  DISCOUNT_OPTIONS_BP,
  addDaysIso,
  calculateTotals,
  formatMoney,
  formatPhoneSG,
  isoToDisplay,
  parseDollarsToCents,
  quotationInputSchema,
  todayInSingapore,
  type Quotation,
  type QuotationInput,
} from '@mybusiness/shared';
import { Dialog } from '../../components/Dialog';
import { Field, Segmented, TextArea, TextInput } from '../../components/form';
import { Icon } from '../../components/Icon';
import { Avatar, Badge, Button, Card, EmptyState, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useBusiness } from '../../lib/business';
import { useCrumb } from '../../layout/crumb';
import { useCustomer } from '../customers/api';
import { useDeleteQuotation, useQuotation, useSaveQuotation, useSetQuotationStatus } from './api';
import { CustomerPicker, type PickedCustomer } from './CustomerPicker';
import { quoteStatusLabel, quoteTone } from './status';

const money = (cents: number) => formatMoney(cents / 100);

interface LineForm {
  key: string;
  service: string;
  description: string;
  quantity: string;
  price: string;
}
interface FormState {
  customer: PickedCustomer | null;
  title: string;
  issueDate: string;
  validUntil: string;
  discountBp: number;
  notes: string;
  items: LineForm[];
}

let keySeq = 0;
const newKey = () => `l${++keySeq}`;
const blankLine = (): LineForm => ({ key: newKey(), service: '', description: '', quantity: '1', price: '' });
const centsToText = (c: number) => (c / 100).toFixed(2);

function emptyForm(): FormState {
  const today = todayInSingapore();
  return { customer: null, title: '', issueDate: today, validUntil: addDaysIso(today, 30), discountBp: 0, notes: '', items: [blankLine()] };
}

function fromQuotation(q: Quotation): FormState {
  return {
    customer: q.customer,
    title: q.title ?? '',
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    discountBp: q.discountBp,
    notes: q.notes ?? '',
    items: q.items.map((i) => ({
      key: newKey(),
      service: i.service,
      description: i.description ?? '',
      quantity: String(i.quantity),
      price: centsToText(i.unitPriceCents),
    })),
  };
}

const lineQty = (l: LineForm) => (l.quantity.trim() === '' ? NaN : Number(l.quantity));
const linePrice = (l: LineForm) => parseDollarsToCents(l.price) ?? NaN;

function toInput(f: FormState): QuotationInput {
  return {
    customerId: f.customer?.id ?? '',
    title: f.title,
    issueDate: f.issueDate,
    validUntil: f.validUntil,
    discountBp: f.discountBp,
    notes: f.notes,
    items: f.items.map((l) => ({ service: l.service, description: l.description, quantity: lineQty(l), unitPriceCents: linePrice(l) })),
  };
}

/** Comparable snapshot for "unsaved changes" (ignores the random row keys). */
const snapshot = (f: FormState) => JSON.stringify({ ...toInput(f), items: f.items.map(({ key: _k, ...rest }) => rest) });

/**
 * Quotation builder (new and existing). Desktop: form on the left, summary/share/preview on the right.
 * Phone: stacked form with a bottom bar showing the total, PDF and WhatsApp.
 */
export function QuotationBuilder() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { data: existing, isLoading, isError, error } = useQuotation(isNew ? undefined : id);
  if (!isNew && isLoading) return <Card className="p-6 text-ink-3">Loading quotation…</Card>;
  if (!isNew && (isError || !existing)) {
    const missing = error instanceof ApiError && error.status === 404;
    return <EmptyState title={missing ? 'Quotation not found' : 'Could not load this quotation'} body={missing ? 'It may have been deleted.' : errorMessage(error)} />;
  }
  return <Builder key={existing?.id ?? 'new'} existing={existing} />;
}

function Builder({ existing }: { existing?: Quotation }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: business } = useBusiness();
  const save = useSaveQuotation();
  const setStatus = useSetQuotationStatus();
  const del = useDeleteQuotation();

  const [form, setForm] = useState<FormState>(() => (existing ? fromQuotation(existing) : emptyForm()));
  const [saved, setSaved] = useState(() => (existing ? snapshot(fromQuotation(existing)) : null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const quote = existing;
  const locked = quote?.status === 'accepted';
  const dirty = saved === null || snapshot(form) !== saved;
  useCrumb(quote ? quote.number : 'New quotation');

  // New quotations: apply the business's defaults (Settings › Quotation & GST) once they've loaded.
  const defaultsApplied = useRef(!!existing);
  useEffect(() => {
    if (!business || defaultsApplied.current) return;
    defaultsApplied.current = true;
    setForm((f) => ({ ...f, validUntil: addDaysIso(f.issueDate, business.quoteValidityDays), notes: f.notes || (business.quoteTerms ?? '') }));
  }, [business]);

  // Prefill the customer when coming from a customer profile (?customer=id).
  const prefillId = !existing ? (params.get('customer') ?? undefined) : undefined;
  const { data: prefill } = useCustomer(prefillId ?? '');
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefill && !prefilled.current && !form.customer) {
      prefilled.current = true;
      setForm((f) => ({ ...f, customer: prefill }));
    }
  }, [prefill, form.customer]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty || locked) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, locked]);

  const gstRegistered = quote ? quote.gstRegistered : (business?.gstRegistered ?? false);
  const gstRateBp = quote ? quote.gstRateBp : (business?.gstRateBp ?? 900);
  const totals = useMemo(() => {
    const lines = form.items.map((l) => {
      const qn = lineQty(l);
      const p = linePrice(l);
      return { quantity: Number.isFinite(qn) ? qn : 0, unitPriceCents: Number.isFinite(p) ? p : 0 };
    });
    return { ...calculateTotals(lines, form.discountBp / 100, gstRegistered, gstRateBp / 100), lineAmounts: lines.map((l) => Math.round(l.quantity * l.unitPriceCents)) };
  }, [form.items, form.discountBp, gstRegistered, gstRateBp]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      const { [k as string]: _drop, ...rest } = e;
      return rest;
    });
  };
  const setLine = (key: string, field: keyof Omit<LineForm, 'key'>, value: string) => {
    setForm((f) => ({ ...f, items: f.items.map((l) => (l.key === key ? { ...l, [field]: value } : l)) }));
    const idx = form.items.findIndex((l) => l.key === key);
    setErrors((e) => {
      const { [`items.${idx}.${field === 'price' ? 'unitPriceCents' : field}`]: _drop, items: _i, ...rest } = e;
      return rest;
    });
  };
  const addLine = () => setForm((f) => ({ ...f, items: [...f.items, blankLine()] }));
  const removeLine = (key: string) => setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((l) => l.key !== key) : f.items }));

  /** Validate and save. Returns the saved quotation, or null if something needs fixing. */
  async function persist(): Promise<Quotation | null> {
    setBanner(null);
    const input = toInput(form);
    const check = quotationInputSchema.safeParse(input);
    if (!check.success) {
      const fe: Record<string, string> = {};
      for (const i of check.error.issues) fe[i.path.join('.')] ??= i.message;
      setErrors(fe);
      setBanner({ tone: 'error', text: 'Please fix the highlighted fields.' });
      return null;
    }
    if (!dirty && quote) return quote;
    try {
      const result = await save.mutateAsync({ id: quote?.id, data: input });
      setSaved(snapshot(form));
      if (!quote) navigate(`/quotations/${result.id}`, { replace: true });
      return result;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation') setErrors(err.fields);
      setBanner({ tone: 'error', text: errorMessage(err) });
      return null;
    }
  }

  async function onSave() {
    const r = await persist();
    if (r && quote) setBanner({ tone: 'ok', text: 'Saved.' });
  }

  // Popup blockers (iPhone Safari especially) only allow windows opened straight from a tap,
  // so open the tab first and point it at the PDF / WhatsApp once saving finishes.
  async function openAfterSave(build: (q: Quotation) => Promise<string>) {
    const w = window.open('', '_blank');
    const r = await persist();
    if (!r) {
      w?.close();
      return;
    }
    try {
      const url = await build(r);
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (err) {
      w?.close();
      setBanner({ tone: 'error', text: errorMessage(err) });
    }
  }

  const onPdf = () => openAfterSave(async (q) => `/api/quotations/${q.id}/pdf`);

  const onWhatsApp = () =>
    openAfterSave(async (q) => {
      const sent = q.status === 'draft' ? await setStatus.mutateAsync({ id: q.id, status: 'sent' }) : q;
      return whatsappUrl(sent, business?.name);
    });

  async function changeStatus(status: 'sent' | 'accepted' | 'draft') {
    if (!quote) return;
    setBanner(null);
    try {
      await setStatus.mutateAsync({ id: quote.id, status });
    } catch (err) {
      setBanner({ tone: 'error', text: errorMessage(err) });
    }
  }

  async function onDelete() {
    if (!quote) return;
    try {
      await del.mutateAsync(quote);
      navigate('/quotations', { replace: true });
    } catch (err) {
      setConfirmDelete(false);
      setBanner({ tone: 'error', text: errorMessage(err) });
    }
  }

  const busy = save.isPending || setStatus.isPending;
  const previewMessage = whatsappText({
    first: form.customer?.name.split(/\s+/)[0],
    number: quote?.number ?? 'Q-…',
    total: money(totals.totalCents),
    gst: gstRegistered,
    link: quote?.shareUrl ?? '(PDF link is created when you save)',
    businessName: business?.name,
  });

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="grow min-w-0 flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl md:text-2xl leading-8 font-semibold">{quote ? `Quotation ${quote.number}` : 'New quotation'}</h1>
          <Badge tone={quote ? quoteTone[quote.status] : 'grey'}>{quote ? quoteStatusLabel[quote.status] : 'Draft'}</Badge>
          {dirty && !locked && quote && <span className="text-[14px] text-ink-3">Unsaved changes</span>}
        </div>
        <div className="hidden md:flex flex-wrap gap-2">
          {!locked && (
            <Button onClick={onSave} disabled={busy || (!dirty && !!quote)}>
              {save.isPending ? 'Saving…' : quote ? 'Save' : 'Save draft'}
            </Button>
          )}
          <Button onClick={onPdf} disabled={busy}>
            <Icon name="download" />
            Download PDF
          </Button>
          <Button variant="primary" onClick={onWhatsApp} disabled={busy}>
            <Icon name="message" />
            Share on WhatsApp
          </Button>
        </div>
      </div>

      {banner && (
        <p role={banner.tone === 'error' ? 'alert' : 'status'} className={cx('rounded-sm px-3 py-2 text-sm', banner.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
          {banner.text}
        </p>
      )}
      {locked && quote && (
        <div className="rounded-md bg-surface-1 border border-line px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="grow">
            Accepted{quote.acceptedAt ? ` on ${isoToDisplay(quote.acceptedAt.slice(0, 10))}` : ''}. Accepted quotations can’t be changed.
          </span>
          <Button size="sm" onClick={() => changeStatus('sent')} className="max-md:h-11">
            Move back to Sent
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-5 items-start">
        {/* Main column */}
        <div className="flex-[2_1_560px] min-w-0 flex flex-col gap-4">
          <Card className="p-4 md:p-5 flex flex-col gap-4">
            <div>
              <span className="block text-[14px] font-medium text-ink-2 mb-1.5">Customer</span>
              <button
                type="button"
                onClick={() => !locked && setPicking(true)}
                disabled={locked}
                aria-invalid={errors.customerId ? true : undefined}
                className={cx(
                  'w-full flex items-center gap-3 min-h-14 px-3 py-2.5 rounded-sm border bg-bg text-left',
                  errors.customerId ? 'border-danger' : 'border-line-strong',
                  locked ? 'cursor-default' : 'cursor-pointer hover:bg-surface-1',
                )}
              >
                {form.customer ? (
                  <>
                    <Avatar name={form.customer.name} />
                    <span className="grow min-w-0 flex flex-col gap-0.5">
                      <span className="font-medium truncate">{form.customer.name}</span>
                      <span className="text-[14px] text-ink-3 truncate">
                        {[form.customer.phone ? formatPhoneSG(form.customer.phone) : null, form.customer.company, form.customer.address].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    {!locked && <span className="text-[14px] font-medium text-accent">Change</span>}
                  </>
                ) : (
                  <>
                    <span className="size-8 rounded-full border border-dashed border-line-strong flex items-center justify-center text-ink-3">
                      <Icon name="plus" size={16} />
                    </span>
                    <span className="grow text-ink-3">Choose a customer</span>
                  </>
                )}
              </button>
              {errors.customerId && <p className="text-xs text-danger mt-1.5">{errors.customerId}</p>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <Field label="Quote title" error={errors.title} className="col-span-2 md:col-span-1">
                {(a) => <TextInput {...a} value={form.title} disabled={locked} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Kitchen cabinet refurbishment" />}
              </Field>
              <Field label="Issue date" error={errors.issueDate}>
                {(a) => <TextInput {...a} type="date" value={form.issueDate} disabled={locked} onChange={(e) => set('issueDate', e.target.value)} />}
              </Field>
              <Field label="Valid until" error={errors.validUntil}>
                {(a) => <TextInput {...a} type="date" value={form.validUntil} min={form.issueDate} disabled={locked} onChange={(e) => set('validUntil', e.target.value)} />}
              </Field>
            </div>
          </Card>

          {/* Line items */}
          <Card className="overflow-hidden max-md:border-0 max-md:bg-transparent">
            <div className="flex items-center px-0 md:px-4 py-3">
              <h2 className="grow text-base font-semibold">Line items</h2>
              <span className="text-[14px] text-ink-3">Prices in SGD{gstRegistered ? ', before GST' : ''}</span>
            </div>
            {errors.items && <p className="text-xs text-danger md:px-4 pb-2">{errors.items}</p>}

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm border-collapse">
                <thead>
                  <tr className="bg-row-hover border-y border-line text-left text-xs text-ink-3">
                    <th className="w-8 px-3 py-2.5 font-medium">#</th>
                    <th className="px-2 py-2.5 font-medium w-[24%]">Service</th>
                    <th className="px-2 py-2.5 font-medium">Description</th>
                    <th className="w-20 px-2 py-2.5 font-medium text-right">Qty</th>
                    <th className="w-32 px-2 py-2.5 font-medium text-right">Unit price</th>
                    <th className="w-32 px-3 py-2.5 font-medium text-right">Amount</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((l, idx) => (
                    <tr key={l.key} className="border-b border-line-soft align-top">
                      <td className="px-3 py-3.5 text-ink-3">{idx + 1}</td>
                      <td className="px-2 py-2">
                        <CellInput label={`Service, line ${idx + 1}`} value={l.service} error={errors[`items.${idx}.service`]} disabled={locked} onChange={(v) => setLine(l.key, 'service', v)} placeholder="Service" className="font-medium" />
                      </td>
                      <td className="px-2 py-2">
                        <CellInput label={`Description, line ${idx + 1}`} value={l.description} disabled={locked} onChange={(v) => setLine(l.key, 'description', v)} placeholder="Optional" />
                      </td>
                      <td className="px-2 py-2">
                        <CellInput label={`Quantity, line ${idx + 1}`} value={l.quantity} error={errors[`items.${idx}.quantity`]} disabled={locked} inputMode="decimal" onChange={(v) => setLine(l.key, 'quantity', v)} className="text-right tabular-nums" />
                      </td>
                      <td className="px-2 py-2">
                        <CellInput label={`Unit price, line ${idx + 1}`} value={l.price} error={errors[`items.${idx}.unitPriceCents`]} disabled={locked} inputMode="decimal" onChange={(v) => setLine(l.key, 'price', v)} placeholder="0.00" className="text-right tabular-nums" />
                      </td>
                      <td className="px-3 py-3.5 text-right font-medium tabular-nums whitespace-nowrap">{money(totals.lineAmounts[idx] ?? 0)}</td>
                      <td className="py-2 pr-2">
                        {!locked && (
                          <button type="button" onClick={() => removeLine(l.key)} disabled={form.items.length === 1} aria-label={`Remove line ${idx + 1}`} className="size-9 rounded-sm flex items-center justify-center text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30 cursor-pointer">
                            <Icon name="close" size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <div className="md:hidden flex flex-col gap-2">
              {form.items.map((l, idx) => (
                <div key={l.key} className="bg-bg border border-line rounded-lg p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] text-ink-3 grow">Line {idx + 1}</span>
                    <span className="font-semibold tabular-nums">{money(totals.lineAmounts[idx] ?? 0)}</span>
                    {!locked && form.items.length > 1 && (
                      <button type="button" onClick={() => removeLine(l.key)} aria-label={`Remove line ${idx + 1}`} className="size-11 -my-2 -mr-2 rounded-md flex items-center justify-center text-ink-3 cursor-pointer">
                        <Icon name="close" size={18} />
                      </button>
                    )}
                  </div>
                  <Field label="Service" error={errors[`items.${idx}.service`]}>
                    {(a) => <TextInput {...a} value={l.service} disabled={locked} onChange={(e) => setLine(l.key, 'service', e.target.value)} />}
                  </Field>
                  <Field label="Description">
                    {(a) => <TextArea {...a} rows={2} value={l.description} disabled={locked} onChange={(e) => setLine(l.key, 'description', e.target.value)} />}
                  </Field>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Qty" error={errors[`items.${idx}.quantity`]}>
                      {(a) => <TextInput {...a} inputMode="decimal" value={l.quantity} disabled={locked} onChange={(e) => setLine(l.key, 'quantity', e.target.value)} />}
                    </Field>
                    <Field label="Unit price (S$)" error={errors[`items.${idx}.unitPriceCents`]}>
                      {(a) => <TextInput {...a} inputMode="decimal" value={l.price} placeholder="0.00" disabled={locked} onChange={(e) => setLine(l.key, 'price', e.target.value)} />}
                    </Field>
                  </div>
                </div>
              ))}
            </div>

            {!locked && (
              <div className="md:px-4 py-3 md:border-t border-line flex gap-2 flex-wrap max-md:mt-2">
                <Button size="sm" onClick={addLine} className="max-md:h-11 max-md:grow max-md:border-dashed">
                  <Icon name="plus" size={16} />
                  Add line item
                </Button>
                <Button size="sm" variant="ghost" disabled title="Comes with the price list in Documents" className="hidden md:inline-flex">
                  Add from price list
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4 md:p-5">
            <Field label="Notes & terms (shown on the PDF)" error={errors.notes}>
              {(a) => <TextArea {...a} rows={4} value={form.notes} disabled={locked} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. 50% deposit on confirmation, balance on completion. Payment by PayNow or bank transfer." />}
            </Field>
          </Card>

          {/* Phone: save + status actions (PDF/WhatsApp are in the bottom bar) */}
          <div className="md:hidden flex flex-col gap-2">
            {!locked && (
              <Button size="lg" onClick={onSave} disabled={busy || (!dirty && !!quote)}>
                {save.isPending ? 'Saving…' : quote ? 'Save changes' : 'Save draft'}
              </Button>
            )}
            {quote && <StatusActions quote={quote} busy={busy} onStatus={changeStatus} onDelete={() => setConfirmDelete(true)} />}
          </div>
        </div>

        {/* Side column (desktop) / totals (phone) */}
        <aside className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <Card className="p-4 md:p-5 flex flex-col gap-3 text-sm">
            <h2 className="text-base font-semibold">Summary</h2>
            <Row label="Subtotal" value={money(totals.subtotalCents)} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="grow text-ink-3">Discount</span>
              <Segmented
                label="Discount"
                value={String(form.discountBp)}
                options={DISCOUNT_OPTIONS_BP.map((bp) => ({ value: String(bp), label: bp === 0 ? 'None' : `${bp / 100}%` }))}
                onChange={(v) => !locked && set('discountBp', Number(v))}
              />
            </div>
            <Row label="Discount amount" value={totals.discountCents ? `−${money(totals.discountCents)}` : money(0)} />
            {gstRegistered ? <Row label={`GST ${gstRateBp / 100}%`} value={money(totals.gstCents)} /> : <p className="text-[14px] text-ink-3">No GST: this business isn’t GST-registered.</p>}
            <div className="flex items-baseline border-t border-line pt-3">
              <span className="grow font-semibold">Total (SGD)</span>
              <span className="text-[22px] font-bold tabular-nums">{money(totals.totalCents)}</span>
            </div>
          </Card>

          <Card className="hidden md:flex p-5 flex-col gap-3">
            <h2 className="text-base font-semibold">Share</h2>
            <div className="bg-surface-1 border border-line rounded-md p-3 text-[14px] leading-normal text-ink-2 break-words">{previewMessage}</div>
            <Button variant="primary" onClick={onWhatsApp} disabled={busy} className="w-full">
              <Icon name="message" />
              {form.customer?.phone ? `Send to ${formatPhoneSG(form.customer.phone)} on WhatsApp` : 'Share on WhatsApp'}
            </Button>
            <p className="text-xs text-ink-3">Sharing saves the quotation and marks it as Sent. The customer gets a link to the PDF.</p>
          </Card>

          {quote && (
            <Card className="hidden md:flex p-5 flex-col gap-3">
              <h2 className="text-base font-semibold">Status</h2>
              <StatusActions quote={quote} busy={busy} onStatus={changeStatus} onDelete={() => setConfirmDelete(true)} />
            </Card>
          )}

          <Card className="hidden md:block p-4">
            <p className="text-[14px] text-ink-3 mb-2.5">PDF preview (A4)</p>
            <PdfPreview form={form} totals={totals} number={quote?.number} gstRegistered={gstRegistered} gstRateBp={gstRateBp} businessName={business?.name} />
          </Card>
        </aside>
      </div>

      {/* Phone bottom bar */}
      <div
        className="md:hidden sticky bottom-0 z-10 -mx-4 -mb-4 mt-1 bg-bg border-t border-line px-4 pt-2.5 flex flex-col gap-2.5"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-baseline">
          <span className="grow text-sm text-ink-3">{gstRegistered ? 'Total incl. GST' : 'Total'}</span>
          <span className="text-[22px] font-bold tabular-nums">{money(totals.totalCents)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Button size="lg" onClick={onPdf} disabled={busy}>
            <Icon name="download" size={20} />
            PDF
          </Button>
          <Button size="lg" variant="primary" onClick={onWhatsApp} disabled={busy}>
            <Icon name="message" size={20} />
            WhatsApp
          </Button>
        </div>
      </div>

      <CustomerPicker open={picking} onClose={() => setPicking(false)} onPick={(c) => set('customer', c)} />
      <Dialog
        open={confirmDelete}
        size="sm"
        title="Delete draft?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <div className="grow" />
            <Button onClick={() => setConfirmDelete(false)} className="max-md:h-11 max-md:grow">
              Keep draft
            </Button>
            <Button variant="danger" onClick={onDelete} disabled={del.isPending} className="max-md:h-11 max-md:grow">
              {del.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-ink-2 leading-relaxed">
          Draft <strong className="font-semibold">{quote?.number}</strong> will be removed. This cannot be undone.
        </p>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="grow text-ink-3">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function CellInput({
  label,
  value,
  onChange,
  error,
  className,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: 'decimal';
}) {
  return (
    <>
      <input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        title={error}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          'w-full h-9 px-2 rounded-sm border bg-bg text-sm placeholder:text-ink-4 focus:border-accent disabled:bg-transparent disabled:border-transparent',
          error ? 'border-danger' : 'border-transparent hover:border-line-strong',
          className,
        )}
        {...rest}
      />
      {error && <span className="block text-[12px] text-danger mt-0.5 px-2">{error}</span>}
    </>
  );
}

function StatusActions({ quote, busy, onStatus, onDelete }: { quote: Quotation; busy: boolean; onStatus: (s: 'sent' | 'accepted' | 'draft') => void; onDelete: () => void }) {
  const cls = 'max-md:h-11';
  return (
    <div className="flex flex-wrap gap-2">
      {quote.status === 'draft' && (
        <>
          <Button size="sm" onClick={() => onStatus('sent')} disabled={busy} className={cls}>
            Mark as sent
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} className={cx(cls, 'text-danger hover:bg-danger-soft')}>
            Delete draft
          </Button>
        </>
      )}
      {(quote.status === 'sent' || quote.status === 'expired') && (
        <>
          <Button size="sm" variant="primary" onClick={() => onStatus('accepted')} disabled={busy} className={cls}>
            Mark as accepted
          </Button>
          <Button size="sm" onClick={() => onStatus('draft')} disabled={busy} className={cls}>
            Move back to draft
          </Button>
        </>
      )}
      {quote.status === 'accepted' && <p className="text-sm text-ink-3">Accepted. Payments will link here once Payments is built.</p>}
    </div>
  );
}

function whatsappText(p: { first?: string; number: string; total: string; gst: boolean; link: string; businessName?: string }) {
  return `Hi${p.first ? ` ${p.first}` : ''}, here is your quotation ${p.number} for ${p.total}${p.gst ? ' (incl. GST)' : ''}. View the PDF: ${p.link}${p.businessName ? ` — ${p.businessName}` : ''}`;
}

function whatsappUrl(q: Quotation, businessName?: string) {
  const text = whatsappText({ first: q.customer.name.split(/\s+/)[0], number: q.number, total: money(q.totalCents), gst: q.gstRegistered, link: q.shareUrl, businessName });
  const digits = q.customer.phone?.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Small HTML stand-in for the PDF so you can see the layout while typing. */
function PdfPreview({
  form,
  totals,
  number,
  gstRegistered,
  gstRateBp,
  businessName,
}: {
  form: FormState;
  totals: ReturnType<typeof calculateTotals> & { lineAmounts: number[] };
  number?: string;
  gstRegistered: boolean;
  gstRateBp: number;
  businessName?: string;
}) {
  return (
    <div aria-hidden="true" className="aspect-[210/297] border border-line rounded-sm p-4 flex flex-col gap-1.5 text-[8px] leading-tight text-ink-2 overflow-hidden">
      <div className="flex justify-between">
        <span className="font-bold text-[11px] text-accent truncate">{businessName ?? 'Your business'}</span>
        <span className="font-bold text-[11px] text-ink">QUOTATION</span>
      </div>
      <span>
        To: {form.customer?.name ?? '—'} · {number ?? 'Q-…'} · {isoToDisplay(form.issueDate)}
      </span>
      {form.title && <span className="font-semibold text-ink">{form.title}</span>}
      <div className="h-px bg-line" />
      {form.items.map((l, i) => (
        <div key={l.key} className="flex gap-2">
          <span className="grow truncate">{l.service || '—'}</span>
          <span className="tabular-nums">{money(totals.lineAmounts[i] ?? 0)}</span>
        </div>
      ))}
      <div className="h-px bg-line" />
      {totals.discountCents > 0 && (
        <div className="flex">
          <span className="grow">Discount</span>
          <span>−{money(totals.discountCents)}</span>
        </div>
      )}
      {gstRegistered && (
        <div className="flex">
          <span className="grow">GST {gstRateBp / 100}%</span>
          <span>{money(totals.gstCents)}</span>
        </div>
      )}
      <div className="flex font-bold text-ink">
        <span className="grow">{gstRegistered ? 'Total incl. GST' : 'Total'}</span>
        <span>{money(totals.totalCents)}</span>
      </div>
    </div>
  );
}
