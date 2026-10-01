import 'server-only';
let failureAt:string|null=null;
export function recordEmailFailure(){failureAt=new Date().toISOString();}
export function emailFailureStatus(){return {lastFailureAt:failureAt,scope:'current-server-instance'};}
