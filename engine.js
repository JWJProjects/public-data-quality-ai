export const MAX_ROWS=10000;
export const MAX_SIZE=2*1024*1024;
export const REQUIRED=['id','area','category','date','duration','cost','status'];
const ALIASES=Object.freeze({'待辦':'待處理','待辦理':'待處理','辦理中':'處理中','完成':'已完成','結案':'已完成'});
const safeName=k=>k.length>0&&k.length<=120&&!['__proto__','prototype','constructor'].includes(k);
function assertHeaders(headers){
 if(headers.length>40||headers.some(k=>!safeName(k))||new Set(headers).size!==headers.length)throw Error('欄名不能空白、重複或使用保留名稱；最多 40 欄。');
}
export function parseCSV(content){
 const input=content.replace(/^\uFEFF/,'');
 const lines=[];let fields=[],value='',mode=0;
 const cell=()=>{fields.push(value);value='';mode=0;if(fields.length>40)throw Error('每列最多 40 欄。');};
 const row=()=>{cell();if(fields.length>1||fields.some(Boolean))lines.push(fields);fields=[];if(lines.length>MAX_ROWS+1)throw Error('最多可匯入 10,000 筆。');};
 for(let i=0;i<input.length;i++){
  const ch=input[i];
  if(mode===1){
   if(ch==='"'&&input[i+1]==='"'){value+='"';i++;}else if(ch==='"')mode=2; else value+=ch;
  }else if(ch===','){cell();}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&input[i+1]==='\n')i++;row();}
  else if(ch==='"'&&mode===0&&value===''){mode=1;}
  else if(mode===2||ch==='"')throw Error('CSV 引號位置不正確。');
  else value+=ch;
 }
 if(mode===1)throw Error('CSV 欄位的引號未關閉。');
 if(fields.length||value||mode===2)row();
 if(lines.length<2)throw Error('CSV 需有欄名及至少一筆資料。');
 const headers=lines.shift().map(v=>v.trim());
 assertHeaders(headers);
 return {headers,rows:lines.map((line,i)=>{
  if(line.length!==headers.length)throw Error('CSV 第 '+(i+2)+' 列欄數與標題不符。');
  return Object.fromEntries(headers.map((k,j)=>[k,line[j]]));
 })};
}
export function parseJSON(content){
 let rows;
 try{rows=JSON.parse(content.replace(/^\uFEFF/,''));}catch{throw Error('JSON 格式無法讀取。');}
 if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ROWS)throw Error('JSON 必須為 1–10,000 筆物件的陣列。');
 const headers=new Set();
 for(const row of rows){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('JSON 每筆都須是物件。');
  for(const [k,v] of Object.entries(row)){
   if(v!==null&&!['string','number','boolean'].includes(typeof v))throw Error('JSON 欄位需是單一值，不接受巢狀物件或陣列。');
   if(typeof v==='number'&&!Number.isFinite(v))throw Error('JSON 不接受超出有限範圍的數值。');
   headers.add(k);
  }
  if(headers.size>40)throw Error('最多可匯入 40 欄。');
 }
 assertHeaders([...headers]);
 if(!headers.size)throw Error('沒有可對應的來源欄位。');
 return {headers:[...headers],rows};
}
export function mappingFor(p,headers){
 return Object.fromEntries(p.fields.map(([k,label,source])=>[k,[source,label,k].find(h=>headers.includes(h))||'']));
}
export function parseDate(input){
 const m=String(input??'').trim().match(/^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/);
 if(!m)return null;
 const y=+m[1],month=+m[3],d=+m[4],dt=new Date(Date.UTC(y,month-1,d));
 return y>=1900&&y<=2100&&dt.getUTCFullYear()===y&&dt.getUTCMonth()+1===month&&dt.getUTCDate()===d?y+'-'+String(month).padStart(2,'0')+'-'+String(d).padStart(2,'0'):null;
}
export function numberValue(value){
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 const s=String(value??'').trim().replace(/^NT\$\s*/,'');
 if(!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return null;
 const n=Number(s.replaceAll(',',''));return Number.isFinite(n)?n:null;
}
function median(values){
 const sorted=[...values].sort((a,b)=>a-b), i=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2;
}
const axes=['duration','cost'], minima=[1,100];
export function fitReference(rows){
 const groups=new Map();
 for(const r of rows){
  if(!axes.every(k=>Number.isFinite(r[k])&&r[k]>=0))continue;
  if(!groups.has(r.category))groups.set(r.category,[]);
  groups.get(r.category).push(r);
 }
 const model=new Map();
 for(const [category,examples] of groups)if(examples.length>=8){
  const center=axes.map(k=>median(examples.map(r=>r[k])));
  const scale=axes.map((k,i)=>Math.max(minima[i],1.4826*median(examples.map(r=>Math.abs(r[k]-center[i])))));
  model.set(category,{center,scale,n:examples.length});
 }
 return model;
}
export function scoreRecord(r,model){
 const g=model.get(r.category);
 if(!g||!axes.every(k=>Number.isFinite(r[k])&&r[k]>=0))return null;
 const z=axes.map((k,i)=>(r[k]-g.center[i])/g.scale[i]);
 return {distance:Math.hypot(...z),z,center:g.center,scale:g.scale,n:g.n};
}
export function analyze({rows,mapping,preset,model,cutoff=3.6,dedupe=true,normalizeStatus=true,ai=true,allowReviewed=new Set(),sourceFor=null}){
 const seen=new Set();
 const results=rows.map((raw,index)=>{
  const meta=sourceFor?.[index];
  const map=meta?.mapping??mapping;
  const read=k=>map[k]&&Object.hasOwn(raw,map[k])?raw[map[k]]:null;
  const source=Object.fromEntries(REQUIRED.map(k=>[k,read(k)]));
  const norm={id:String(source.id??'').trim(),area:String(source.area??'').trim(),category:String(source.category??'').trim(),date:parseDate(source.date),duration:numberValue(source.duration),cost:numberValue(source.cost),status:String(source.status??'').trim()};
  if(normalizeStatus&&Object.hasOwn(ALIASES,norm.status))norm.status=ALIASES[norm.status];
  const repairs=REQUIRED.filter(k=>source[k]!==null&&norm[k]!==null&&String(source[k])!==String(norm[k]));
  const errors=[];
  for(const key of REQUIRED)if(!map[key])errors.push([key,'未設定欄位對應']);
  for(const key of ['id','area','category'])if(map[key]&&!norm[key])errors.push([key,'必填值缺漏']);
  if(map.date&&!norm.date)errors.push(['date','不存在的日期或格式不符']);
  if(map.duration&&(!Number.isSafeInteger(norm.duration)||norm.duration<0))errors.push(['duration','天數須為非負整數']);
  if(map.cost&&(norm.cost===null||norm.cost<0||norm.cost>Number.MAX_SAFE_INTEGER))errors.push(['cost','金額須為有限的非負數值']);
  if(map.status&&!preset.statuses.includes(norm.status))errors.push(['status','不在已知狀態清單']);
  if(dedupe&&norm.id&&seen.has(norm.id))errors.push(['id','案件編號重複，保留第一筆待查']);
  if(norm.id)seen.add(norm.id);
  const score=ai&&!errors.length?scoreRecord(norm,model):null;
  const state=errors.length?'blocked':score&&score.distance>=cutoff?'review':'pass';
  const approved=state==='review'&&allowReviewed.has(index);
  return {index,source,norm,repairs,errors,score,state,approved,meta};
 });
 const count=state=>results.filter(r=>r.state===state).length;
 const eligible=results.filter(r=>r.state==='pass'||r.approved);
 return {results,total:results.length,pass:count('pass'),review:count('review'),blocked:count('blocked'),transformed:results.filter(r=>r.repairs.length).length,eligible};
}
export function makeCSV(headers,rows){
 const cell=value=>{
  let s=value===null||value===undefined?'':String(value);
  if(typeof value==='string'&&(/^[\t\r\n]/.test(s)||/^[\s\uFEFF]*[=+\-@]/u.test(s)))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
 };
 return '\uFEFF'+[headers.map(cell).join(','),...rows.map(r=>headers.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';
}
