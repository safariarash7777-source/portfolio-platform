"use client";
import {useMemo} from "react";
import CourseOperations from "@/components/seasonal/CourseOperations";
export default function OperationsFixture(){
 const transport=useMemo(()=>{
  const cohort="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",user="11111111-1111-4111-8111-111111111111";
  const data={cohorts:[{id:cohort,title:"دورهٔ مصنوعی A",starts_at:"2026-10-01T05:30:00Z",ends_at:"2027-01-01T05:30:00Z",policy_version:"sandbox.v1"}],members:[{userId:user,label:"حساب مصنوعی با تماس تأییدشده"}],registrations:[{id:1,cohortId:cohort,externalId:"SYNTHETIC-001",source:"synthetic-partner",status:"unmatched",note:"بررسی شاهد مستقل لازم است",contact:"m***@example.invalid"}],grants:[] as {grantRef:string;userId:string;cohortId:string;startsAt:string;endsAtExclusive:string;revokedAt:string|null}[]};
  return (async(input,init)=>{
   if(init?.method!=="POST")return Response.json({contractVersion:"seasonal.v0.1",data});
   const body=JSON.parse(String(init.body)),path=String(input);
   if(path.includes("preview"))return Response.json({data:{importId:1,hash:"a".repeat(64),total:1},rows:[{externalId:"SYNTHETIC-001",status:"accepted",contact:"m***@example.invalid"}]});
   if(body.action==="grant")data.grants.push({grantRef:"55555555-5555-4555-8555-555555555555",userId:user,cohortId:cohort,startsAt:body.startsAt,endsAtExclusive:body.endsAtExclusive,revokedAt:null});
   if(body.action==="revoke")data.grants.forEach(g=>g.revokedAt=new Date().toISOString());
   if(body.action==="review")data.registrations[0].status="validated";
   return Response.json({data:{fixture:true}});
  }) as typeof fetch;
 },[]);
 return <main className="mx-auto max-w-5xl p-5"><p className="card p-4 mb-5" role="note">نمونهٔ مصنوعی NEXT04؛ UI واقعی، انتقال دادهٔ آزمایشی مستقل از DB. هیچ عملیات یا هویت واقعی تغییر نمی‌کند.</p><CourseOperations transport={transport}/></main>;
}
