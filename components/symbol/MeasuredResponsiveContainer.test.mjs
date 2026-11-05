import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '../..');
const require = createRequire(resolve(repo, 'package.json'));
const ts = require('typescript');
const libraryFile = require.resolve('recharts/lib/component/ResponsiveContainer.js');
const localRequire = createRequire(libraryFile);
const sourceFile = resolve(import.meta.dirname, 'MeasuredResponsiveContainer.tsx');
let current;
const warnings = [], observers = [];
const element = (type, props, ...children) => ({ type, props: { ...props,
  ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) }, ref: props?.ref });
const equalDeps = (a,b) => a && b && a.length === b.length && a.every((v,i)=>Object.is(v,b[i]));
const hooks = {
  __esModule: true, createElement:element,
  createContext: value => ({ value, Provider: Symbol('context-provider') }),
  useContext: context => context.value,
  forwardRef: fn => function Forwarded(props) { const { ref = null, ...rest } = props; return fn(rest, ref); },
  useImperativeHandle() {},
  useRef(initial) { const i=current.cursor++; return current.slots[i] ??= { current:initial }; },
  useState(initial) {
    const d=current, i=d.cursor++;
    if (!(i in d.slots)) d.slots[i]=typeof initial==='function'?initial():initial;
    return [d.slots[i], next=>{ const value=typeof next==='function'?next(d.slots[i]):next;
      if (!Object.is(value,d.slots[i])) { d.slots[i]=value; d.updates++; } }];
  },
  useMemo(fn,deps) {const d=current,i=d.cursor++; if(!d.slots[i]||!equalDeps(d.slots[i].deps,deps)) d.slots[i]={value:fn(),deps};return d.slots[i].value;},
  useCallback(fn,deps) { return hooks.useMemo(()=>fn,deps); },
  useEffect(fn,deps) { const d=current,i=d.cursor++;if(!d.slots[i]||!equalDeps(d.slots[i].deps,deps)) {
    const old=d.slots[i];d.slots[i]={deps};d.effects.push(()=>{old?.cleanup?.();d.slots[i].cleanup=fn();});
  } },
};
class Observer {
  constructor(callback) { this.callback=callback;this.disconnected=false;observers.push(this); }
  observe(target) {this.target=target;}
  disconnect() {this.disconnected=true;}
  emit(width,height) {this.callback([{target:this.target,contentRect:{width,height}}]);}
}
function driver() {return {
  slots:[],cursor:0,effects:[],updates:0,
  render(fn,props) {const prior=current;current=this;this.cursor=0;try{return fn(props);}finally{current=prior;}},
  flush() {for(const fn of this.effects.splice(0))fn();},
  cleanup() {for(const slot of this.slots)slot?.cleanup?.();},
};}
function cjs(source, filename, resolveRequire) {
  const compiledModule={exports:{}};
  vm.runInNewContext(source,{module:compiledModule,exports:compiledModule.exports,require:resolveRequire,ResizeObserver:Observer,
    console:{warn:message=>warnings.push(message)}},{filename});
  return compiledModule.exports;
}
// The actual local Recharts implementation and warning formatter run unchanged.
// Only React scheduling/DOM measurements are controlled, not the branch/warning.
const logFile=localRequire.resolve('../util/LogUtils');
const log=cjs(readFileSync(logFile,'utf8'),logFile,localRequire);
const library=cjs(readFileSync(libraryFile,'utf8'),libraryFile,id=>id==='react'?hooks:id==='../util/LogUtils'?log:localRequire(id));
const jsx={jsx:(type,props)=>element(type,props),jsxs:(type,props)=>element(type,props)};
const wrapper=cjs(ts.transpileModule(readFileSync(sourceFile,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  sourceFile,id=>id==='react'?hooks:id==='react/jsx-runtime'?jsx:id==='recharts'?library:require(id)).default;
const child=element('svg',{'data-test':'geometry-only-no-financial-data'});
const find=(node,type)=>!node||typeof node!=='object'?null:node.type===type?node:
  (Array.isArray(node.props?.children)?node.props.children:[node.props?.children]).map(n=>find(n,type)).find(Boolean);
function mountWrapper(width,height) {
  const d=driver(),tree=d.render(wrapper,{children:child});
  tree.ref.current={getBoundingClientRect:()=>({width,height})};d.flush();
  return {d,observer:observers.at(-1),render:()=>d.render(wrapper,{children:child})};
}

test('actual Recharts emits zero-size warning on hidden mount and hide-again; positive size recovers',()=>{
  warnings.length=0;
  const outer=driver().render(library.ResponsiveContainer,{width:'100%',height:'100%',children:child});
  const d=driver();const first=d.render(outer.type,outer.props);
  assert.equal(warnings.length,0,'initial -1 is exempt; zero must come from measurement');
  first.ref.current={getBoundingClientRect:()=>({width:0,height:0})};d.flush();
  d.render(outer.type,outer.props);assert.equal(warnings.length,1);assert.match(warnings[0],/width\(0\) and height\(0\)/);
  const observer=observers.at(-1);observer.emit(640,280);
  const shown=d.render(outer.type,outer.props);assert.equal(warnings.length,1);
  const provider=shown.props.children.props.children;assert.equal(provider.props.width,640);assert.equal(provider.props.height,280);
  observer.emit(0,0);d.render(outer.type,outer.props);assert.equal(warnings.length,2);
  d.cleanup();assert.equal(observer.disconnected,true);
});

test('candidate never mounts a chart at hidden/invalid size; exact observed dimensions reach actual Recharts',()=>{
  warnings.length=0;const h=mountWrapper(0,0);
  assert.equal(find(h.render(),library.ResponsiveContainer),undefined);
  for(const [w,hgt] of [[0,280],[375,0],[-1,280],[NaN,280],[375,Infinity]]) {
    h.observer.emit(w,hgt);assert.equal(find(h.render(),library.ResponsiveContainer),undefined);
  }
  h.observer.emit(374.5,280);
  const container=find(h.render(),library.ResponsiveContainer);
  assert.equal(container.props.width,374.5);assert.equal(container.props.height,280);assert.equal(container.props.children,child);
  const observersBefore=observers.length;
  const provider=driver().render(library.ResponsiveContainer,container.props);
  assert.equal(provider.type.name,'ResponsiveContainerContextProvider');
  const result=driver().render(provider.type,provider.props);
  assert.equal(result.props.value.width,374.5);assert.equal(result.props.value.height,280);
  assert.equal(observers.length,observersBefore,'No second detector inside positive numeric container');
  assert.deepEqual(warnings,[]);h.d.cleanup();
});

test('resize, hide, show and queued cleanup use real size without redundant state updates',()=>{
  const h=mountWrapper(960,250);assert.equal(find(h.render(),library.ResponsiveContainer).props.width,960);
  const changes=h.d.updates;h.observer.emit(960,250);assert.equal(h.d.updates,changes);
  h.observer.emit(375,250);assert.equal(find(h.render(),library.ResponsiveContainer).props.width,375);
  h.observer.emit(0,0);assert.equal(find(h.render(),library.ResponsiveContainer),undefined);
  h.observer.emit(375,230);assert.equal(find(h.render(),library.ResponsiveContainer).props.height,230);
  h.d.cleanup();const last=h.d.updates;h.observer.emit(100,100);assert.equal(h.d.updates,last);assert.ok(h.observer.disconnected);
});
