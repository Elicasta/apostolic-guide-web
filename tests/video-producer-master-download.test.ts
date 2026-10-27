import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("completed master remains downloadable after a new edit changes project status",()=>{
 const route=readFileSync("app/api/admin/video-producer/projects/[id]/download/route.ts","utf8");
 assert.match(route,/getStudioPermission\("manage_content"\)/);
 assert.match(route,/\.eq\("status", "completed"\)/);
 assert.match(route,/\.not\("output_storage_path", "is", null\)/);
 assert.match(route,/\.is\("deleted_at", null\)/);
 assert.doesNotMatch(route,/\["review", "completed"\]\.includes\(projectResult\.data\.status\)/);
 const ui=readFileSync("src/video-producer-master-download.tsx","utf8");
 assert.match(ui,/Earlier completed master/);
 assert.match(ui,/render.status === "completed" && render.output_storage_path/);
 assert.match(ui,/download=\{/);
 assert.doesNotMatch(ui,/!\["review", "completed"\]\.includes\(project\.status\)/);
});
