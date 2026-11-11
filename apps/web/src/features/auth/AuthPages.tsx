import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { PASSWORD_MIN, loginSchema, signupSchema } from '@mybusiness/shared';
import { Field, TextInput } from '../../components/form';
import { Button, Card, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useLogin, useMe, useSignup } from '../../lib/session';

/** Only allow returning to a path inside this app (never an outside address). */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') && !next.startsWith('/signup') ? next : '/';
}

export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <span className="size-9 rounded-[9px] bg-accent text-white text-sm font-bold flex items-center justify-center">MB</span>
          <span className="text-lg font-semibold">My Business</span>
        </div>
        <Card className="p-6 md:p-8 flex flex-col gap-5">
          <div>
            <h1 className="text-2xl leading-8 font-semibold">{title}</h1>
            <p className="text-[14px] text-ink-3 mt-1">{subtitle}</p>
          </div>
          {children}
        </Card>
        <p className="text-center text-sm text-ink-3">{footer}</p>
      </div>
    </div>
  );
}

export function PasswordInput({ value, onChange, autoComplete, ...a }: { value: string; onChange: (v: string) => void; autoComplete: string; id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput {...a} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className="pr-16" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        className="absolute right-1 top-1/2 -translate-y-1/2 h-9 md:h-7 px-2.5 rounded-sm text-[14px] font-medium text-accent hover:bg-accent-soft cursor-pointer"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export function FormError({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="rounded-sm bg-danger-soft text-danger text-sm px-3 py-2">
      {text}
    </p>
  ) : null;
}

const fieldErrors = (issues: { path: PropertyKey[]; message: string }[]) => {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] ??= i.message;
  return out;
};

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.4 26.8 36 24 36c-5.3 0-9.8-3.3-11.4-8l-6.5 5C9.6 39.5 16.3 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1 2.9-3 5.3-5.6 6.9l6.3 5.3C39.9 37.7 44 31.6 44 24c0-1.3-.1-2.7-.4-3.5z" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
    <rect x="1" y="1" width="10" height="10" fill="#f35325" />
    <rect x="12" y="1" width="10" height="10" fill="#81bc06" />
    <rect x="1" y="12" width="10" height="10" fill="#05a6f0" />
    <rect x="12" y="12" width="10" height="10" fill="#ffba08" />
  </svg>
);

const AppleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.468 2.14-1.17 2.9-.76.82-2.01 1.47-3.02 1.39-.12-1.11.45-2.27 1.17-3.02.78-.82 2.14-1.43 3.02-1.27zm4.14 16.5c-.5 1.16-.74 1.68-1.39 2.72-.9 1.44-2.17 3.24-3.75 3.26-1.4.02-1.76-.91-3.66-.9-1.9.01-2.3.92-3.7.9-1.58-.02-2.78-1.63-3.68-3.07C1.37 17.84.3 13.53 1.75 10.6c.73-1.47 2.04-2.4 3.46-2.42 1.37-.02 2.66.92 3.5.92.83 0 2.4-1.14 4.05-.97.69.03 2.63.28 3.88 2.1-.1.06-2.32 1.35-2.3 4.04.03 3.21 2.81 4.28 2.84 4.3z" />
  </svg>
);

function SsoButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Not available yet"
      className="w-full h-11 inline-flex items-center justify-center gap-2.5 rounded-md border border-line-strong bg-bg text-sm font-medium text-ink hover:bg-surface-1 cursor-not-allowed opacity-80"
    >
      {icon}
      {label}
    </button>
  );
}

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get('next'));
  const me = useMe();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (me.data) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const check = loginSchema.safeParse({ email, password });
    if (!check.success) return setErrors(fieldErrors(check.error.issues));
    setErrors({});
    try {
      await login.mutateAsync(check.data);
      navigate(next, { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  return (
    <div className="min-h-dvh bg-surface-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="size-11 rounded-xl bg-accent text-white text-base font-bold flex items-center justify-center">MB</span>
          <h1 className="text-2xl font-semibold">Welcome back</h1>
        </div>

        <div className="flex flex-col gap-2.5">
          <SsoButton icon={<GoogleIcon />} label="Google" />
          <SsoButton icon={<MicrosoftIcon />} label="Microsoft" />
          <SsoButton icon={<AppleIcon />} label="Apple" />
        </div>

        <div className="h-px bg-line" />

        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <FormError text={formError} />
          <Field label="Email" error={errors.email}>
            {(a) => <TextInput {...a} type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <Field label="Password" error={errors.password}>
            {(a) => <PasswordInput {...a} value={password} onChange={setPassword} autoComplete="current-password" />}
          </Field>
          <Button type="submit" variant="primary" size="lg" disabled={login.isPending} className="w-full mt-1">
            {login.isPending ? 'Signing in…' : 'Continue with email'}
          </Button>
        </form>

        <p className="text-center text-sm text-ink-3">
          New here?{' '}
          <Link to="/signup" className="font-medium text-accent">
            Create a business account
          </Link>
        </p>
      </div>
    </div>
  );
}

export function SignupPage() {
  const navigate = useNavigate();
  const me = useMe();
  const signup = useSignup();
  const [form, setForm] = useState({ name: '', businessName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(({ [k]: _d, ...rest }) => rest);
  };

  if (me.data) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const check = signupSchema.safeParse(form);
    if (!check.success) return setErrors(fieldErrors(check.error.issues));
    setErrors({});
    try {
      await signup.mutateAsync(check.data);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      setFormError(errorMessage(err));
    }
  }

  return (
    <AuthFrame
      title="Create your business account"
      subtitle="Set up your workspace. You'll be its owner and can invite your team later."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormError text={formError} />
        <Field label="Your name" error={errors.name}>
          {(a) => <TextInput {...a} autoComplete="name" autoFocus value={form.name} onChange={(e) => set('name')(e.target.value)} />}
        </Field>
        <Field label="Business name" error={errors.businessName} hint="As it should appear on your quotations">
          {(a) => <TextInput {...a} autoComplete="organization" value={form.businessName} onChange={(e) => set('businessName')(e.target.value)} placeholder="e.g. Brightway Services Pte Ltd" />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(a) => <TextInput {...a} type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />}
        </Field>
        <Field label="Password" error={errors.password} hint={`At least ${PASSWORD_MIN} characters`}>
          {(a) => <PasswordInput {...a} value={form.password} onChange={set('password')} autoComplete="new-password" />}
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={signup.isPending} className={cx('w-full mt-1')}>
          {signup.isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthFrame>
  );
}
