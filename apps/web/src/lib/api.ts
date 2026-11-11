/** Error from the API. `fields` holds per-field messages for form validation errors. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public fields: Record<string, string> = {},
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/')) {
    // Session expired or signed out in another tab: go to sign-in and come back here afterwards.
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'error', body.fields ?? {});
  return body as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Cannot reach the server. Check your connection and try again.';
    if (err.code === 'invalid_credentials') return 'Email or password is incorrect.';
    if (err.code === 'too_many_attempts') return 'Too many attempts. Please wait 15 minutes and try again.';
    if (err.code === 'email_taken') return 'This email already has an account. Sign in instead.';
    if (err.code === 'invalid_link') return 'This link has expired or has already been used. Ask for a new one.';
    if (err.code === 'last_owner') return 'A business needs at least one owner. Make someone else an owner first.';
    if (err.code === 'already_member') return 'This person is already in the team.';
    if (err.code === 'other_businesses') return 'This person also works in another business, so they need to change their password themselves (Settings › Your account).';
    if (err.code === 'use_account_page') return 'To change your own password, use Settings › Your account.';
    if (err.status === 404) return 'This item no longer exists.';
    if (err.status === 403) return 'You do not have permission to do this.';
    if (err.code === 'validation') return 'Please fix the highlighted fields.';
    if (err.code === 'has_quotations') return 'This customer has quotations, so they can’t be deleted. Set their status to Inactive instead.';
    if (err.code === 'locked') return 'Accepted quotations can’t be changed. Move it back to Sent first.';
    if (err.code === 'invalid_status') return 'That status change isn’t allowed.';
    if (err.code === 'not_draft') return 'Only drafts can be deleted.';
  }
  return 'Something went wrong. Please try again.';
}
