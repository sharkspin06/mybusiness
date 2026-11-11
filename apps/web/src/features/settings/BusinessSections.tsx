import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { businessSettingsSchema, formatPhoneSG, type BusinessSettingsInput } from '@mybusiness/shared';
import { Field, TextArea, TextInput } from '../../components/form';
import { Badge, Button, Card, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useBusiness, useSaveBusiness, type Business } from '../../lib/business';
import { planLabel } from '../../lib/session';

export function SectionCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="p-4 md:p-6 flex flex-col gap-4 max-md:-mx-4 max-md:rounded-none max-md:border-x-0">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-[14px] text-ink-3 mt-1">{subtitle}</p>}
      </div>
      {children}
      {footer && <div className="flex flex-wrap justify-end gap-2 pt-1">{footer}</div>}
    </Card>
  );
}

export function ReadOnlyNote() {
  return <p className="rounded-sm bg-surface-1 border border-line px-3 py-2 text-[14px] text-ink-3">Only owners and admins can change these settings.</p>;
}

type Form = {
  name: string;
  uen: string;
  gstRegistered: boolean;
  gstRegNo: string;
  phone: string;
  email: string;
  address: string;
  quoteValidityDays: string;
  quoteTerms: string;
};
const toForm = (b: Business): Form => ({
  name: b.name,
  uen: b.uen ?? '',
  gstRegistered: b.gstRegistered,
  gstRegNo: b.gstRegNo ?? '',
  phone: b.phone ? formatPhoneSG(b.phone) : '',
  email: b.email ?? '',
  address: b.address ?? '',
  quoteValidityDays: String(b.quoteValidityDays),
  quoteTerms: b.quoteTerms ?? '',
});
const toInput = (f: Form): BusinessSettingsInput => ({ ...f, quoteValidityDays: f.quoteValidityDays.trim() === '' ? NaN : Number(f.quoteValidityDays) });

/** Shared form state for the two sections that save the business record. */
function useBusinessForm() {
  const { data: business } = useBusiness();
  const save = useSaveBusiness();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (business && !form) setForm(toForm(business));
  }, [business, form]);
  const dirty = !!business && !!form && JSON.stringify(toForm(business)) !== JSON.stringify(form);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setErrors(({ [k]: _d, ...rest }) => rest);
    setMsg(null);
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const check = businessSettingsSchema.safeParse(toInput(form));
    if (!check.success) {
      const fe: Record<string, string> = {};
      for (const i of check.error.issues) fe[String(i.path[0])] ??= i.message;
      setErrors(fe);
      return setMsg({ ok: false, text: 'Please fix the highlighted fields.' });
    }
    try {
      const saved = await save.mutateAsync(toInput(form));
      setForm(toForm(saved));
      setMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation') setErrors(err.fields);
      setMsg({ ok: false, text: errorMessage(err) });
    }
  }
  const reset = () => business && (setForm(toForm(business)), setErrors({}), setMsg(null));
  return { business, form, set, errors, msg, dirty, submit, reset, saving: save.isPending };
}

function SaveBar({ dirty, saving, msg, onCancel, canEdit }: { dirty: boolean; saving: boolean; msg: { ok: boolean; text: string } | null; onCancel: () => void; canEdit: boolean }) {
  if (!canEdit) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {msg && (
        <span role={msg.ok ? 'status' : 'alert'} className={cx('text-sm grow', msg.ok ? 'text-success' : 'text-danger')}>
          {msg.text}
        </span>
      )}
      <Button onClick={onCancel} disabled={!dirty || saving} className="max-md:h-11 max-md:grow">
        Cancel
      </Button>
      <Button type="submit" variant="primary" disabled={!dirty || saving} className="max-md:h-11 max-md:grow">
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  );
}

export function BusinessProfileSection({ canEdit }: { canEdit: boolean }) {
  const { form, set, errors, msg, dirty, submit, reset, saving } = useBusinessForm();
  if (!form) return <Card className="p-6 text-ink-3">Loading…</Card>;
  const ro = !canEdit;
  return (
    <form onSubmit={submit} noValidate>
      <SectionCard title="Business profile" subtitle="Shown on quotations, PDFs and WhatsApp messages." footer={<SaveBar dirty={dirty} saving={saving} msg={msg} onCancel={reset} canEdit={canEdit} />}>
        {ro && <ReadOnlyNote />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Registered name" error={errors.name}>
            {(a) => <TextInput {...a} disabled={ro} value={form.name} onChange={(e) => set('name', e.target.value)} />}
          </Field>
          <Field label="UEN" error={errors.uen} hint="Unique Entity Number, e.g. 201912345K">
            {(a) => <TextInput {...a} disabled={ro} value={form.uen} onChange={(e) => set('uen', e.target.value.toUpperCase())} />}
          </Field>
          <Field label="Phone" error={errors.phone}>
            {(a) => <TextInput {...a} type="tel" disabled={ro} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+65 6123 4567" />}
          </Field>
          <Field label="Email" error={errors.email}>
            {(a) => <TextInput {...a} type="email" disabled={ro} value={form.email} onChange={(e) => set('email', e.target.value)} />}
          </Field>
          <Field label="Address" error={errors.address} className="sm:col-span-2">
            {(a) => <TextInput {...a} disabled={ro} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="10 Ubi Crescent, #03-21, Singapore 408564" />}
          </Field>
          <div>
            <span className="block text-[14px] font-medium text-ink-2 mb-1.5">GST registration</span>
            <button
              type="button"
              role="switch"
              aria-checked={form.gstRegistered}
              disabled={ro}
              onClick={() => set('gstRegistered', !form.gstRegistered)}
              className="flex items-center gap-2.5 h-11 md:h-9 cursor-pointer disabled:cursor-default"
            >
              <span className={cx('relative w-9 h-5 rounded-full transition-colors', form.gstRegistered ? 'bg-accent' : 'bg-line-strong')}>
                <span className={cx('absolute top-0.5 size-4 rounded-full bg-white transition-all', form.gstRegistered ? 'left-[18px]' : 'left-0.5')} />
              </span>
              <span className="text-sm">{form.gstRegistered ? 'Registered · 9% GST added to quotations' : 'Not registered · no GST charged'}</span>
            </button>
          </div>
          {form.gstRegistered && (
            <Field label="GST reg. no." error={errors.gstRegNo}>
              {(a) => <TextInput {...a} disabled={ro} value={form.gstRegNo} onChange={(e) => set('gstRegNo', e.target.value.toUpperCase())} />}
            </Field>
          )}
          <Field label="Currency" className={form.gstRegistered ? '' : 'sm:col-start-1'}>
            {(a) => <TextInput {...a} value="SGD (S$)" disabled />}
          </Field>
          <Field label="Date format">
            {(a) => <TextInput {...a} value="DD/MM/YYYY" disabled />}
          </Field>
        </div>
        <p className="text-xs text-ink-3">Changing GST only affects new quotations. Existing ones keep the GST they were made with.</p>
      </SectionCard>
    </form>
  );
}

export function QuotationDefaultsSection({ canEdit }: { canEdit: boolean }) {
  const { business, form, set, errors, msg, dirty, submit, reset, saving } = useBusinessForm();
  if (!form || !business) return <Card className="p-6 text-ink-3">Loading…</Card>;
  const ro = !canEdit;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <SectionCard title="Quotation defaults" subtitle="Used for every new quotation. You can still change them on each quotation." footer={<SaveBar dirty={dirty} saving={saving} msg={msg} onCancel={reset} canEdit={canEdit} />}>
        {ro && <ReadOnlyNote />}
        <Field label="Valid for (days)" error={errors.quoteValidityDays} hint="Sets the ‘Valid until’ date on new quotations" className="max-w-[220px]">
          {(a) => <TextInput {...a} inputMode="numeric" disabled={ro} value={form.quoteValidityDays} onChange={(e) => set('quoteValidityDays', e.target.value.replace(/\D/g, ''))} />}
        </Field>
        <Field label="Default notes & terms" error={errors.quoteTerms} hint="Printed at the bottom of the quotation PDF">
          {(a) => (
            <TextArea
              {...a}
              rows={5}
              disabled={ro}
              value={form.quoteTerms}
              onChange={(e) => set('quoteTerms', e.target.value)}
              placeholder="e.g. 50% deposit on confirmation, balance on completion. Payment by PayNow (UEN …) or bank transfer."
            />
          )}
        </Field>
      </SectionCard>
      <SectionCard title="GST">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge tone={business.gstRegistered ? 'green' : 'grey'}>{business.gstRegistered ? 'GST-registered' : 'Not GST-registered'}</Badge>
          <span className="text-ink-3">{business.gstRegistered ? `9% GST is added after any discount. Reg. no. ${business.gstRegNo ?? '—'}.` : 'Quotations show no GST.'}</span>
          <Link to="/settings/business" className="text-accent font-medium">
            Change in Business profile
          </Link>
        </div>
      </SectionCard>
    </form>
  );
}

export function RemindersSection() {
  return (
    <SectionCard title="Reminders" subtitle="Automatic WhatsApp and email reminders for appointments.">
      <p className="rounded-sm bg-warning-soft text-warning px-3 py-2 text-sm">Not switched on yet. Sending needs a WhatsApp Business account and an email service connected to the server.</p>
      <p className="text-sm text-ink-2 leading-relaxed">
        You can already choose reminders on each appointment (for example “WhatsApp, 1 day before”). They are saved and will start sending automatically once messaging is set up. Until then,
        use <strong className="font-semibold">WhatsApp customer</strong> on an appointment to send a reminder yourself.
      </p>
    </SectionCard>
  );
}

export function SubscriptionSection() {
  const { data: b } = useBusiness();
  return (
    <SectionCard title="Subscription">
      <div className="flex items-center gap-3">
        <span className="text-sm text-ink-3">Current plan</span>
        <Badge tone="teal">{b ? planLabel(b.plan) : '…'}</Badge>
      </div>
      <p className="text-sm text-ink-2">Plans and online payment aren’t set up yet. Everything is available during the trial.</p>
    </SectionCard>
  );
}

export function DataSection({ canExport }: { canExport: boolean }) {
  const files: [string, string][] = [
    ['customers', 'Customers'],
    ['quotations', 'Quotations'],
    ['appointments', 'Appointments'],
    ['tasks', 'Tasks'],
  ];
  return (
    <SectionCard title="Data export & backups" subtitle="Your data stays yours. Download it at any time.">
      {!canExport ? (
        <p className="rounded-sm bg-surface-1 border border-line px-3 py-2 text-[14px] text-ink-3">Only owners and admins can export data.</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-medium text-ink-2">Spreadsheets (CSV, opens in Excel or Google Sheets)</span>
            <div className="flex flex-wrap gap-2">
              {files.map(([k, label]) => (
                <a
                  key={k}
                  href={`/api/export/${k}.csv`}
                  download
                  className="inline-flex items-center justify-center h-11 md:h-9 px-3.5 rounded-sm border border-line-strong bg-bg text-sm font-medium text-ink hover:bg-surface-1 max-md:grow"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line-soft">
            <span className="grow text-sm text-ink-2">Everything in one file (JSON): customers, quotations with line items, appointments, tasks and history.</span>
            <a href="/api/export/all.json" download className="inline-flex items-center justify-center h-11 md:h-9 px-3.5 rounded-sm bg-accent text-white text-sm font-medium hover:bg-accent-hover max-md:w-full">
              Download full export
            </a>
          </div>
        </>
      )}
      <p className="text-xs text-ink-3">Automatic daily backups of the whole database are set up on the server (see the README’s backup section).</p>
    </SectionCard>
  );
}
