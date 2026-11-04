const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const here=__dirname,repo=path.resolve(here,'../../start-a-finance-v04-20261029'),req=createRequire(path.join(repo,'package.json')),ts=req('typescript');
const source=path.join(here,'source'),cache=new Map();
function load(name){
 const file=path.join(source,name);if(cache.has(file))return cache.get(file);
 const compiled={exports:{}};cache.set(file,compiled.exports);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(js,{exports:compiled.exports,module:compiled,require:id=>{
  if(!id.startsWith('.')&&!id.startsWith('@/'))return req(id);
  const target=id.startsWith('@/')?id.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(name),id));
  const fileName=['.ts','.tsx'].map(ext=>target+ext).find(p=>fs.existsSync(path.join(source,p)));assert.ok(fileName,id);return load(fileName);
 }});return compiled.exports;
}
const {buildMonthlySales}=load('lib/core/monthlyReport.ts');
// Synthetic calendar matching the observed shape, not copied financial/source data.
const model=buildMonthlySales([{symbol:'آزمون',report_kind:'ن-۳۰',period_end:'1405-06-31',fiscal_year:1405,unit:'میلیون ریال',products:[],period_total_amount:100000000,fy_cumulative_amount:100000000}]);
const data=Array.from(model.currentMonths,cm=>({label:cm.monthLabel,current:cm.amount,currentMonthKey:cm.monthKey}));
const {createRechartsStore}=req('recharts/lib/state/store'),{arrayTooltipSearcher}=req('recharts/lib/state/optionsSlice');
const axis=req('recharts/lib/state/selectors/axisSelectors'),tip=req('recharts/lib/state/selectors/tooltipSelectors'),selectors=req('recharts/lib/state/selectors/selectors');
const keyboard=req('recharts/lib/state/keyboardEventsMiddleware'),mouse=req('recharts/lib/state/mouseEventsMiddleware');
const defaults=createRechartsStore().getState();
function makeStore(){return createRechartsStore({...defaults,
 options:{...defaults.options,chartName:'ComposedChart',tooltipPayloadSearcher:arrayTooltipSearcher,defaultTooltipEventType:'axis',validateTooltipEventTypes:['axis','item']},
 layout:{...defaults.layout,width:301,height:280,margin:{top:8,right:8,left:8,bottom:0}},
 chartData:{...defaults.chartData,chartData:data,dataEndIndex:data.length-1},
 cartesianAxis:{...defaults.cartesianAxis,xAxis:{0:{...axis.implicitXAxis,hide:false,dataKey:'label',reversed:true}},yAxis:{0:{...axis.implicitYAxis,hide:false,width:58,orientation:'right'}}},
 graphicalItems:{...defaults.graphicalItems,cartesianItems:[{id:'current',type:'bar',dataKey:'current',xAxisId:0,yAxisId:0,hide:false,isPanorama:false}]},
 tooltip:{...defaults.tooltip,settings:{...defaults.tooltip.settings,active:undefined,trigger:'click'},tooltipItemPayloads:[{dataDefinedOnItem:undefined,getPosition:()=>undefined,settings:{graphicalItemId:'current',dataKey:'current',name:'سال ۱۴۰۵',hide:false}}]},
 });}
const store=makeStore(),ticks=tip.selectTooltipAxisTicks(store.getState());
function snapshot(store,trigger){const state=store.getState(),payload=selectors.selectTooltipPayload(state,'axis',trigger);return{index:selectors.selectActiveIndex(state,'axis',trigger),label:selectors.selectActiveLabel(state,'axis',trigger),keyboard:state.tooltip.keyboardInteraction.index,click:state.tooltip.axisInteraction.click.index,payloadValues:payload?.map(p=>p.value),visiblePayloadCount:(payload??[]).filter(p=>p.value!=null).length};}
const target={offsetWidth:301,offsetHeight:280,getBoundingClientRect:()=>({left:37,top:265.640625,width:301,height:280})};
store.dispatch(mouse.mouseClickAction({clientX:157.4,clientY:355.640625,currentTarget:target}));
const tap=snapshot(store,'click');
store.dispatch(keyboard.focusAction());
const focused=snapshot(store,'hover');
store.dispatch(keyboard.keyDownAction('ArrowLeft'));store.dispatch(keyboard.keyDownAction('ArrowLeft'));
const afterTwo=snapshot(store,'hover');
store.dispatch(keyboard.focusAction());
for(let i=0;i<5;i++)store.dispatch(keyboard.keyDownAction('ArrowLeft'));
const afterFiveMore=snapshot(store,'hover');
const fresh=makeStore();fresh.dispatch(keyboard.focusAction());for(let i=0;i<5;i++)fresh.dispatch(keyboard.keyDownAction('ArrowLeft'));
const freshFive=snapshot(fresh,'hover');
const actualTick=ticks.find(t=>t.value==='شهریور');
const hit=makeStore();hit.dispatch(mouse.mouseClickAction({clientX:37+actualTick.coordinate,clientY:355.640625,currentTarget:target}));
const knownMonth=snapshot(hit,'click');
const result={base:'2aa0cc46e0adb5c73e24bb752706e3168c94fc94',recharts:req('recharts/package.json').version,fixture:'synthetic September-only calendar from exact source model; not live readback',direction:axis.selectChartDirection(store.getState()),data,ticks,rootTap:tap,initialFocus:focused,afterTwoLeft:afterTwo,afterRefocusAndFiveMoreLeft:afterFiveMore,freshFocusAndFiveLeft:freshFive,clickAtKnownMonth:{coordinate:actualTick.coordinate,snapshot:knownMonth},limitations:['DOM focus and hydration not observed','no browser or real touch event','synthetic amount is not the live value','same data/size assumption must be checked by root']};
fs.writeFileSync(path.join(here,'probe.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
assert.equal(tap.label,'مهر');assert.equal(tap.visiblePayloadCount,0);
assert.equal(afterTwo.label,'خرداد');assert.equal(afterTwo.visiblePayloadCount,0);
assert.equal(afterFiveMore.label,'آبان');assert.equal(afterFiveMore.visiblePayloadCount,0);
assert.equal(freshFive.label,'شهریور');assert.equal(freshFive.visiblePayloadCount,1);
assert.equal(knownMonth.label,'شهریور');assert.equal(knownMonth.visiblePayloadCount,1);
console.log('PASS 5 selection/visibility cases with real Recharts middleware/selectors');
