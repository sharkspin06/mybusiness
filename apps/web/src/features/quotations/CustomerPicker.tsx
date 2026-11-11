import { useEffect, useState } from 'react';
import { formatPhoneSG, type Customer } from '@mybusiness/shared';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Avatar, Button } from '../../components/ui';
import { useCustomers } from '../customers/api';
import { CustomerFormDialog } from '../customers/CustomerFormDialog';

export interface PickedCustomer {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  address?: string | null;
  postalCode?: string | null;
}

/** Search and choose a customer, or add a new one without leaving the quotation. */
export function CustomerPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: PickedCustomer) => void }) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);
  const { data, isLoading } = useCustomers({ q: q || undefined, page: 1 });

  const pick = (c: Customer) => {
    onPick({ id: c.id, name: c.name, company: c.company, phone: c.phone, address: c.address, postalCode: c.postalCode });
    onClose();
  };

  return (
    <>
      <Dialog
        open={open && !adding}
        title="Choose customer"
        onClose={onClose}
        size="sm"
        footer={
          <Button onClick={() => setAdding(true)} className="max-md:h-11 max-md:grow">
            <Icon name="plus" />
            Add new customer
          </Button>
        }
      >
        <label className="relative block mb-3">
          <span className="sr-only">Search customers</span>
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
            <Icon name="search" />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, phone or company"
            className="w-full h-11 md:h-10 pl-10 pr-3 rounded-sm border border-line-strong placeholder:text-ink-3 focus:border-accent"
          />
        </label>
        {isLoading ? (
          <p className="text-ink-3 py-4">Loading…</p>
        ) : data?.items.length ? (
          <ul className="-mx-2">
            {data.items.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => pick(c)} className="w-full flex items-center gap-3 min-h-14 px-2 py-2 rounded-md text-left hover:bg-surface-1 cursor-pointer">
                  <Avatar name={c.name} />
                  <span className="min-w-0 flex flex-col">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-[14px] text-ink-3 truncate">{[c.phone ? formatPhoneSG(c.phone) : null, c.company].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-3 py-4">No customers found. Add a new one below.</p>
        )}
      </Dialog>
      <CustomerFormDialog
        open={open && adding}
        onClose={() => setAdding(false)}
        onSaved={(c) => {
          setAdding(false);
          pick(c);
        }}
      />
    </>
  );
}
