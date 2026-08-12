begin;

create index if not exists studio_episodes_created_by_idx on public.studio_episodes(created_by);
create index if not exists studio_runs_episode_id_idx on public.studio_runs(episode_id);
create index if not exists studio_cues_asset_id_idx on public.studio_cues(asset_id);
create index if not exists studio_sessions_episode_id_idx on public.studio_sessions(episode_id);
create index if not exists studio_sessions_active_run_id_idx on public.studio_sessions(active_run_id);
create index if not exists studio_production_events_actor_id_idx on public.studio_production_events(actor_id);
create index if not exists studio_production_events_cue_id_idx on public.studio_production_events(cue_id);
create index if not exists studio_clip_markers_session_id_idx on public.studio_clip_markers(session_id);
create index if not exists studio_clip_markers_created_by_idx on public.studio_clip_markers(created_by);
create index if not exists studio_episode_recommendations_created_by_idx on public.studio_episode_recommendations(created_by);
create index if not exists live_questions_user_id_idx on public.live_questions(user_id);
create index if not exists live_question_votes_user_id_idx on public.live_question_votes(user_id);
create index if not exists live_polls_created_by_idx on public.live_polls(created_by);
create index if not exists live_poll_options_poll_id_idx on public.live_poll_options(poll_id);
create index if not exists live_poll_responses_option_id_idx on public.live_poll_responses(option_id);
create index if not exists live_poll_responses_user_id_idx on public.live_poll_responses(user_id);

alter policy "admins manage studio episodes" on public.studio_episodes using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage studio episode pathways" on public.studio_episode_pathways using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage studio assets" on public.studio_assets using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage studio runs" on public.studio_runs using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage studio cues" on public.studio_cues using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage studio cue actions" on public.studio_cue_actions using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage studio sessions" on public.studio_sessions using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage studio state" on public.studio_session_state using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage studio events" on public.studio_production_events using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage studio markers" on public.studio_clip_markers using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage recommendations" on public.studio_episode_recommendations using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
alter policy "admins manage question clusters" on public.studio_question_clusters using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "users read own entitlements" on public.user_entitlements;
drop policy if exists "admins manage entitlements" on public.user_entitlements;
create policy "read own or admin entitlements" on public.user_entitlements for select to authenticated using ((select auth.uid()) = user_id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins insert entitlements" on public.user_entitlements for insert to authenticated with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins update entitlements" on public.user_entitlements for update to authenticated using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins delete entitlements" on public.user_entitlements for delete to authenticated using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "users submit own live questions" on public.live_questions;
drop policy if exists "users read own live questions" on public.live_questions;
drop policy if exists "admins manage live questions" on public.live_questions;
create policy "read own or admin live questions" on public.live_questions for select to authenticated using ((select auth.uid()) = user_id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "submit own or admin live questions" on public.live_questions for insert to authenticated with check ((select auth.uid()) = user_id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins update live questions" on public.live_questions for update to authenticated using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins delete live questions" on public.live_questions for delete to authenticated using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "users manage own question votes" on public.live_question_votes;
drop policy if exists "admins read all question votes" on public.live_question_votes;
create policy "read own or admin question votes" on public.live_question_votes for select to authenticated using ((select auth.uid()) = user_id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "insert own question vote" on public.live_question_votes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "delete own question vote" on public.live_question_votes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "authenticated read active polls" on public.live_polls;
drop policy if exists "admins manage polls" on public.live_polls;
create policy "read active or admin polls" on public.live_polls for select to authenticated using (status in ('scheduled','open','closed') or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins insert polls" on public.live_polls for insert to authenticated with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins update polls" on public.live_polls for update to authenticated using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins delete polls" on public.live_polls for delete to authenticated using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "authenticated read poll options" on public.live_poll_options;
drop policy if exists "admins manage poll options" on public.live_poll_options;
create policy "authenticated read poll options" on public.live_poll_options for select to authenticated using (true);
create policy "admins insert poll options" on public.live_poll_options for insert to authenticated with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins update poll options" on public.live_poll_options for update to authenticated using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin') with check (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins delete poll options" on public.live_poll_options for delete to authenticated using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "users manage own poll response" on public.live_poll_responses;
drop policy if exists "admins read all poll responses" on public.live_poll_responses;
create policy "read own or admin poll responses" on public.live_poll_responses for select to authenticated using ((select auth.uid()) = user_id or ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');
create policy "insert own poll response" on public.live_poll_responses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own poll response" on public.live_poll_responses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own poll response" on public.live_poll_responses for delete to authenticated using ((select auth.uid()) = user_id);

commit;
