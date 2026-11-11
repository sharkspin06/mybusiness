import { useEffect, useState, type FormEvent } from 'react';
import {
  customerInputSchema,
  formatPhoneSG,
  type Customer,
  type CustomerInput,
  type CustomerStatus,
} from '@mybusiness/shared';
import { Dialog } from '../../components/Dialog';
import { Field, Select, TextArea, TextInput } from '../../components/form';
import { Button } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useDeleteCustomer, useSaveCustomer } from './api';

interface FormState {
  name: string;
  company: string;
  customerType: 'individual' | 'business';
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  status: CustomerStatus;
  preferredContact: 'whatsapp' | 'phone' | 'email';
  tags: string;
  notes: string;
}

function toForm(c?: Customer): FormState {
  return {
    name: c?.name ?? '',
    company: c?.company ?? '',
    customerType: c?.customerType ?? 'individual',
    phone: c?.phone ? formatPhoneSG(c.phone) : '',
    email: c?.email ?? '',
    address: c?.address ?? '',
    postalCode: c?.postalCode ?? '',
    status: c?.status ?? 'active',
    preferredContact: c?.preferredContact ?? 'whatsapp',
    tags: c?.tags.join(', ') ?? '',
    notes: c?.notes ?? '',
  };
}

function toInput(f: FormState): CustomerInput {
  return {
    ...f,
    tags: f.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

/** Add a customer (no `customer`) or edit one. Validates with the same rules as the API. */
export function CustomerFormDialog({
  open,
  customer,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  customer?: Customer;
  onClose: () => void;
  onSaved?: (c: Customer) => void;
  onDeleted?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(customer));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveCustomer();
  const del = useDeleteCustomer();

  useEffect(() => {
    if (open) {
      setForm(toForm(customer));
      setErrors({});
      setFormError(null);
      setConfirmDelete(false);
    }
  }, [open, customer]);

  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const input = toInput(form);
    const check = customerInputSchema.safeParse(input);
    if (!check.success) {
      const fe: Record<string, string> = {};
      for (const i of check.error.issues) fe[String(i.path[0])] ??= i.message;
      setErrors(fe);
      return;
    }
    try {
      const saved = await save.mutateAsync({ id: customer?.id, data: input });
      // Close first, then let the caller navigate, so the close doesn't rewrite the new page's URL.
      onClose();
      onSaved?.(saved);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation') setErrors(err.fields);
      setFormError(errorMessage(err));
    }
  }

  async function remove() {
    if (!customer) return;
    try {
      await del.mutateAsync(customer.id);
      onClose();
      onDeleted?.();
    } catch (err) {
      setFormError(errorMessage(err));
      setConfirmDelete(false);
    }
  }

  const formId = 'customer-form';
  return (
    <>
      <Dialog
        open={open && !confirmDelete}
        title={customer ? 'Edit customer' : 'Add customer'}
        onClose={onClose}
        footer={
          <>
            {customer && (
              <Button variant="ghost" className="text-danger hover:bg-danger-soft" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <div className="grow" />
            <Button onClick={onClose} className="max-md:h-11 max-md:grow">
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" disabled={save.isPending} className="max-md:h-11 max-md:grow">
              {save.isPending ? 'Saving…' : customer ? 'Save changes' : 'Add customer'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {formError && (
            <p role="alert" className="sm:col-span-2 rounded-sm bg-danger-soft text-danger text-sm px-3 py-2">
              {formError}
            </p>
          )}
          <Field label="Name" error={errors.name} className="sm:col-span-2">
            {(a) => <TextInput {...a} value={form.name} onChange={(e) => set('name')(e.target.value)} autoComplete="off" placeholder="e.g. Tan Wei Ming" />}
          </Field>
          <Field label="Customer type">
            {(a) => (
              <Select {...a} value={form.customerType} onChange={(e) => set('customerType')(e.target.value as FormState['customerType'])}>
                <option value="individual">Individual</option>
                <option value="business">Business</option>
              </Select>
            )}
          </Field>
          <Field label="Company" error={errors.company}>
            {(a) => <TextInput {...a} value={form.company} onChange={(e) => set('company')(e.target.value)} placeholder="Optional" />}
          </Field>
          <Field label="Mobile" error={errors.phone} hint="8 digits, e.g. 9123 4567">
            {(a) => <TextInput {...a} type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="+65 9123 4567" />}
          </Field>
          <Field label="Email" error={errors.email}>
            {(a) => <TextInput {...a} type="email" inputMode="email" value={form.email} onChange={(e) => set('email')(e.target.value)} placeholder="Optional" />}
          </Field>
          <Field label="Address" error={errors.address} className="sm:col-span-2">
            {(a) => <TextInput {...a} value={form.address} onChange={(e) => set('address')(e.target.value)} placeholder="Blk 123 Ang Mo Kio Ave 3, #05-67" />}
          </Field>
          <Field label="Postal code" error={errors.postalCode}>
            {(a) => <TextInput {...a} inputMode="numeric" maxLength={6} value={form.postalCode} onChange={(e) => set('postalCode')(e.target.value.replace(/\D/g, ''))} placeholder="560123" />}
          </Field>
          <Field label="Status">
            {(a) => (
              <Select {...a} value={form.status} onChange={(e) => set('status')(e.target.value as CustomerStatus)}>
                <option value="active">Active</option>
                <option value="lead">Lead</option>
                <option value="inactive">Inactive</option>
              </Select>
            )}
          </Field>
          <Field label="Preferred contact">
            {(a) => (
              <Select {...a} value={form.preferredContact} onChange={(e) => set('preferredContact')(e.target.value as FormState['preferredContact'])}>
                <option value="whatsapp">WhatsApp</option>
                <option value="phone">Phone call</option>
                <option value="email">Email</option>
              </Select>
            )}
          </Field>
          <Field label="Tags" error={errors.tags} hint="Separate with commas">
            {(a) => <TextInput {...a} value={form.tags} onChange={(e) => set('tags')(e.target.value)} placeholder="Renovation, HDB" />}
          </Field>
          <Field label="Notes" error={errors.notes} className="sm:col-span-2">
            {(a) => <TextArea {...a} rows={4} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />}
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={open && confirmDelete}
        size="sm"
        title="Delete customer?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <div className="grow" />
            <Button onClick={() => setConfirmDelete(false)} className="max-md:h-11 max-md:grow">
              Keep customer
            </Button>
            <Button variant="danger" onClick={remove} disabled={del.isPending} className="max-md:h-11 max-md:grow">
              {del.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-ink-2 leading-relaxed">
          <strong className="font-semibold">{customer?.name}</strong> and their details will be removed for everyone in this business. This cannot be undone.
        </p>
      </Dialog>
    </>
  );
}
