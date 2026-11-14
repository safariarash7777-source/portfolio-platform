import { backgroundWorkWindow } from './background-work-window.mjs';

// Cadence only: the existing engine owns persistent cursors and all request caps.
// A completed/failed attempt is followed by a cooldown; slow attempts never overlap.
export function createCompanyWorkScheduler({job,now=Date.now,regularIntervalMs=3*60*60*1000,overnightEnabled=true}){
  const regular=Number.isFinite(regularIntervalMs)&&regularIntervalMs>=60000?regularIntervalMs:3*60*60*1000;
  const state={running:false,started:false,lastStartedAt:null,lastCompletedAt:null,regularIntervalMs:regular,overnightIntervalMs:Math.min(regular,15*60*1000)};
  function interval(at){return overnightEnabled&&backgroundWorkWindow(at).offPeak?state.overnightIntervalMs:regular;}
  async function run({initial=false}={}){
    const at=now();
    if(state.running||!Number.isFinite(at)||at<=0)return false;
    if(!state.started&&!initial)return false;
    if(state.started&&(state.lastCompletedAt===null||at<state.lastCompletedAt||at-state.lastCompletedAt<interval(at)))return false;
    state.running=true;state.started=true;state.lastStartedAt=at;
    try{await job();return true;}
    finally{
      const completed=now();
      // Invalid/backwards clocks must not create an immediate retry loop.
      state.lastCompletedAt=Number.isFinite(completed)?Math.max(at,completed):at;
      state.running=false;
    }
  }
  return {state,run};
}
