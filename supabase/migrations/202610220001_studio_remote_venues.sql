-- A remote venue is a specifically invited location, never an ordinary guest.
-- Existing invitations remain guest-only. Revoke venue links through the guest invitation controls.
alter table public.studio_episode_guests
  add column if not exists is_remote_venue boolean not null default false;
comment on column public.studio_episode_guests.is_remote_venue is
  'Only explicit remote venue invites may access the read-only program output.';

-- The service-role-only invitation tables already own token hashes, expiry and revocation.
