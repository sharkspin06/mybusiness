import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PASSWORD_MIN, roleLabel, type InviteInfo, type Me } from '@mybusiness/shared';
import { Field, TextInput } from '../../components/form';
import { Button } from '../../components/ui';
import { ApiError, api, errorMessage } from '../../lib/api';
import { ME_KEY } from '../../lib/session';
import { AuthFrame, FormError, PasswordInput } from './AuthPages';

function BadLink() {
  return (
    <AuthFrame title="This link doesn’t work" subtitle="It may have expired or already been used." footer={<Link to="/login" className="font-medium text-accent">Go to sign in</Link>}>
      <p className="text-sm text-ink-2">Ask the person who sent it for a new link.</p>
    </AuthFrame>
  );
}

function useSignedIn() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (me: Me | undefined) => {
    qc.clear();
    if (me) qc.setQueryData(ME_KEY, me);
    navigate(me ? '/' : '/login', { replace: true });
  };
}

/** /invite/:token — join a business. New people create their account; existing accounts confirm with their password. */
export function InvitePage() {
  const { token = '' } = useParams();
  const info = useQuery({ queryKey: ['invite', token], queryFn: () => api<InviteInfo>(`/auth/invite/${token}`), retry: false });
  const done = useSignedIn();
  const accept = useMutation({
    mutationFn: (v: { name?: string; password: string }) => api<Me>(`/auth/invite/${token}/accept`, { method: 'POST', json: v }),
    onSuccess: done,
  });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (info.isLoading) return <AuthFrame title="Checking your invite…" subtitle="" footer={null}>{null}</AuthFrame>;
  if (info.isError || !info.data) return <BadLink />;
  const inv = info.data;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const fe: Record<string, string> = {};
    if (!inv.accountExists && !name.trim()) fe.name = 'Enter your name';
    if (!password) fe.password = 'Enter a password';
    else if (!inv.accountExists && password.length < PASSWORD_MIN) fe.password = `Use at least ${PASSWORD_MIN} characters`;
    if (Object.keys(fe).length) return setErrors(fe);
    setErrors({});
    try {
      await accept.mutateAsync(inv.accountExists ? { password } : { name: name.trim(), password });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(errorMessage(err));
    }
  }

  return (
    <AuthFrame
      title={`Join ${inv.businessName}`}
      subtitle={`You’ve been invited as ${roleLabel[inv.role].toLowerCase()}. ${inv.accountExists ? 'Enter your password to add this business to your account.' : 'Set up your account to get started.'}`}
      footer={inv.accountExists ? 'Forgot your password? Ask the person who invited you.' : null}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormError text={formError} />
        <Field label="Email">
          {(a) => <TextInput {...a} value={inv.email} disabled />}
        </Field>
        {!inv.accountExists && (
          <Field label="Your name" error={errors.name}>
            {(a) => <TextInput {...a} autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
        )}
        <Field label={inv.accountExists ? 'Your password' : 'Choose a password'} error={errors.password} hint={inv.accountExists ? undefined : `At least ${PASSWORD_MIN} characters`}>
          {(a) => <PasswordInput {...a} value={password} onChange={setPassword} autoComplete={inv.accountExists ? 'current-password' : 'new-password'} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={accept.isPending} className="w-full mt-1">
          {accept.isPending ? 'Joining…' : `Join ${inv.businessName}`}
        </Button>
      </form>
    </AuthFrame>
  );
}

/** /reset/:token — choose a new password from a link an owner or admin made. */
export function ResetPage() {
  const { token = '' } = useParams();
  const info = useQuery({ queryKey: ['reset', token], queryFn: () => api<{ email: string }>(`/auth/reset/${token}`), retry: false });
  const done = useSignedIn();
  const reset = useMutation({
    mutationFn: (password: string) => api<Me | undefined>(`/auth/reset/${token}`, { method: 'POST', json: { password } }),
    onSuccess: done,
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (info.isLoading) return <AuthFrame title="Checking your link…" subtitle="" footer={null}>{null}</AuthFrame>;
  if (info.isError || !info.data) return <BadLink />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters`);
    setError(null);
    try {
      await reset.mutateAsync(password);
    } catch (err) {
      setError(err instanceof ApiError && err.fields.password ? err.fields.password : errorMessage(err));
    }
  }

  return (
    <AuthFrame title="Choose a new password" subtitle={`For ${info.data.email}. You’ll be signed out on other devices.`} footer={<Link to="/login" className="font-medium text-accent">Back to sign in</Link>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="New password" error={error ?? undefined} hint={`At least ${PASSWORD_MIN} characters`}>
          {(a) => <PasswordInput {...a} value={password} onChange={setPassword} autoComplete="new-password" />}
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={reset.isPending} className="w-full mt-1">
          {reset.isPending ? 'Saving…' : 'Save password and sign in'}
        </Button>
      </form>
    </AuthFrame>
  );
}
