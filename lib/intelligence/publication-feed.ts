import { publicationId, PUBLICATION_CONTRACT } from './publication';
export { PUBLICATION_CONTRACT };
export type PublicationCursor = { cohortId: string; publishedAt: string; versionId: string };
export type PublicationFeedItem = {
 versionId: string; version: number; title: string; summary: string;
 contentKind: 'brief' | 'lesson' | 'webinar_plan'; sources: {url:string;asOf:string}[];
 publishedAt: string; detailHref: string; readAt: string | null; hasBeenRead: boolean;
};
export type PublicationFeedPage = { items: PublicationFeedItem[]; nextCursor: string | null };
export type PublicationDetail = { id:string; title:string; summary:string; content:string; version:number; sources:{url:string;asOf:string}[] };
export type ReadReceipt = {versionId:string;readAt:string;hasBeenRead:true};
const object = (v:unknown): v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const uuid = (v:unknown): v is string => {try{publicationId(v);return true;}catch{return false;}};
const timestamp = (v:unknown): v is string => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
function isSources(v:unknown):v is {url:string;asOf:string}[]{
 return Array.isArray(v) && v.length>0 && v.length<=50 && v.every(s=>{
  if(!object(s)||typeof s.url!=='string'||typeof s.asOf!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s.asOf))return false;
  try{const u=new URL(s.url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&new Date(s.asOf).toISOString().slice(0,10)===s.asOf;}catch{return false;}
 });
}
export function isReadReceipt(v:unknown):v is ReadReceipt{return object(v)&&uuid(v.versionId)&&timestamp(v.readAt)&&v.hasBeenRead===true;}
export function isPublicationDetail(v:unknown):v is PublicationDetail{return object(v)&&uuid(v.id)&&typeof v.title==='string'&&typeof v.summary==='string'&&typeof v.content==='string'&&Number.isInteger(v.version)&&Number(v.version)>0&&isSources(v.sources);}
export function isFeedItem(v:unknown):v is PublicationFeedItem{
 return object(v)&&uuid(v.versionId)&&Number.isInteger(v.version)&&Number(v.version)>0&&typeof v.title==='string'&&typeof v.summary==='string'
  && ['brief','lesson','webinar_plan'].includes(String(v.contentKind))&&isSources(v.sources)&&timestamp(v.publishedAt)
  &&typeof v.detailHref==='string'&&/^\/publications\/[a-f0-9-]+\?cohort=[a-f0-9-]+$/i.test(v.detailHref)
  &&typeof v.hasBeenRead==='boolean'&&(v.readAt===null?!v.hasBeenRead:timestamp(v.readAt)&&v.hasBeenRead);
}
export function isFeedPage(v:unknown):v is PublicationFeedPage{return object(v)&&Array.isArray(v.items)&&v.items.length<=50&&v.items.every(isFeedItem)&&(v.nextCursor===null||typeof v.nextCursor==='string'&&v.nextCursor.length<=1024);}
export function encodePublicationCursor(v:PublicationCursor):string{
 return btoa(JSON.stringify({cohortId:v.cohortId,publishedAt:v.publishedAt,versionId:v.versionId})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodePublicationCursor(raw:string,cohortId:string):PublicationCursor{
 if(raw.length>1024||!raw||!/^[A-Za-z0-9_-]+$/.test(raw))throw Error('Invalid cursor');
 let v:unknown;try{v=JSON.parse(atob(raw.replaceAll('-','+').replaceAll('_','/')));}catch{throw Error('Invalid cursor');}
 if(!object(v)||Object.keys(v).sort().join(',')!=='cohortId,publishedAt,versionId'||!uuid(v.cohortId)||v.cohortId!==cohortId||!uuid(v.versionId)||!timestamp(v.publishedAt))throw Error('Invalid cursor');
 // Preserve PostgreSQL microseconds: Date.toISOString() would lose keyset precision.
 return {cohortId:v.cohortId,publishedAt:v.publishedAt,versionId:v.versionId};
}
export function publicationFeedDto(raw:unknown,cohortId:string):PublicationFeedPage{
 if(!object(raw)||!Array.isArray(raw.items)||raw.items.length>50||!raw.items.every(isFeedItem))throw Error('Invalid feed');
 const items=raw.items.map(i=>{
  if(i.detailHref!==`/publications/${i.versionId}?cohort=${cohortId}`)throw Error('Invalid detail scope');
  return {versionId:i.versionId,version:i.version,title:i.title,summary:i.summary,contentKind:i.contentKind,
   sources:i.sources.map(s=>({url:s.url,asOf:s.asOf})),publishedAt:i.publishedAt,detailHref:i.detailHref,readAt:i.readAt,hasBeenRead:i.hasBeenRead};
 });
 const nextCursor=raw.nextCursor===null?null:encodePublicationCursor(decodePublicationCursor(encodePublicationCursor(raw.nextCursor as PublicationCursor),cohortId));
 return {items,nextCursor};
}
