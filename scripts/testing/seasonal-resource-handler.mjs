import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(path,dependencies){
 const compiledModule={exports:{}};
 const source=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(source,{module:compiledModule,exports:compiledModule.exports,require:name=>name in dependencies?dependencies[name]:require(name),Response,Map},{filename:path});return compiledModule.exports;
}
/** Only the request-scoped client is injected; executes the unchanged route code.
 * Native-SDK mode exercises real GoTrue/PostgREST/Storage without service-role.
 * This harness does not prove Next's cookie adapter or a browser login flow. */
export function resourceHandlers(db){
 const access=load('lib/seasonal/resource-access.ts',{});
 const response={seasonalResponse:(data,status=200)=>Response.json({contractVersion:'seasonal.v0.1',data},{status,headers:{'Cache-Control':'private, no-store'}}),seasonalUnavailable:()=>Response.json({contractVersion:'seasonal.v0.1',availability:'unavailable',error:'دریافت اطلاعات دوره انجام نشد. دوباره تلاش کنید.'},{status:503,headers:{'Cache-Control':'private, no-store'}})};
 const deps={'@/lib/supabase/server':{createClient:async()=>db},'@/lib/seasonal/server':response,'@/lib/seasonal/resource-access':access};
 return {list:load('app/api/cohorts/[id]/resources/route.ts',deps).GET,download:load('app/api/cohorts/[id]/resources/[resourceId]/route.ts',deps).GET};
}
