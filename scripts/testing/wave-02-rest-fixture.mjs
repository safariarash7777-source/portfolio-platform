// Synthetic loopback-only composition fixture. Never imported by product code.
import http from 'node:http';
let mode='published';
const cohort={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'نوبت مصنوعی A — بازبینی API',starts_at:'2026-10-01T05:30:00Z',ends_at:'2027-01-01T05:30:00Z',timezone:'Asia/Tehran',policy_version:'sandbox.calendar.v1',status:'published',registration_open:false};
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:8770');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
 if(req.method==='OPTIONS')return res.end();
 if(req.url==='/health')return res.end(JSON.stringify({fixture:true,mode,remoteCalls:0}));
 if(req.url.startsWith('/control?')){const next=new URL(req.url,'http://localhost').searchParams.get('mode');if(['published','empty','failure'].includes(next))mode=next;return res.end(JSON.stringify({fixture:true,mode}));}
 if(req.url.startsWith('/rest/v1/courses')){
  if(mode==='failure'){res.statusCode=503;return res.end(JSON.stringify({message:'Synthetic unavailable'}));}
  return res.end(JSON.stringify(mode==='empty'?[]:[{id:'99999999-9999-4999-8999-999999999999',title:'دورهٔ مصنوعی — بازبینی اتصال',summary:'این نوبت و تاریخ برای آزمون است؛ ثبت‌نام فعال نیست.',course_cohorts:[cohort,{...cohort,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'پیش‌نویس نباید عمومی شود',status:'draft'}]}]));
 }
 if(req.url.startsWith('/rest/v1/')){res.setHeader('Content-Range','*/0');return res.end('[]');}
 if(req.url.startsWith('/auth/v1/')){res.statusCode=401;return res.end(JSON.stringify({message:'Synthetic anonymous session'}));}
 res.statusCode=404;res.end(JSON.stringify({fixture:true}));
}).listen(8771,'127.0.0.1',()=>process.stdout.write('Synthetic composition REST fixture:8771\n'));
