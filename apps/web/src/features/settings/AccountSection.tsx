import { useState, type FormEvent } from 'react';
import { passwordChangeSchema, roleLabel } from '@mybusiness/shared';
import { Field, TextInput } from '../../components/form';
import { Badge, Button, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useChangePassword, useUpdateName } from './api';
import { SectionCard } from './BusinessSections';

export function AccountSection() {
  const { user } = useSession();
  const updateName = useUpdateName();
  const changePw = useChangePassword();
  const [name, setName] = useState(user.name);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setNameMsg({ ok: false, text: 'Enter your name.' });
    try {
      await updateName.mutateAsync(name.trim());
      setNameMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      setNameMsg({ ok: false, text: errorMessage(err) });
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    const check = passwordChangeSchema.safeParse(pw);
    if (!check.success) {
      const fe: Record<string, string> = {};
      for (const i of check.error.issues) fe[String(i.path[0])] ??= i.message;
      return setPwErrors(fe);
    }
    try {
      await changePw.mutateAsync(pw);
      setPw({ currentPassword: '', newPassword: '' });
      setPwErrors({});
      setPwMsg({ ok: true, text: 'Password changed. You’ve been signed out on your other devices.' });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setPwErrors(err.fields);
      else setPwMsg({ ok: false, text: errorMessage(err) });
    }
  }

  const msg = (m: { ok: boolean; text: string } | null) =>
    m && (
      <span role={m.ok ? 'status' : 'alert'} className={cx('text-sm grow', m.ok ? 'text-success' : 'text-danger')}>
        {m.text}
      </span>
    );

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={saveName} noValidate>
        <SectionCard
          title="Your account"
          footer={
            <>
              {msg(nameMsg)}
              <Button type="submit" variant="primary" disabled={updateName.isPending || name.trim() === user.name} className="max-md:h-11 max-md:grow">
                {updateName.isPending ? 'Saving…' : 'Save name'}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Your name">
              {(a) => <TextInput {...a} autoComplete="name" value={name} onChange={(e) => (setName(e.target.value), setNameMsg(null))} />}
            </Field>
            <Field label="Email" hint="You sign in with this email">
              {(a) => <TextInput {...a} value={user.email} disabled />}
            </Field>
          </div>
          <div className="flex items-center gap-2 text-sm text-ink-3">
            Your role here: <Badge tone="teal">{roleLabel[user.role]}</Badge>
          </div>
        </SectionCard>
      </form>
      <form onSubmit={savePassword} noValidate>
        <SectionCard
          title="Change password"
          footer={
            <>
              {msg(pwMsg)}
              <Button type="submit" variant="primary" disabled={changePw.isPending} className="max-md:h-11 max-md:grow">
                {changePw.isPending ? 'Saving…' : 'Change password'}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Current password" error={pwErrors.currentPassword}>
              {(a) => (
                <TextInput {...a} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />
              )}
            </Field>
            <Field label="New password" error={pwErrors.newPassword} hint="At least 10 characters">
              {(a) => <TextInput {...a} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} />}
            </Field>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
