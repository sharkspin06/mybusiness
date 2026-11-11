import { useState, type FormEvent } from 'react';
import { ROLES, formatDate, formatTime, inviteSchema, roleHelp, roleLabel, type Role, type TeamMember } from '@mybusiness/shared';
import { Dialog } from '../../components/Dialog';
import { Field, Select, TextInput } from '../../components/form';
import { Icon } from '../../components/Icon';
import { Avatar, Badge, Button, Card, cx, type BadgeTone } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useCancelInvite, useChangeRole, useInvite, useRemoveMember, useResetLink, useTeam } from './api';
import { SectionCard } from './BusinessSections';
import { ShareLink } from './ShareLink';

const roleTone: Record<Role, BadgeTone> = { owner: 'teal', admin: 'blue', staff: 'grey' };

const lastActive = (iso: string | null) => (iso ? `${formatDate(new Date(iso))} ${formatTime(new Date(iso))}` : 'Never');

export function TeamSection() {
  const { user, business } = useSession();
  const { data, isLoading, isError, error } = useTeam();
  const canManage = user.role === 'owner' || user.role === 'admin';
  const changeRole = useChangeRole();
  const cancelInvite = useCancelInvite();
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [resetFor, setResetFor] = useState<TeamMember | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // What I may do to someone: admins can't change owners; nobody resets their own password here.
  const mayManage = (m: TeamMember) => canManage && (user.role === 'owner' || m.role !== 'owner');
  const roleOptions = user.role === 'owner' ? ROLES : ROLES.filter((r) => r !== 'owner');

  const onRole = (m: TeamMember, role: Role) => {
    setActionError(null);
    changeRole.mutate({ userId: m.id, role }, { onError: (e) => setActionError(errorMessage(e)) });
  };

  if (isLoading) return <Card className="p-6 text-ink-3">Loading team…</Card>;
  if (isError || !data) return <Card className="p-6 text-danger">{errorMessage(error)}</Card>;

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Users & permissions"
        subtitle={`${data.members.length} ${data.members.length === 1 ? 'person' : 'people'} in ${business.name}.`}
      >
        {canManage && (
          <div className="flex justify-end -mt-12 max-md:mt-0 max-md:justify-start">
            <Button variant="primary" size="sm" onClick={() => setInviting(true)} className="max-md:h-11 max-md:w-full">
              <Icon name="plus" size={16} />
              Invite someone
            </Button>
          </div>
        )}
        {actionError && (
          <p role="alert" className="rounded-sm bg-danger-soft text-danger text-sm px-3 py-2">
            {actionError}
          </p>
        )}
        <div className="flex flex-col -mx-4 md:mx-0 md:border md:border-line md:rounded-md overflow-hidden">
          {data.members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-line-soft last:border-0">
              <Avatar name={m.name} />
              <span className="grow min-w-0 flex flex-col gap-0.5 basis-48">
                <span className="text-sm font-medium truncate">
                  {m.name}
                  {m.isYou && <span className="text-ink-3 font-normal"> (you)</span>}
                </span>
                <span className="text-[14px] text-ink-3 truncate">
                  {m.email} · Last active {lastActive(m.lastActiveAt)}
                </span>
              </span>
              {mayManage(m) ? (
                <Select
                  aria-label={`Role for ${m.name}`}
                  value={m.role}
                  onChange={(e) => onRole(m, e.target.value as Role)}
                  disabled={changeRole.isPending}
                  className="w-32 md:h-8"
                >
                  {(m.role === 'owner' ? ROLES : roleOptions).map((r) => (
                    <option key={r} value={r}>
                      {roleLabel[r]}
                    </option>
                  ))}
                </Select>
              ) : (
                <Badge tone={roleTone[m.role]}>{roleLabel[m.role]}</Badge>
              )}
              {mayManage(m) && !m.isYou && (
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setResetFor(m)} className="max-md:h-11">
                    Password link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(m)} className="max-md:h-11 text-danger hover:bg-danger-soft">
                    Remove
                  </Button>
                </span>
              )}
            </div>
          ))}
        </div>

        {canManage && data.invites.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wide">Waiting to join</h3>
            {data.invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-md bg-surface-1 text-sm">
                <span className="grow min-w-0 truncate">
                  {i.email} <span className="text-ink-3">· {roleLabel[i.role]} · link expires {formatDate(new Date(i.expiresAt))}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => cancelInvite.mutate(i.id)} disabled={cancelInvite.isPending} className="max-md:h-11">
                  Cancel invite
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="What each role can do">
        <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm m-0">
          {ROLES.map((r) => (
            <div key={r} className="contents">
              <dt>
                <Badge tone={roleTone[r]}>{roleLabel[r]}</Badge>
              </dt>
              <dd className="m-0 text-ink-2">{roleHelp[r]}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} roles={roleOptions} businessName={business.name} />
      <RemoveDialog member={removing} onClose={() => setRemoving(null)} businessName={business.name} />
      <ResetDialog member={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}

function InviteDialog({ open, onClose, roles, businessName }: { open: boolean; onClose: () => void; roles: readonly Role[]; businessName: string }) {
  const invite = useInvite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [link, setLink] = useState<string | null>(null);
  const close = () => {
    setEmail('');
    setRole('staff');
    setErrors({});
    setLink(null);
    invite.reset();
    onClose();
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = inviteSchema.safeParse({ email, role });
    if (!check.success) return setErrors({ email: check.error.issues[0]!.message });
    try {
      const r = await invite.mutateAsync(check.data);
      setLink(r.link);
    } catch (err) {
      setErrors(err instanceof ApiError && Object.keys(err.fields).length ? err.fields : { email: errorMessage(err) });
    }
  }
  return (
    <Dialog
      open={open}
      size="sm"
      title={link ? 'Send this invite link' : 'Invite someone'}
      onClose={close}
      footer={
        link ? (
          <Button onClick={close} className="ml-auto max-md:h-11 max-md:grow">
            Done
          </Button>
        ) : (
          <>
            <div className="grow" />
            <Button onClick={close} className="max-md:h-11 max-md:grow">
              Cancel
            </Button>
            <Button type="submit" form="invite-form" variant="primary" disabled={invite.isPending} className="max-md:h-11 max-md:grow">
              {invite.isPending ? 'Creating…' : 'Create invite link'}
            </Button>
          </>
        )
      }
    >
      {link ? (
        <ShareLink
          link={link}
          message={`You're invited to join ${businessName} on My Business. Open this link to set up your account:`}
          note={`Send it to ${email} yourself. It works once and expires in 7 days. If you create a new link for the same email, this one stops working.`}
        />
      ) : (
        <form id="invite-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Their email" error={errors.email} hint="They’ll sign in with this email">
            {(a) => <TextInput {...a} type="email" inputMode="email" autoFocus value={email} onChange={(e) => (setEmail(e.target.value), setErrors({}))} />}
          </Field>
          <Field label="Role" error={errors.role} hint={roleHelp[role]}>
            {(a) => (
              <Select {...a} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </form>
      )}
    </Dialog>
  );
}

function RemoveDialog({ member, onClose, businessName }: { member: TeamMember | null; onClose: () => void; businessName: string }) {
  const remove = useRemoveMember();
  const go = () => member && remove.mutate(member.id, { onSuccess: onClose });
  return (
    <Dialog
      open={!!member}
      size="sm"
      title="Remove from team?"
      onClose={() => (remove.reset(), onClose())}
      footer={
        <>
          <div className="grow" />
          <Button onClick={onClose} className="max-md:h-11 max-md:grow">
            Keep
          </Button>
          <Button variant="danger" onClick={go} disabled={remove.isPending} className="max-md:h-11 max-md:grow">
            {remove.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-ink-2 leading-relaxed">
        <p>
          <strong className="font-semibold">{member?.name}</strong> will lose access to {businessName} straight away. Their tasks and appointments become unassigned. Their account
          isn’t deleted.
        </p>
        {remove.isError && <p className="text-danger text-sm">{errorMessage(remove.error)}</p>}
      </div>
    </Dialog>
  );
}

function ResetDialog({ member, onClose }: { member: TeamMember | null; onClose: () => void }) {
  const reset = useResetLink();
  const [link, setLink] = useState<string | null>(null);
  const close = () => {
    setLink(null);
    reset.reset();
    onClose();
  };
  return (
    <Dialog
      open={!!member}
      size="sm"
      title="Password link"
      onClose={close}
      footer={
        link || reset.isError ? (
          <Button onClick={close} className="ml-auto max-md:h-11 max-md:grow">
            Done
          </Button>
        ) : (
          <>
            <div className="grow" />
            <Button onClick={close} className="max-md:h-11 max-md:grow">
              Cancel
            </Button>
            <Button variant="primary" disabled={reset.isPending} onClick={() => member && reset.mutate(member.id, { onSuccess: (r) => setLink(r.link) })} className="max-md:h-11 max-md:grow">
              {reset.isPending ? 'Creating…' : 'Create link'}
            </Button>
          </>
        )
      }
    >
      {link ? (
        <ShareLink
          link={link}
          message={`Here's your link to set a new password for My Business:`}
          note={`Send it to ${member?.name} only. It works once, expires in 24 hours, and signs them out of other devices when used.`}
        />
      ) : reset.isError ? (
        <p className="text-danger text-sm">{errorMessage(reset.error)}</p>
      ) : (
        <p className={cx('text-ink-2 leading-relaxed')}>
          For when <strong className="font-semibold">{member?.name}</strong> forgets their password. You’ll get a one-time link to send them; they open it and choose a new
          password.
        </p>
      )}
    </Dialog>
  );
}
