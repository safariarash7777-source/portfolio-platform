// Full-row-count synthetic HTTP fixture. No external network, credentials or real rows.
import {createServer} from 'node:http';
let db='ready',world='slow',analytics='ready',pageMs=40;
const stats={requests:0,world:0,history:0,monthly:0,quarterly:0,snapshots:0,active:0,maxActive:0};
const sourceAt=Date.now()-300000;
const row={price:100,closingPrice:100,unit:'toman',changePercent:null,sourceDate:'1405-07-09',sourceTime:'15:00:00',volume:1000,value:100000,marketValue:1000000,pe:null};
const board={fetchedAt:sourceAt,stocks:Array.from({length:760},(_,id)=>({...row,id:`نمونه${id}`,faName:'نمونهٔ مصنوعی'})),funds:Array.from({length:333},(_,id)=>({...row,id:`صندوق${id}`,faName:'صندوق مصنوعی',type:id%2?'طلا':'درآمد ثابت',nav:null})),gold:[],currency:[],crypto:[],options:[]};
const history=Array.from({length:29610},(_,i)=>({id:i+1,symbol:`نمونه${Math.floor(i/30)}`,trade_date:new Date(Date.now()-i%30*86400000).toISOString().slice(0,10),volume:i%30?100:200}));
const codal=n=>Array.from({length:n},(_,i)=>({id:i+1,symbol:`نمونه${Math.floor(i/2)}`,captured_at:'2026-09-30T12:00:00Z',data:{period_end:i%2?'1404-06-31':'1405-06-31',period_total_amount:i%2?100:200,period_months:3,standalone:{revenue:i%2?100:200}}}));
const monthly=codal(5981),quarterly=codal(3638);
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:15903');
 const send=(value,status=200)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}};
 if(url.pathname==='/control'){db=url.searchParams.get('db')??db;world=url.searchParams.get('world')??world;analytics=url.searchParams.get('analytics')??analytics;pageMs=Number(url.searchParams.get('pageMs')??pageMs);return send({synthetic:true,db,world,analytics,pageMs,stats});}
 if(url.pathname==='/stats')return send({synthetic:true,stats,counts:{stocks:760,funds:333,history:29610,monthly:5981,quarterly:3638},sourceAt});
 stats.requests++;stats.active++;stats.maxActive=Math.max(stats.active,stats.maxActive);res.once('close',()=>stats.active--);
 const table=url.pathname.split('/').at(-1);
 if(url.pathname==='/world'){stats.world++;if(world==='hang')return;await new Promise(r=>setTimeout(r,world==='slow'?4000:40));return world==='error'?send({error:'synthetic'},503):send([{id:'bitcoin',symbol:'btc',current_price:100,price_change_percentage_24h:null,image:null}]);}
 if(db==='hang')return;
 if(url.pathname.startsWith('/auth/'))return send({error:'No synthetic session'},401);
 if(table==='ir_market_snapshots'){stats.snapshots++;await new Promise(r=>setTimeout(r,40));return db==='error'?send({error:'synthetic'},503):send([{payload:board}]);}
 if(db==='error')return send({error:'synthetic'},503);
 if(table==='symbol_history')stats.history++;
 else if(table==='codal_reports')stats[url.searchParams.get('report_kind')==='eq.ن-۳۰'?'monthly':'quarterly']++;
 else return send([]);
 await new Promise(r=>setTimeout(r,pageMs));
 const cursor=Number(url.searchParams.get('and')?.match(/id.gt.(\d+)/)?.[1]??0);
 if(analytics==='error'&&cursor>0)return send({error:'synthetic middle failure'},503);
 if(analytics==='hang'&&cursor>0)return;
 let rows=table==='symbol_history'?history:(url.searchParams.get('report_kind')==='eq.ن-۳۰'?monthly:quarterly);
 if(table==='symbol_history'&&url.searchParams.get('symbol'))rows=rows.filter(r=>r.symbol===url.searchParams.get('symbol').replace(/^eq\\./,''));
 rows=url.searchParams.get('order')==='id.desc'?rows.slice(-1):rows.filter(r=>r.id>cursor).slice(0,Math.min(1000,Number(url.searchParams.get('limit')??1000)));
 return send(rows);
}).listen(15903,'127.0.0.1',()=>console.log('Synthetic HTTP fixture 15903; zero upstream'));
