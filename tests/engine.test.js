import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,demoSources,references} from '../data.js';
import {parseDate,parseCSV,parseJSON,numberValue,makeCSV,mappingFor,fitReference,scoreRecord,analyze} from '../engine.js';

function run(preset, overrides={}){
 const src=demoSources(preset),rows=src.flatMap(s=>s.rows);
 const sourceFor=src.flatMap((s,j)=>s.rows.map((_,i)=>({order:j+1,row:i+1,mapping:mappingFor(preset,s.headers)})));
 return analyze({preset,rows,sourceFor,model:fitReference(references(preset)),...overrides});
}
test('CSV handles a BOM, quotes, commas, newlines, and CRLF',()=>{
 const {headers,rows}=parseCSV('\uFEFFid,"memo"\r\nA-1,"a,b\n\"\"中文\"\""\r\n');
 assert.deepEqual(headers,['id','memo']); assert.deepEqual(rows,[{id:'A-1',memo:'a,b\n"中文"'}]);
 assert.throws(()=>parseCSV('x,y\n1')); assert.throws(()=>parseCSV('x,x\n1,2')); assert.throws(()=>parseCSV('x\n"unclosed')); assert.throws(()=>parseCSV('constructor\na'));
});
test('JSON accepts sparse scalar records but rejects arrays, nested and reserved keys',()=>{
 assert.deepEqual(parseJSON('[{"hello":1},{"world":null}]').headers,['hello','world']);
 for(const x of ['{}','[]','[[]]','[{"a":{}}]','[{"__proto__":"x"}]','[{"a":1e999}]'])assert.throws(()=>parseJSON(x));
});
test('date calendar and human currency parsing are strict',()=>{
 assert.equal(parseDate('2024/2/29'),'2024-02-29');assert.equal(parseDate('2026-02-29'),null);
 assert.equal(numberValue('NT$ 2,340'),2340);assert.equal(numberValue('4,50'),null); assert.equal(numberValue('0'),0);
});
test('reference is deterministic, robust, and only scores known categories with n≥8',()=>{
 const p=PRESETS.facilities,r1=references(p),r2=references(p);
 assert.deepEqual(r1,r2);assert.equal(r1.length,120);
 const m=fitReference(r1);
 assert.equal(m.get('照明').n,30);
 assert.equal(scoreRecord({category:'未知',duration:4,cost:1100},m),null);
 assert.equal(fitReference(r1.slice(0,7)).size,0);
 const group=m.get('照明');
 assert.equal(scoreRecord({category:'照明',duration:group.center[0],cost:group.center[1]},m).distance,0);
 assert.ok(scoreRecord({category:'照明',duration:70,cost:50000},m).distance>10);
});
test('two source mappings and cross-source duplicate rule: both presets exactly 12/2/4',()=>{
 for(const p of Object.values(PRESETS)){
  const a=run(p);
  assert.deepEqual([a.total,a.pass,a.review,a.blocked,a.eligible.length],[18,12,2,4,12]);
  assert.equal(a.results[10].meta.order,2);
  assert.ok(a.results[16].errors.some(([key,msg])=>key==='id'&&msg.includes('重複')));
  assert.equal(run(p,{dedupe:false}).blocked,3);
  assert.equal(run(p,{ai:false}).review,0);
 }
});
test('AI review may be approved, but human release cannot override deterministic rules',()=>{
 const p=PRESETS.facilities, base=run(p);
 const review=base.results.find(r=>r.state==='review').index;
 const blocked=base.results.find(r=>r.state==='blocked').index;
 const revised=run(p,{allowReviewed:new Set([review,blocked])});
 assert.equal(revised.eligible.length,13);assert.equal(revised.results[review].approved,true);assert.equal(revised.results[blocked].approved,false);
});
test('CSV export neutralizes spreadsheet formulas from imported text',()=>{
 const s=makeCSV(['id','amount'],[{id:' =1+1',amount:-2},{id:'+SUM(2,2)',amount:4},{id:'\tcmd',amount:8}]);
 assert.match(s,/"' =1\+1","-2"/);assert.match(s,/"'\+SUM\(2,2\)"/);assert.ok(s.includes("'\tcmd"));
});
