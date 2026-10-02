/** Pure server-side projection. No collector, member storage or network requests. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const schema=JSON.parse(readFileSync(new URL('../event.schema.json',import.meta.url),'utf8'));
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const finiteTimestamp=value=>{
 if(typeof value!=='string')return false;
 const m=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/);
 if(!m)return false;
 const [,y,mo,d,h,mi,s,,sign,oh,om]=m;
 if(+h>23||+mi>59||+s>59||(sign&&(+oh>23||+om>59)))return false;
 const check=new Date(0);check.setUTCFullYear(+y,+mo-1,+d);check.setUTCHours(0,0,0,0);
 return check.getUTCFullYear()===+y&&check.getUTCMonth()===+mo-1&&check.getUTCDate()===+d&&Number.isFinite(Date.parse(value));
};
// Implements only the keywords present in the pinned contract; no permissive fallback.
function matches(s,v){
 if(s.$ref)return matches(s.$ref.split('/').slice(1).reduce((o,k)=>o[k],schema),v);
 if(s.const!==undefined&&!equal(s.const,v))return false;
 if(s.enum&&!s.enum.some(x=>equal(x,v)))return false;
 if(s.type==='object'&&!plain(v)||s.type==='string'&&typeof v!=='string'||s.type==='integer'&&!Number.isSafeInteger(v)||s.type==='null'&&v!==null)return false;
 if(s.pattern&&(typeof v!=='string'||!(new RegExp(s.pattern).test(v))))return false;
 if(s.format==='date-time'&&!finiteTimestamp(v))return false;
 if(s.minimum!==undefined&&v<s.minimum||s.maximum!==undefined&&v>s.maximum)return false;
 if(s.required&&(!plain(v)||s.required.some(k=>!Object.hasOwn(v,k))))return false;
 if(s.properties&&plain(v)){
  if(s.additionalProperties===false&&Object.keys(v).some(k=>!Object.hasOwn(s.properties,k)))return false;
  for(const[k,value]of Object.entries(v))if(s.properties[k]&&!matches(s.properties[k],value))return false;
 }
 if(s.anyOf&&!s.anyOf.some(x=>matches(x,v)))return false;
 if(s.allOf&&!s.allOf.every(x=>matches(x,v)))return false;
 if(s.if&&matches(s.if,v)&&s.then&&!matches(s.then,v))return false;
 return true;
}
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const canonicalDigest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const freeze=v=>{if(plain(v)||Array.isArray(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
export function validateMeasurement(event){if(!matches(schema,event))throw Error('measurement_invalid');return true;}
export function buildMeasurement(input){
 if(!plain(input)||Object.keys(input).some(k=>!Object.hasOwn(schema.properties,k)||['eventId','contractVersion'].includes(k)))throw Error('measurement_invalid');
 const event={...structuredClone(input),contractVersion:'measurement.v0.1',eventId:'k_'+canonicalDigest([input.environment,input.type,input.sourceRef])};
 validateMeasurement(event);return freeze(event);
}
/** In-memory replay guard for bounded batches, never a persistent canonical event ledger. */
export function uniqueMeasurements(events){
 const byId=new Map(),bySource=new Map();
 for(const event of events){
  validateMeasurement(event);
  const fingerprint=canonicalDigest(event),existing=byId.get(event.eventId);
  const source=JSON.stringify([event.environment,event.type,event.sourceRef]);
  if(existing&&existing.fingerprint!==fingerprint||bySource.has(source)&&bySource.get(source)!==event.eventId)throw Error('measurement_conflict');
  byId.set(event.eventId,{fingerprint,event});bySource.set(source,event.eventId);
 }
 return [...byId.values()].map(x=>freeze(structuredClone(x.event)));
}
export const timestampValid=finiteTimestamp;
