begin;

drop function if exists public.grokbot_save_plan(uuid, uuid, integer, text, text, text, jsonb, jsonb);
drop table if exists public.grokbot_session_assets;
drop table if exists public.grokbot_scratch;
drop table if exists public.grokbot_plan_revisions;
drop table if exists public.grokbot_plan_slots;
drop table if exists public.grokbot_plans;
drop table if exists public.grokbot_runs;
drop table if exists public.grokbot_sessions;

commit;
