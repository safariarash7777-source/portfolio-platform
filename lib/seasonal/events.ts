import {CONTRACT_VERSION} from "./contracts";
/** A reference to audited service state. Never an instruction to send a notification. */
export function serviceEvent(row:{id:string;revision:number;event_type:string;cohort_id:string|null;user_id:string|null;occurred_at:string}) {
 return {eventId:row.id,type:row.event_type,contractVersion:CONTRACT_VERSION,
  aggregateRef:{kind:row.user_id?"membership":"cohort",id:row.user_id?`${row.cohort_id}:${row.user_id}`:row.cohort_id},
  aggregateVersion:row.revision,occurredAt:row.occurred_at,recordedAt:row.occurred_at,
  correlationId:row.id,causationId:null,payloadRef:{kind:"service-event",eventId:row.id}};
}
