import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { buildEditorialWindow } from "../src/editorial-engine";
import { pathwayBySlug } from "../src/pathway-catalog";

const migration = readFileSync(new URL("../supabase/migrations/20261006193000_editorial_content_engine.sql",import.meta.url),"utf8");
async function database() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);");
  const creative = readFileSync(new URL("../supabase/migrations/20260816120000_persistent_creative_publishing.sql",import.meta.url),"utf8");
  await db.exec(creative.slice(creative.indexOf("create table"),creative.indexOf("\n);",creative.indexOf("create table"))+4));
  await db.exec("create table studio_content_calendar_items(id uuid primary key default gen_random_uuid(),pathway_slug text,title text,content_type text,platform text,status text,source text,source_ref text,metadata jsonb,unique(source,source_ref));");
  await db.exec(migration);
  return db;
}
const packs = () => buildEditorialWindow("2026-10-05",14).map(p=>({...p,collection:pathwayBySlug(p.pathwaySlug)!.collection}));
async function prepare(db:PGlite,rows:unknown[]) {
  return db.query<{count:number}>("select prepare_editorial_packs($1::jsonb) as count",[JSON.stringify(rows)]);
}

test("transactional refill creates linked drafts and preserves edits on repeat/concurrent calls",async()=>{
  const db=await database();
  try {
    const first=await prepare(db,packs());
    assert.equal(first.rows[0].count,14);
    const linked=await db.query<{status:string;frames:number;project_id:string}>("select p.project_id,c.status,c.frame_count as frames from studio_editorial_packs p join studio_creative_projects c on c.id=p.project_id");
    assert.equal(linked.rows.length,14);
    assert.ok(linked.rows.every(r=>r.status==="draft" && r.frames>=1));
    await db.query("update studio_creative_projects set title='Human edit',state_version=2 where id=$1",[linked.rows[0].project_id]);
    const repeats=await Promise.all([prepare(db,packs()),prepare(db,packs())]);
    assert.deepEqual(repeats.map(r=>r.rows[0].count),[0,0]);
    const human=await db.query<{title:string;state_version:number}>("select title,state_version from studio_creative_projects where id=$1",[linked.rows[0].project_id]);
    assert.deepEqual(human.rows[0],{title:"Human edit",state_version:2});
    const calendar=await db.query<{status:string;metadata:{planned_date:string;creative_project_id:string}}>("select status,metadata from studio_content_calendar_items");
    assert.equal(calendar.rows.length,14);
    assert.ok(calendar.rows.every(r=>r.status==="draft" && r.metadata.creative_project_id && r.metadata.planned_date));
  } finally { await db.close(); }
});

test("a failed pack rolls back all project, calendar and ledger inserts",async()=>{
  const db=await database();
  try {
    const batch=packs().slice(0,2); batch[1].format="invalid" as "single";
    await assert.rejects(prepare(db,batch));
    for (const table of ["studio_editorial_packs","studio_creative_projects","studio_content_calendar_items"]) {
      const count=await db.query<{count:number}>(`select count(*)::integer as count from ${table}`);
      assert.equal(count.rows[0].count,0);
    }
    assert.equal((await prepare(db,packs())).rows[0].count,14);
    const settings=await db.query<{enabled:boolean}>("select enabled from studio_editorial_settings");
    assert.equal(settings.rows[0].enabled,false);
    const permissions=await db.query<{allowed:boolean}>("select has_function_privilege('authenticated','prepare_editorial_packs(jsonb)','execute') as allowed");
    assert.equal(permissions.rows[0].allowed,false);
    assert.equal((await db.query<{allowed:boolean}>("select has_function_privilege('service_role','prepare_editorial_packs(jsonb)','execute') as allowed")).rows[0].allowed,true);
  } finally { await db.close(); }
});
