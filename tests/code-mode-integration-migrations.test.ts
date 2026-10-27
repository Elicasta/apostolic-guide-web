import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

const ids={actor:"10000000-0000-4000-8000-000000000001",project:"20000000-0000-4000-8000-000000000002"};
const init=String.raw\`
create role anon;create role authenticated;create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users(id) values ('\${ids.actor}');
create table public.studio_doctrine_verdicts(
 id uuid primary key default gen_random_uuid(),
 source_type text not null constraint studio_doctrine_verdicts_source_type_check
 check(source_type in ('creative_project','threads','custom_asset','video_render','video_clip'))
);
create table public.studio_threads_batches(
 id uuid primary key default gen_random_uuid(),week_start date not null,
 topic text,voice text not null default 'serious-witty',
 status text not null default 'draft',doctrine_status text,doctrine_summary text,
 updated_at timestamptz not null default now()
);
create table public.studio_threads_posts(
 id uuid primary key default gen_random_uuid(),
 batch_id uuid references public.studio_threads_batches(id) on delete cascade,
 position integer not null default 0,category text not null,body text not null,
 source_title text,source_url text,source_summary text,doctrine_status text,doctrine_notes text,
 x_status text not null default 'off',status text not null default 'draft',
 updated_at timestamptz not null default now()
);
create table public.studio_creative_projects(
 id uuid primary key default gen_random_uuid(),
 title text not null,unified_caption text not null default '',
 frame_count integer not null default 1,editor_state jsonb not null default '{}'::jsonb,
 state_version integer not null default 1,status text not null default 'draft',
 updated_at timestamptz not null default now()
);
create table public.studio_editorial_packs(
 production_date date primary key,project_id uuid not null references public.studio_creative_projects(id),
 payload jsonb not null
);
\`;
test("phase 2-4 SQL migrations apply together with RLS and doctrine constraint",async()=>{
 const db=new PGlite();
 try{
  await db.exec(init);
  const migrations=[
   "20261027110000_broadcast_code_mode.sql",
   "20261027113000_threads_code_mode.sql",
   "20261027120000_multi_tool_code_mode.sql"
  ];
  for(const path of migrations) await db.exec(readFileSync("supabase/migrations/"+path,"utf8"));
  const permissions=await db.query<{relname:string;relrowsecurity:boolean}>(
    "select relname,relrowsecurity from pg_class where relname in ('studio_broadcast_code_drafts','studio_broadcast_code_revisions','studio_code_mode_presets','studio_code_mode_checkpoints','studio_teleprompter_code_drafts')");
  assert.equal(permissions.rows.length,5);
  assert.ok(permissions.rows.every(r=>r.relrowsecurity));
  const fn=await db.query<{has:boolean}>("select has_function_privilege('anon','public.apply_studio_threads_code(jsonb)','EXECUTE') as has");
  assert.equal(fn.rows[0].has,false);
  const q=await db.query<{has:boolean}>("select has_function_privilege('service_role','public.apply_studio_threads_code(jsonb)','EXECUTE') as has");
  assert.equal(q.rows[0].has,true);
  await db.query("insert into public.studio_doctrine_verdicts(source_type) values ('broadcast')");
  const document={tool:"threads",version:1,mode:"single",weekStart:"2026-11-02",topic:"Oneness",posts:[{position:1,category:"scripture",body:"Read John 1:1",mirrorToX:false}]};
  const created=await db.query<{result:{batchId:string;posts:Array<{id:string}>}}> ("select public.apply_studio_threads_code($1::jsonb) result",[JSON.stringify(document)]);
  const saved=created.rows[0].result;
  assert.equal(saved.posts.length,1);
  const row=await db.query<{status:string;body:string}>("select status,body from public.studio_threads_posts where id=$1",[saved.posts[0].id]);
  assert.deepEqual(row.rows[0],{status:"draft",body:"Read John 1:1"});
  await db.query("update public.studio_threads_posts set doctrine_status='pass' where id=$1",[saved.posts[0].id]);
  const modified={...document,batchId:saved.batchId,posts:[{...document.posts[0],id:saved.posts[0].id,body:"Read John 1:14"}]};
  await db.query("select public.apply_studio_threads_code($1::jsonb)",[JSON.stringify(modified)]);
  const updated=await db.query<{body:string;doctrine_status:string|null}>("select body,doctrine_status from public.studio_threads_posts where id=$1",[saved.posts[0].id]);
  assert.equal(updated.rows[0].body,"Read John 1:14");assert.equal(updated.rows[0].doctrine_status,null);
  await assert.rejects(db.query("select public.apply_studio_threads_code($1::jsonb)",[JSON.stringify({...document,batchId:saved.batchId,posts:[{...document.posts[0],body:"x".repeat(501)}]})]));
  await db.query("update public.studio_threads_posts set status='approved' where id=$1",[saved.posts[0].id]);
  await assert.rejects(db.query("select public.apply_studio_threads_code($1::jsonb)",[JSON.stringify(modified)]));
  await db.query("insert into public.studio_creative_projects(id,title,editor_state) values ($1,'Old',{\"frames\":[{\"id\":\"slide-1\",\"headline\":\"Old\"}]}::jsonb)",[ids.project]);
  await db.query("insert into public.studio_editorial_packs(production_date,project_id,payload) values('2026-11-02',$1,$2::jsonb)",[ids.project,JSON.stringify({title:"Old",caption:"Old",artDirection:"Old",frames:[{id:"slide-1"}],newsletter:null})]);
  const updatedFrames=[{id:"slide-1",headline:"New",body:"John 1:1"}];
  const result=await db.query<{v:number}>("select public.apply_code_editorial_pack('2026-11-02','New','New caption','New direction',$1::jsonb,'null'::jsonb,1,$2) as v",[JSON.stringify(updatedFrames),ids.actor]);
  assert.equal(result.rows[0].v,2);
  const project=await db.query<{state_version:number;editor_state:{frames:unknown[]}}>("select state_version,editor_state from public.studio_creative_projects where id=$1",[ids.project]);
  assert.equal(project.rows[0].state_version,2);
  assert.deepEqual(project.rows[0].editor_state.frames,updatedFrames);
  await assert.rejects(db.query("select public.apply_code_editorial_pack('2026-11-02','stale','stale','stale',$1::jsonb,'null'::jsonb,1,$2)",[JSON.stringify(updatedFrames),ids.actor]));
 }finally{await db.close();}
});