import {PRESETS,references,demoSources} from './data.js';
import {analyze,fitReference,mappingFor,parseCSV,parseJSON,makeCSV,REQUIRED,MAX_SIZE,MAX_ROWS} from './engine.js';
const icons={
 logo:'<path d="M3 6h7c4 0 4 6 8 6h3M3 18h7c4 0 4-6 8-6"/><path d="m18 9 3 3-3 3"/>',
 dash:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 map:'<path d="M4 6h7m3 0h6M4 12h4m3 0h9M4 18h12m3 0h1"/><circle cx="12" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="17" cy="18" r="1"/>',
 review:'<path d="M5 6h14v14H5zM9 6V3h6v3M8 12l2 2 5-5"/>',
 report:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
 upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
 download:'<path d="M12 4v12m-4-4 4 4 4-4M4 16v4h16v-4"/>'
};
const ico=(key)=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[key]+'</svg>';
const esc=(v)=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
const fmt=(n)=>n==null?'—':new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(n);
const nav=[['overview','檢核總覽','dash'],['mapping','欄位與規則','map'],['review','人工覆核','review'],['report','報告與匯出','report']];
const state={key:'facilities',tab:'overview',cutoff:3.6,dedupe:true,normalizeStatus:true,ai:true,filter:'all',allow:new Set(),queue:new Map(),error:'',sourceIndex:0,demo:true,seq:0,sort:null,selected:null,inspectorOpen:false,stage:'overview'};
let preset=PRESETS[state.key], model;
function announce(s){document.querySelector('#announcement').textContent=s;}
function reset(key){
 preset=PRESETS[state.key=key]; model=fitReference(references(preset));
 state.sources=demoSources(preset).map(src=>({...src,mapping:mappingFor(preset,src.headers)}));
 state.allow.clear();state.queue.clear();state.cutoff=3.6;state.dedupe=true;state.normalizeStatus=true;state.ai=true;state.sourceIndex=0;state.filter='all';state.error='';state.demo=true;state.sort=null;state.selected=null;state.inspectorOpen=false;state.stage=state.tab;
}
reset(state.key);
function results(){
 const rows=[],sourceFor=[];
 state.sources.forEach((src,s)=>src.rows.forEach((r,i)=>{rows.push(r);sourceFor.push({name:src.name,order:s+1,row:i+1,mapping:src.mapping});}));
 return analyze({rows,sourceFor,mapping:{},preset,model,cutoff:state.cutoff,dedupe:state.dedupe,normalizeStatus:state.normalizeStatus,ai:state.ai,allowReviewed:state.allow});
}
const badge=(r)=>r.approved?'<span class="badge good">已覆核放行</span>':r.state==='pass'?'<span class="badge good">通過</span>':r.state==='review'?'<span class="badge review">AI 待覆核</span>':'<span class="badge bad">規則阻擋</span>';
const button=(label,action,icon='',cls='',disabled=false)=>'<button type="button" class="btn '+cls+'" data-action="'+action+'" '+(disabled?'disabled':'')+'>'+(icon?ico(icon):'')+esc(label)+'</button>';
function chart(a){
 const points=a.results.filter(r=>r.score).slice(0,60);
 const max=Math.max(8,Math.ceil(Math.max(0,...points.map(r=>r.score.distance))));
 const bins=Array.from({length:8},()=>0);
 for(const r of points)bins[Math.min(7,Math.floor(8*r.score.distance/max))]++;
 const high=Math.max(1,...bins), y=n=>99-76*n/high, x=n=>49+55*n;
 const cutoff=state.ai?'<line x1="'+x(8*state.cutoff/max)+'" x2="'+x(8*state.cutoff/max)+'" y1="18" y2="101" stroke="#754F00" stroke-dasharray="4 3"/><text class="ctext" x="'+Math.min(442,x(8*state.cutoff/max)+4)+'" y="14">門檻 '+state.cutoff.toFixed(1)+'</text>':'';
 return '<svg viewBox="0 0 510 125" class="chart" role="img" aria-label="異常距離圖：顯示 '+points.length+' 筆樣本及覆核門檻"><text x="2" y="18" class="ctext">筆數</text><text x="36" y="27" class="ctext" text-anchor="end">'+high+'</text><text x="36" y="103" class="ctext" text-anchor="end">0</text><line class="cbase" x1="49" x2="489" y1="100" y2="100"/>'+bins.map((n,i)=>'<rect x="'+(x(i)+3)+'" y="'+y(n)+'" width="48" height="'+(99-y(n))+'" fill="#4338CA"><title>第 '+(i+1)+' 區間：'+n+' 筆</title></rect>').join('')+cutoff+'<text class="ctext" x="49" y="117">0</text><text class="ctext" x="489" y="117" text-anchor="end">'+max+' 距離</text></svg>';
}
const columnDefs=[['id','資料 ID / 來源'],['category','行政區 ／ 類別'],['date','標準日期'],['duration','天數'],['cost','金額 NT$'],['score','距離'],['state','判定']];
function displayRows(a){
 const rows=a.results.filter(r=>state.filter==='all'||state.filter===r.state);
 if(!state.sort)return rows.slice(0,300);
 const [key,dir]=state.sort;
 const val=r=>key==='score'?r.score?.distance:key==='state'?(r.approved?'approved':r.state):r.norm[key];
 return rows.sort((p,q)=>{
  const l=val(p),r=val(q);
  if(l===r)return p.index-q.index;
  if(l==null||l==='')return 1;
  if(r==null||r==='')return -1;
  return dir*(typeof l==='number'&&typeof r==='number'?l-r:String(l).localeCompare(String(r),'zh-Hant',{numeric:true}));
 }).slice(0,300);
}
const smallScreen=()=>window.matchMedia('(max-width: 800px)').matches;
function inspectRow(r,mobile=false){
 if(!r)return '<aside class="panel inspector"><header><h2>差異檢視器</h2></header><div class="panel-body">選一筆資料查看來源與標準欄位。</div></aside>';
 const cell=v=>v===null||v===undefined||v===''?'—':esc(v);
 const diffs=preset.fields.map(([key,label])=>{
  const v=r.source[key], n=r.norm[key], changed=String(v??'')!==String(n??'');
  return '<div><dt>'+esc(label)+'</dt><dd><div class="diff-values">'+(changed?'<del>'+cell(v)+'</del><span aria-hidden="true">→</span><ins>'+cell(n)+'</ins>':'<span>'+cell(v)+'</span><span aria-hidden="true">→</span><span>'+cell(n)+'</span>')+'</div>'+(changed?'<span class="diff-badge">有調整</span>':'')+'</dd></div>';
 }).join('');
 const detail=r.errors.length?'<ul>'+r.errors.map(([key,msg])=>'<li>'+esc(preset.fields.find(f=>f[0]===key)[1])+'：'+esc(msg)+'</li>').join('')+'</ul>':'<p class="sub">規則通過。'+(r.score?'模型距離 '+r.score.distance.toFixed(2)+'；參考 '+r.score.n+' 筆，距離不是機率。':'沒有可用的模型分數。')+'</p>';
 const approve=r.state==='review'?'<button class="btn" type="button" data-inspector-review="'+r.index+'">'+(r.approved?'撤銷人工放行':'確認後允許匯出')+'</button>':r.state==='blocked'?'<button class="btn" type="button" disabled aria-describedby="'+(mobile?'mobile-':'')+'blocked-note">不可人工放行</button><p class="inline-note" id="'+(mobile?'mobile-':'')+'blocked-note">規則錯誤須回來源更正。</p>':'';
 return '<aside class="panel inspector" aria-label="差異檢視器"><header><div><h2 '+(mobile?'id="dialog-title"':'')+'>差異檢視器</h2><span class="id">'+cell(r.norm.id)+'</span> · '+badge(r)+'</div>'+(mobile?'<button type="button" class="inspector-close">關閉檢視器</button>':'')+'</header><div class="panel-body"><p class="sub">來源 '+r.meta.order+' / #'+r.meta.row+' · '+esc(r.meta.name)+'</p><h3>來源原值 → 標準值</h3><dl class="inspector-list">'+diffs+'</dl><h3>判定理由</h3>'+detail+approve+'</div></aside>';
}
function overview(a){
 const filtered=displayRows(a);
 const record=filtered.find(r=>r.index===state.selected)??filtered[0];
 const cols=columnDefs.map(([k,label],i)=>{
  const current=state.sort?.[0]===k, dir=current?state.sort[1]:0;
  return '<th scope="col" class="'+(i>=3&&i<=5?'numeric':'')+'"'+(dir?' aria-sort="'+(dir>0?'ascending':'descending')+'"':'')+'><button class="row-sort" type="button" data-sort="'+k+'" aria-label="'+label+'排序">'+label+'<span aria-hidden="true">'+(dir>0?'↑':dir<0?'↓':'↕')+'</span></button></th>';
 }).join('');
 const rows=filtered.map(r=>'<tr role="row" class="'+(r===record?'is-selected':'')+'"><td role="cell" class="id first-cell"><button type="button" data-row="'+r.index+'" tabindex="'+(r===record?'0':'-1')+'" aria-label="檢視 '+esc(r.norm.id||'無編號')+'，來源 '+r.meta.order+' 第 '+r.meta.row+' 筆">'+esc(r.norm.id||'（無編號）')+'</button><span class="rownum">來源 '+r.meta.order+' · #'+r.meta.row+'</span></td><td role="cell">'+esc(r.norm.area||'—')+' ／ '+esc(r.norm.category||'—')+'</td><td role="cell" class="date">'+esc(r.norm.date||'—')+'</td><td role="cell" class="amount">'+fmt(r.norm.duration)+'</td><td role="cell" class="amount">'+fmt(r.norm.cost)+'</td><td role="cell" class="score">'+(r.score?r.score.distance.toFixed(2):'—')+'</td><td role="cell">'+badge(r)+'</td></tr>').join('');
 return '<div class="grid-and-inspector"><section class="panel table-panel"><div class="head"><h2 class="section-title">整併明細</h2><div class="tools-row"><label for="filter">依狀態篩選</label><select id="filter">'+[['all','全部'],['pass','直接通過'],['review','AI 覆核'],['blocked','規則阻擋']].map(([k,l])=>'<option value="'+k+'" '+(k===state.filter?'selected':'')+'>'+l+'</option>').join('')+'</select></div></div><div class="table-wrap" tabindex="0" aria-label="整併明細資料表，窄螢幕可捲動"><table role="table" class="grid-table"><thead role="rowgroup"><tr role="row">'+cols+'</tr></thead><tbody role="rowgroup">'+rows+'</tbody></table></div>'+(rows?'':'<p class="empty">沒有符合條件的資料。</p>')+'<div class="table-foot"><span>顯示 '+filtered.length+' 筆 · 預覽上限 300</span><span>可匯出 '+a.eligible.length+' 筆</span></div></section>'+inspectRow(record)+'</div><dialog class="row-dialog" aria-labelledby="dialog-title">'+(state.inspectorOpen?inspectRow(record,true):'')+'</dialog><details class="panel chart-disclosure"><summary>異常訊號分布</summary><p class="sub">最多顯示 60 筆有效距離，直條為各距離區間筆數；距離不是機率。</p><div class="chart-shell">'+chart(a)+'</div></details>';
}
function mapping(a){
 const src=state.sources[state.sourceIndex];
 const options=(value)=>'<option value="">— 不對應 —</option>'+src.headers.map(h=>'<option '+(h===value?'selected ':'')+'value="'+esc(h)+'">'+esc(h)+'</option>').join('');
 const maps=preset.fields.map(([key,label])=>'<label class="map-row"><span><b>'+label+'</b><small>'+key+' · 必填</small></span><select data-map="'+key+'" aria-label="'+label+'的來源欄位">'+options(src.mapping[key])+'</select><span class="sample">樣本：'+esc(src.rows[0]?.[src.mapping[key]]??'—')+'</span></label>').join('');
 const checks=[['dedupe','跨來源案件編號去重','同編號保留第一筆，後續留待修正；不自動合併。'],['normalizeStatus','正規化狀態別名','例如「結案」→「已完成」，未知狀態仍會阻擋。'],['ai','啟用異常提示','只對通過規則且有足夠參考資料的類別評分。']];
 return '<div class="work-grid"><section class="panel config"><h2 class="section-title">標準欄位映射</h2><p class="sub">每一個來源各自對應。合併後使用同一份匯出格式。</p><div class="tools-row" style="margin-top:10px"><label for="mapping-source">編輯來源</label><select id="mapping-source">'+state.sources.map((s,i)=>'<option value="'+i+'" '+(i===state.sourceIndex?'selected':'')+'>'+String(i+1).padStart(2,'0')+' · '+esc(s.name)+' ('+s.rows.length+' 筆)</option>').join('')+'</select></div><div class="map-rows">'+maps+'</div>'+button('重新自動對應','auto-map','map','small')+(state.sources.length>1?' '+button('移除此來源','remove-source','','small'):'')+'<div class="map-footer">設定立即套用 · 變更規則或欄位會重設人工放行紀錄。日期採西元年，支援連字號或斜線。</div></section>'+
 '<section class="panel config" id="rules-panel" tabindex="-1"><div class="rule-head"><div><h2 class="section-title">資料檢核策略</h2><p class="sub">明確規則與統計訊號分開</p></div><span class="pill">可配置</span></div><div class="switches">'+checks.map(([k,title,desc])=>'<label class="switch"><input type="checkbox" data-toggle="'+k+'" '+(state[k]?'checked':'')+'><span><b>'+title+'</b><small>'+desc+'</small></span></label>').join('')+'</div><div class="switches"><label for="cutoff" class="rule-head"><b>異常覆核距離</b><output id="cutoff-display" for="cutoff">'+state.cutoff.toFixed(1)+'</output></label><input id="cutoff" class="slider" type="range" min="1" max="8" step="0.1" value="'+state.cutoff+'" '+(state.ai?'':'disabled')+'><div class="rule-head kicker"><span>1.0 · 更敏感</span><span>8.0 · 更保守</span></div><p class="inline-note">目前規則阻擋 '+a.blocked+' 筆、模型標記 '+a.review+' 筆。必填、日期、非負天數／金額及狀態清單始終啟用。</p></div></section></div>';
}
function review(a){
 const records=a.results.filter(r=>r.state!=='pass').slice(0,120);
 const card=(r)=>{
  const source='來源 '+r.meta.order+' · #'+r.meta.row+' · '+esc(r.norm.category||'未知類別');
  let body=r.state==='blocked'?'<ul>'+r.errors.map(([key,msg])=>'<li>'+esc(preset.fields.find(x=>x[0]===key)[1])+': '+esc(msg)+'</li>').join('')+'</ul>':'<div class="data"><div>天數 / 參考中位<b>'+fmt(r.norm.duration)+' / '+fmt(r.score.center[0])+'</b></div><div>金額 / 參考中位<b>'+fmt(r.norm.cost)+' / '+fmt(r.score.center[1])+'</b></div></div><p>異常距離 '+r.score.distance.toFixed(2)+' · 此類別參考基線 '+r.score.n+' 筆</p>';
  if(r.state==='blocked')body+='<p>回來源更正後再重新匯入；此介面不直接改寫來源資料。</p>';
  else body+=button(r.approved?'撤銷人工放行':'確認後允許匯出','toggle-review-'+r.index,'review');
  return '<section class="panel review-card"><div class="top"><h3>'+esc(r.norm.id||'無編號資料')+'</h3>'+badge(r)+'</div><p>'+source+'</p>'+body+'</section>';
 };
 return '<p class="inline-note">此頁顯示 AI 覆核與規則阻擋；人工只能放行模型標記，不得覆寫必填或格式錯誤。紀錄僅存在本頁工作階段，重新整理會清除。</p>'+
 (records.length?'<div class="review-list">'+records.map(card).join('')+'</div>':'<div class="panel empty">目前沒有需處理的資料。</div>')+(records.length<a.review+a.blocked?'<p class="inline-note">最多預覽 120 筆待處理資料；匯出檢核報告可取得完整統計。</p>':'');
}
function report(a){
 const fitted=[...model].map(([category,g])=>'<tr><td>'+esc(category)+'</td><td>'+g.n+'</td><td>'+fmt(g.center[0])+' / '+fmt(g.center[1])+'</td><td>'+fmt(g.scale[0])+' / '+fmt(g.scale[1])+'</td></tr>').join('');
 const missing=a.results.filter(r=>r.state==='pass'&&!r.score).length;
 return '<div class="report-grid"><section class="panel"><h2 class="section-title">匯出交付包</h2><p>僅輸出目前可匯出的 '+a.eligible.length+' 筆標準資料。每筆含來源序號與資料列；規則阻擋或尚未人工放行的資料不輸出。</p><div class="actions">'+button('標準 CSV','csv','download','',!a.eligible.length)+button('標準 JSON','json','download','',!a.eligible.length)+button('完整檢核報告 JSON','internal-report','report')+'</div><p>檢核報告只含統計、規則、映射與處理追蹤序號，不含來源欄位值。標準資料檔包含匯入資料，請自行控制用途。</p><hr style="border:0;border-top:1px solid #dce8e9;margin:14px 0"><h3 class="section-title">跨工具交換</h3><p>只有內建合成資料可以匯出給成果文件助手的摘要；不含欄位、檔名、案件編號或原始內容。</p>'+button('匯出合成 QA 證據','qa-export','download','',!state.demo)+'</section>'+
 '<section class="panel"><h2 class="section-title">模型基線與限制</h2><p>用各類合成正常樣本擬合中位數與尺度。每個欄位以 1.4826 × MAD 標準化，再計算處理天數與金額的二維距離；類別至少 8 筆參考。</p><div class="report-block">距離 ≥ '+state.cutoff.toFixed(1)+'  →  人工覆核\n政策／格式錯誤 → 規則阻擋\n通過規則但未計分 → '+missing+' 筆</div><table class="baseline-table"><thead><tr><th>類別</th><th>樣本</th><th>中位數 天 / 元</th><th>尺度 天 / 元</th></tr></thead><tbody>'+fitted+'</tbody></table><p>無機關實際資料，不保證準確率或可直接部署；新類別因無基線不計分，匯出前應另查。距離非機率。真正部署需合法參考資料、覆核責任、權限及復原測試。</p></section></div>';
}
function render(focus){
 const a=results(),widgets={overview,mapping,review,report};
 const sourceLabel=state.sources.map(s=>s.name).join(' ＋ ');
 const labels={overview:'資料品管總覽',mapping:'欄位與規則',review:'人工覆核佇列',report:'報告與匯出'};
 const waiting=a.total-a.blocked-a.eligible.length;
 const pipeline=[
  ['overview','來源',state.sources.length+' 檔','檢核總覽01',''],
  ['mapping','映射',preset.fields.length+' 欄','欄位與規則02',''],
  ['rules','規則',a.blocked+' 阻擋','規則定位','rule-count'],
  ['review','覆核',waiting+' 待覆核','人工覆核03','review-count'],
  ['report','匯出',a.eligible.length+' 筆','報告與匯出04','']
 ];
 const stages=pipeline.map(([k,label,value,accessible,kind])=>'<button type="button" class="nav-btn '+(state.stage===k?'active':'')+'" '+(k==='rules'?'data-pipeline-rules':'data-tab="'+k+'"')+' aria-label="'+accessible+'" '+(state.stage===k?'aria-current="page"':'')+'><b>'+label+'</b><span class="count '+kind+'" aria-hidden="true">'+value+'</span></button>').join('');
 const metric=(label,value,kind='')=>'<span class="metric '+kind+'">'+label+' <strong>'+fmt(value)+'</strong></span>';
 const oldGrid=document.querySelector('.table-wrap'), scroll=oldGrid?.scrollTop??0;
 document.querySelector('#app').innerHTML='<div class="app"><div class="workarea"><header class="topbar"><div class="batch"><strong class="brand">合流</strong><span class="slash" aria-hidden="true">/</span><h1>'+labels[state.tab]+'</h1><span class="batch-name">・'+esc(preset.title)+'</span></div><div class="actions"><details class="help"><summary>快捷鍵</summary><p class="keynotes"><kbd>j</kbd>/<kbd>k</kbd> 或 <kbd>↑</kbd>/<kbd>↓</kbd>移列；<kbd>Enter</kbd> 查看差異；<kbd>a</kbd> 放行所選模型待覆核列；<kbd>/</kbd> 聚焦篩選。</p></details>'+button('加入 CSV / JSON','import','upload')+button('匯出報告','go-report','download','primary')+'<input type="file" id="upload" accept=".csv,.json,text/csv,application/json" hidden></div></header>'+
 '<nav class="pipeline-nav" aria-label="主要導覽">'+stages+'</nav><div class="pipeline-mobile"><label for="work-stage">工作階段</label><select id="work-stage">'+pipeline.map(([k,lab,n])=>'<option value="'+k+'" '+(k===state.stage?'selected':'')+'>'+lab+' · '+n+'</option>').join('')+'</select></div>'+
 '<main class="main" id="main-content" tabindex="-1"><div class="sourcebar"><div class="segment" role="group" aria-label="資料場域">'+Object.entries(PRESETS).map(([k,p])=>'<button type="button" data-profile="'+k+'" class="'+(k===state.key?'active':'')+'" aria-pressed="'+(k===state.key)+'">'+esc(p.title)+'</button>').join('')+'</div><div class="source-name" title="'+esc(sourceLabel)+'"><b>'+state.sources.length+' 個來源：</b>'+esc(sourceLabel)+'</div></div>'+
 (state.error?'<p class="notice error" role="alert">'+esc(state.error)+'</p>':'')+widgets[state.tab](a)+
 '<p class="foot">資料只在此分頁處理；模型距離不是機率，不替代人工覆核。'+(!state.demo?' 匯入檔案未用來重新擬合模型。':'')+'</p></main><footer class="statusbar" aria-label="批次狀態"><div class="batch-counts">'+metric('資料筆數',a.total)+metric('直接通過',a.pass,'good')+metric('待人工覆核',waiting,'review')+metric('規則阻擋',a.blocked,'bad')+'</div><span class="batch-note">'+(state.demo?'合成資料':'本機匯入')+' · 本機處理、不外傳 · '+(state.ai?'覆核門檻 '+state.cutoff.toFixed(1):'異常提示關閉')+' · '+a.transformed+' 筆格式已調整</span></footer></div></div>';
 const grid=document.querySelector('.table-wrap');if(grid)grid.scrollTop=scroll;
 const dialog=document.querySelector('.row-dialog');
 if(dialog&&state.inspectorOpen&&smallScreen()){
  dialog.addEventListener('close',()=>{if(!state.inspectorOpen)return;state.inspectorOpen=false;render('[data-row="'+state.selected+'"]');});
  dialog.showModal();
  if(focus?.includes('inspector-review'))dialog.querySelector(focus)?.focus();
 }else if(focus){
  const target=document.querySelector(focus);target?.focus({preventScroll:true});
  if(target?.matches('[data-row]'))target.scrollIntoView({block:'nearest',inline:'nearest'});
 }
}
function switchTab(tab){
 state.stage=tab;state.tab=tab==='rules'?'mapping':tab;state.inspectorOpen=false;
 render(smallScreen()?'#work-stage':tab==='rules'?'[data-pipeline-rules]':'[data-tab="'+tab+'"]');
 window.scrollTo(0,0);
 if(tab==='rules'){const rules=document.querySelector('#rules-panel');rules?.focus({preventScroll:true});rules?.scrollIntoView({block:'nearest'});}
}
function clearApprovals(){state.allow.clear();state.queue.clear();}
function download(data,name,type){
 const url=URL.createObjectURL(new Blob([data],{type}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 announce('開始下載 '+name);
}
function evidence(a){return {schema:'portfolio.qa-evidence.v1',profile:'policy',synthetic:true,result:{totalRows:a.total,passedRows:a.eligible.length,reviewRows:a.total-a.blocked-a.eligible.length,rejectedRows:a.blocked}};}
function deliver(action){
 const a=results();
 const rows=a.eligible.map(r=>({...r.norm,source_order:r.meta.order,source_row:r.meta.row}));
 const headers=[...REQUIRED,'source_order','source_row'];
 const asJSON=(data,file)=>download(JSON.stringify(data,null,2)+'\n',file,'application/json;charset=utf-8');
 if(action==='csv'&&rows.length)download(makeCSV(headers,rows),'合流-標準資料.csv','text/csv;charset=utf-8');
 if(action==='json'&&rows.length)asJSON(rows,'合流-標準資料.json');
 if(action==='qa-export'&&state.demo)asJSON(evidence(a),'qa-evidence.json');
 if(action==='internal-report'){
  const {result}=evidence(a);
  asJSON({schema:'confluence.internal-report.v1',domain:state.key,synthetic:state.demo,counts:result,
   normalization:{mappedSources:state.sources.map((s,i)=>({source:i+1,rows:s.rows.length,mapping:s.mapping})),transformedRows:a.transformed},
   rules:{normalizeStatus:state.normalizeStatus,dedupe:state.dedupe,ai:state.ai,cutoff:state.cutoff},
   reviewHistory:[...state.queue.values()],
   records:a.results.map(r=>({source:r.meta.order,sourceRow:r.meta.row,state:r.state,approved:r.approved,ruleFields:r.errors.map(([k])=>k)}))
  },'合流-檢核報告.json');
 }
}
function toggleReview(i,focus){
 const row=results().results[i];
 if(row?.state!=='review')return;
 if(state.allow.has(i))state.allow.delete(i);else state.allow.add(i);
 state.queue.set(state.seq,{sequence:++state.seq,source:row.meta.order,sourceRow:row.meta.row,decision:state.allow.has(i)?'allow':'revoke'});
 render(focus);announce(state.allow.has(i)?'已標記人工放行':'已撤銷人工放行');
}
function selectRow(i,open){
 state.selected=i;state.inspectorOpen=open&&smallScreen();
 render('[data-row="'+i+'"]');
}
document.body.addEventListener('keydown',(e)=>{
 if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.target.matches('input,select,textarea,[contenteditable]')||e.target.closest('dialog'))return;
 if(e.key==='/'&&state.tab==='overview'){e.preventDefault();document.querySelector('#filter')?.focus();return;}
 if(!e.target.closest('.table-wrap,.grid-and-inspector > .inspector'))return;
 const rows=[...document.querySelectorAll('[data-row]')], active=rows.findIndex(b=>b===e.target||b.tabIndex===0);
 if(active<0)return;
 if(['j','k','ArrowUp','ArrowDown'].includes(e.key)){
  e.preventDefault();const v=Math.min(rows.length-1,Math.max(0,active+(['j','ArrowDown'].includes(e.key)?1:-1)));
  selectRow(+rows[v].dataset.row,false);
 }
 if(e.key==='a'){
  const index=Number(rows[active].dataset.row), row=results().results[index];
  if(row?.state==='review'&&!row.approved){e.preventDefault();toggleReview(index,'[data-row="'+index+'"]');}
 }
 if(e.key==='Enter'&&e.target.matches('.table-wrap')){
  e.preventDefault();selectRow(+rows[active].dataset.row,true);
 }
});
document.body.addEventListener('click',(e)=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.matches('[data-pipeline-rules]')){switchTab('rules');return;}
 if(b.dataset.sort){
  const key=b.dataset.sort;state.sort=[key,state.sort?.[0]===key?-state.sort[1]:1];
  render('[data-sort="'+key+'"]');return;
 }
 if(b.dataset.row!=null){selectRow(Number(b.dataset.row),true);return;}
 if(b.dataset.inspectorReview!=null){
  const i=Number(b.dataset.inspectorReview);toggleReview(i,'[data-inspector-review="'+i+'"]');return;
 }
 if(b.matches('.inspector-close')){b.closest('dialog')?.close();return;}
 const tab=b.dataset.tab,key=b.dataset.profile,action=b.dataset.action;
 if(tab){switchTab(tab);return;}
 if(key&&key!==state.key){
  if(!state.demo&&!confirm('切換場域會回到該場域的合成資料並清除目前匯入。要繼續嗎？'))return;
  reset(key);render('[data-profile="'+key+'"]');announce('已切換至 '+preset.title);return;
 }
 if(action==='import'){document.querySelector('#upload').click();return;}
 if(action==='go-report'){switchTab('report');return;}
 if(action==='auto-map'){const s=state.sources[state.sourceIndex];s.mapping=mappingFor(preset,s.headers);clearApprovals();render('[data-action="auto-map"]');return;}
 if(action==='remove-source'){
  if(state.sources.length>1&&confirm('移除這個來源及本次覆核紀錄？')){state.sources.splice(state.sourceIndex,1);state.sourceIndex=0;clearApprovals();render('#mapping-source');}
  return;
 }
 if(action?.startsWith('toggle-review-')){toggleReview(Number(action.split('-').at(-1)),'[data-action="'+action+'"]');return;}
 if(action)deliver(action);
});
document.body.addEventListener('input',(e)=>{if(e.target.id==='cutoff')document.querySelector('#cutoff-display').value=Number(e.target.value).toFixed(1);});
document.body.addEventListener('change',async(e)=>{
 const el=e.target,k=el.dataset.map,t=el.dataset.toggle;
 if(el.id==='work-stage'){switchTab(el.value);return;}
 if(el.id==='filter'){state.filter=el.value;render('#filter');return;}
 if(el.id==='mapping-source'){state.sourceIndex=Number(el.value);render('#mapping-source');return;}
 if(k){state.sources[state.sourceIndex].mapping[k]=el.value;clearApprovals();render('[data-map="'+k+'"]');return;}
 if(t){state[t]=el.checked;clearApprovals();render('[data-toggle="'+t+'"]');return;}
 if(el.id==='cutoff'){state.cutoff=Number(el.value);clearApprovals();render('#cutoff');return;}
 if(el.id==='upload'&&el.files?.length){
  const file=el.files[0], seq=state.seq, key=state.key;
  try{
   if(file.size>MAX_SIZE)throw Error('檔案超過 2 MB。');
   const kind=file.name.toLowerCase().split('.').pop();
   if(kind!=='csv'&&kind!=='json')throw Error('請選擇 .csv 或 .json。');
   const data=(kind==='csv'?parseCSV:parseJSON)(await file.text());
   if(key!==state.key||seq!==state.seq||!el.isConnected)return;
   const existing=state.demo?[]:state.sources;
   if(existing.length>=12)throw Error('來源最多 12 個。');
   if(data.rows.length+existing.reduce((n,s)=>n+s.rows.length,0)>MAX_ROWS)throw Error('整批來源最多合計 10,000 筆。');
   state.sources=[...existing,{...data,name:file.name,mapping:mappingFor(preset,data.headers)}];
   state.sourceIndex=state.sources.length-1;state.demo=false;state.error='';clearApprovals();switchTab('mapping');announce('已匯入 '+data.rows.length+' 筆');
  }catch(err){
   if(!el.isConnected)return;
   state.error=err.message;render('[data-action="import"]');
  }
 }
});
render();
