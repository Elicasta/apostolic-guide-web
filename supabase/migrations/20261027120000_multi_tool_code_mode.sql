begin;
create table if not exists public.studio_code_mode_checkpoints(
 id uuid primary key default gen_random_uuid(),tool text not null,source_id text not null,
 actor_user_id uuid not null references auth.users(id),document jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists studio_code_mode_checkpoints_lookup on public.studio_code_mode_checkpoints(tool,source_id,created_at desc);
create table if not exists public.studio_teleprompter_code_drafts (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 title text not null,script_text text not null,notes text not null default '',
 updated_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create index if not exists studio_teleprompter_code_owner on public.studio_teleprompter_code_drafts(owner_id,updated_at desc);
alter table public.studio_code_mode_checkpoints enable row level security;
alter table public.studio_teleprompter_code_drafts enable row level security;
revoke all on public.studio_code_mode_checkpoints,public.studio_teleprompter_code_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.studio_code_mode_checkpoints,public.studio_teleprompter_code_drafts to service_role;

-- Atomic Content Engine draft editing, synchronized with its Creative Project.
create or replace function public.apply_code_editorial_pack(
 p_date date,p_title text,p_caption text,p_art_direction text,p_frames jsonb,
 p_newsletter jsonb,p_expected_version integer,p_actor uuid
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_pack public.studio_editorial_packs%rowtype;v_project public.studio_creative_projects%rowtype;
begin
 select * into v_pack from public.studio_editorial_packs where production_date=p_date for update;
 if not found then raise exception 'Content Engine pack not found';end if;
 select * into v_project from public.studio_creative_projects where id=v_pack.project_id for update;
 if not found or v_project.status<>'draft' or v_project.state_version<>p_expected_version then raise exception 'Creative Project is not an unchanged draft';end if;
 if jsonb_typeof(p_frames)<>'array' or jsonb_array_length(p_frames)<1 or jsonb_array_length(p_frames)>20 then raise exception 'Invalid frames';end if;
 update public.studio_creative_projects set title=p_title,unified_caption=p_caption,frame_count=jsonb_array_length(p_frames),
  editor_state=jsonb_set(v_project.editor_state,'{frames}',p_frames,false),state_version=state_version+1,updated_at=now()
 where id=v_pack.project_id;
 update public.studio_editorial_packs set payload=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_pack.payload,
  '{title}',to_jsonb(p_title),false),'{caption}',to_jsonb(p_caption),false),'{artDirection}',to_jsonb(p_art_direction),false),
  '{frames}',p_frames,false),'{newsletter}',coalesce(p_newsletter,'null'::jsonb),false) where production_date=p_date;
 return p_expected_version+1;
end $$;
revoke all on function public.apply_code_editorial_pack(date,text,text,text,jsonb,jsonb,integer,uuid) from public,anon,authenticated;
grant execute on function public.apply_code_editorial_pack(date,text,text,text,jsonb,jsonb,integer,uuid) to service_role;
commit;