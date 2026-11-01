begin;
create index if not exists studio_episode_guests_person_id_idx on public.studio_episode_guests(person_id);
create index if not exists studio_guest_invites_episode_id_idx on public.studio_guest_invites(episode_id);
create index if not exists studio_guest_messages_sender_user_id_idx on public.studio_guest_messages(sender_user_id);

drop policy if exists "admins manage studio people" on public.studio_people;
create policy "admins manage studio people" on public.studio_people for all to authenticated using (((select auth.jwt())->'app_metadata'->>'role')='admin') with check (((select auth.jwt())->'app_metadata'->>'role')='admin');
drop policy if exists "admins manage studio guests" on public.studio_episode_guests;
create policy "admins manage studio guests" on public.studio_episode_guests for all to authenticated using (((select auth.jwt())->'app_metadata'->>'role')='admin') with check (((select auth.jwt())->'app_metadata'->>'role')='admin');
drop policy if exists "admins manage guest invites" on public.studio_guest_invites;
create policy "admins manage guest invites" on public.studio_guest_invites for all to authenticated using (((select auth.jwt())->'app_metadata'->>'role')='admin') with check (((select auth.jwt())->'app_metadata'->>'role')='admin');
drop policy if exists "admins manage guest messages" on public.studio_guest_messages;
create policy "admins manage guest messages" on public.studio_guest_messages for all to authenticated using (((select auth.jwt())->'app_metadata'->>'role')='admin') with check (((select auth.jwt())->'app_metadata'->>'role')='admin');
drop policy if exists "admins manage auto director" on public.studio_auto_director_settings;
create policy "admins manage auto director" on public.studio_auto_director_settings for all to authenticated using (((select auth.jwt())->'app_metadata'->>'role')='admin') with check (((select auth.jwt())->'app_metadata'->>'role')='admin');
commit;
