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
const state={key:'facilities',tab:'overview',cutoff:3.6,dedupe:true,normalizeStatus:true,ai:true,filter:'all',allow:new Set(),queue:new Map(),error:'',sourceIndex:0,demo:true,seq:0};
let preset=PRESETS[state.key], model;
function announce(s){document.querySelector('#announcement').textContent=s;}
function reset(key){
 preset=PRESETS[state.key=key]; model=fitReference(references(preset));
 state.sources=demoSources(preset).map(src=>({...src,mapping:mappingFor(preset,src.headers)}));
 state.allow.clear();state.queue.clear();state.cutoff=3.6;state.dedupe=true;state.normalizeStatus=true;state.ai=true;state.sourceIndex=0;state.filter='all';state.error='';state.demo=true;
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
 const chartable=a.results.filter(r=>r.score), batch=chartable.slice(0,60);
 const ceiling=Math.max(5,state.cutoff+1,...batch.map(r=>Math.ceil(r.score.distance)));
 const width=570,h=167,left=67,right=550,top=13,bottom=137;
 const y=(score)=>bottom-(bottom-top)*score/ceiling;
 const xx=(n)=>left+(right-left)*(n+.5)/Math.max(1,batch.length);
 const yaxis=[0,ceiling/3,ceiling*2/3,ceiling];
 const grid=yaxis.map(v=>'<line class="cgrid" x1="'+left+'" x2="'+right+'" y1="'+y(v)+'" y2="'+y(v)+'"/><text class="ctext" x="'+(left-12)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v.toFixed(v===0?0:1)+'</text>').join('');
 const cut=state.ai?'<line x1="'+left+'" x2="'+right+'" y1="'+y(state.cutoff)+'" y2="'+y(state.cutoff)+'" stroke="#c9dedc" stroke-dasharray="6 4"/><text class="ctext" x="'+(left+3)+'" y="'+(y(state.cutoff)-5)+'">覆核門檻 '+state.cutoff.toFixed(1)+'</text>':'';
 const markers=batch.map((r,i)=>{
  const x=xx(i),yp=y(r.score.distance), selected=r.state==='review';
  return '<line x1="'+x+'" x2="'+x+'" y1="'+yp+'" y2="'+bottom+'" stroke="'+(selected?'#a77b4e':'#2f6263')+'"/><circle cx="'+x+'" cy="'+yp+'" r="'+(selected?5:3.6)+'" fill="'+(selected?'#f8bc6a':'#7ce5cc')+'" stroke="#0d2633"><title>'+esc(r.norm.id)+'：'+r.score.distance.toFixed(2)+'</title></circle>';
 }).join('');
 const idxLabel=batch.length?'<text class="ctext" x="'+left+'" y="160">首筆</text><text class="ctext" x="'+right+'" y="160" text-anchor="end">第 '+batch.length+' 筆已評分</text>':'<text class="ctext" x="310" y="80" text-anchor="middle">這一批沒有可用分數</text>';
 return '<svg viewBox="0 0 '+width+' '+h+'" class="chart" role="img" aria-label="異常距離圖：顯示 '+batch.length+' 筆樣本及覆核門檻">'+grid+cut+markers+'<line class="cbase" x1="'+left+'" x2="'+right+'" y1="'+bottom+'" y2="'+bottom+'"/>'+idxLabel+'</svg>';
}
function overview(a){
 const metric=(label,n,note,kind='')=>'<article class="metric '+kind+'"><span class="tag"><i class="color-dot"></i>'+label+'</span><strong>'+fmt(n)+'</strong><small>'+note+'</small></article>';
 const filtered=a.results.filter(r=>state.filter==='all'||state.filter===r.state).slice(0,300);
 const rows=filtered.map(r=>'<tr><td class="id">'+esc(r.norm.id||'（無編號）')+'<br><span class="rownum">來源 '+r.meta.order+' · #'+r.meta.row+'</span></td><td>'+esc(r.norm.area||'—')+' ／ '+esc(r.norm.category||'—')+'</td><td>'+esc(r.norm.date||'—')+'</td><td class="amount">'+fmt(r.norm.duration)+' 天</td><td class="amount">'+fmt(r.norm.cost)+'</td><td class="score">'+(r.score?r.score.distance.toFixed(2):'—')+'</td><td>'+badge(r)+'</td></tr>').join('');
 const divider=a.total||1;
 return '<div class="summary">'+metric('來源資料',a.total,state.sources.length+' 個來源 · 匯入後原始筆數')+metric('直接通過',a.pass,'規則通過 · 不含人工放行','good')+metric('待人工覆核',a.review-a.results.filter(r=>r.approved).length,'模型標記 · 是否匯出由人判定','review')+metric('規則阻擋',a.blocked,'缺漏、無效日期、數值或編號','bad')+'</div>'+
 '<div class="split"><section class="panel dark"><div class="head"><div><h2 class="section-title">異常訊號分布</h2><p>以同類別正常資料擬合；距離不是機率</p></div><span class="pill">Median / MAD</span></div><div class="chart-shell">'+chart(a)+'</div><div class="legend"><span><b></b>規則通過的計分資料</span><span><b class="orange"></b>需人工覆核</span><span><b class="dash"></b>可調距離門檻</span></div></section>'+
 '<section class="panel"><div class="head"><div><h2 class="section-title">從匯入到可交付</h2><p>統計同一批次，各項不是逐階段扣減</p></div><span class="pill">前 / 後</span></div><div class="pipeline"><div class="pipe-row"><span class="step">01</span><strong>來源匯入</strong><em>'+a.total+'</em></div><div class="pipe-row"><span class="step">02</span><strong>其中格式已調整</strong><em>'+a.transformed+'</em></div><div class="pipe-row"><span class="step">03</span><strong>通過明確規則</strong><em>'+(a.pass+a.review)+'</em></div><div class="pipe-row"><span class="step">04</span><strong>目前可匯出</strong><em>'+a.eligible.length+'</em></div><div class="stack" aria-label="通過／待覆核／阻擋比例"><i style="width:'+(100*a.eligible.length/divider)+'%"></i><i class="review" style="width:'+(100*(a.pass+a.review-a.eligible.length)/divider)+'%"></i><i class="bad" style="width:'+(100*a.blocked/divider)+'%"></i></div><p class="sub">模型只提示人工查核，不覆蓋欄位規則。</p></div></section></div>'+
 '<section class="panel table-panel"><div class="head"><div><h2 class="section-title">整併明細</h2><p>每列保留來源序號及來源內資料列</p></div><div class="tools-row"><label for="filter">依狀態篩選</label><select id="filter">'+[['all','全部'],['pass','直接通過'],['review','AI 覆核'],['blocked','規則阻擋']].map(([k,l])=>'<option value="'+k+'" '+(k===state.filter?'selected':'')+'>'+l+'</option>').join('')+'</select></div></div>'+
 '<div class="table-wrap" tabindex="0" aria-label="整併明細資料表，窄螢幕可捲動"><table><thead><tr><th>資料 ID / 來源</th><th>行政區 ／ 類別</th><th>標準日期</th><th>天數</th><th>金額 NT$</th><th>距離</th><th>判定</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(filtered.length?'':'<p class="empty">沒有符合條件的資料。</p>')+'<div class="table-foot"><span>顯示 '+filtered.length+' 筆 · 預覽上限 300</span><span>可匯出 '+a.eligible.length+' 筆</span></div></section>';
}
function mapping(a){
 const src=state.sources[state.sourceIndex];
 const options=(value)=>'<option value="">— 不對應 —</option>'+src.headers.map(h=>'<option '+(h===value?'selected ':'')+'value="'+esc(h)+'">'+esc(h)+'</option>').join('');
 const maps=preset.fields.map(([key,label])=>'<label class="map-row"><span><b>'+label+'</b><small>'+key+' · 必填</small></span><select data-map="'+key+'" aria-label="'+label+'的來源欄位">'+options(src.mapping[key])+'</select></label>').join('');
 const checks=[['dedupe','跨來源案件編號去重','同編號保留第一筆，後續留待修正；不自動合併。'],['normalizeStatus','正規化狀態別名','例如「結案」→「已完成」，未知狀態仍會阻擋。'],['ai','啟用異常提示','只對通過規則且有足夠參考資料的類別評分。']];
 return '<div class="work-grid"><section class="panel config"><h2 class="section-title">標準欄位映射</h2><p class="sub">每一個來源各自對應。合併後使用同一份匯出格式。</p><div class="tools-row" style="margin-top:10px"><label for="mapping-source">編輯來源</label><select id="mapping-source">'+state.sources.map((s,i)=>'<option value="'+i+'" '+(i===state.sourceIndex?'selected':'')+'>'+String(i+1).padStart(2,'0')+' · '+esc(s.name)+' ('+s.rows.length+' 筆)</option>').join('')+'</select></div><div class="map-rows">'+maps+'</div>'+button('重新自動對應','auto-map','map','small')+(state.sources.length>1?' '+button('移除此來源','remove-source','','small'):'')+'<div class="map-footer">設定立即套用 · 變更規則或欄位會重設人工放行紀錄。日期採西元年，支援連字號或斜線。</div></section>'+
 '<section class="panel config"><div class="rule-head"><div><h2 class="section-title">資料檢核策略</h2><p class="sub">明確規則與統計訊號分開</p></div><span class="pill">可配置</span></div><div class="switches">'+checks.map(([k,title,desc])=>'<label class="switch"><input type="checkbox" data-toggle="'+k+'" '+(state[k]?'checked':'')+'><span><b>'+title+'</b><small>'+desc+'</small></span></label>').join('')+'</div><div class="switches"><label for="cutoff" class="rule-head"><b>異常覆核距離</b><output id="cutoff-display" for="cutoff">'+state.cutoff.toFixed(1)+'</output></label><input id="cutoff" class="slider" type="range" min="1" max="8" step="0.1" value="'+state.cutoff+'" '+(state.ai?'':'disabled')+'><div class="rule-head kicker"><span>1.0 · 更敏感</span><span>8.0 · 更保守</span></div><p class="inline-note">目前規則阻擋 '+a.blocked+' 筆、模型標記 '+a.review+' 筆。必填、日期、非負天數／金額及狀態清單始終啟用。</p></div></section></div>';
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
 const a=results(), widgets={overview,mapping,review,report};
 const sourceLabel=state.sources.map(s=>s.name).join(' ＋ ');
 const labels={overview:['DATA QUALITY CONTROL','資料品管總覽','把不同格式轉為可交付資料，同時保留被擋住的筆數與原因。'],mapping:['FIELD CONTRACT','欄位與規則','從各來源欄名轉成同一份資料契約，再分開處理明確規則與模型提示。'],review:['HUMAN IN THE LOOP','人工覆核佇列','讀取偏離基線的原因，再由有權責的人員決定是否允許匯出。'],report:['VERIFIABLE DELIVERY','報告與匯出','交付乾淨資料與檢核摘要，保留來源線索，不混入未處理的錯誤。']};
 const [eye,title,desc]=labels[state.tab];
 document.querySelector('#app').innerHTML='<div class="app"><aside class="sidebar"><div class="brand"><div class="brand-mark">'+ico('logo')+'</div><div><strong>合流</strong><small>CONFLUENCE / DATA QA</small></div></div><p class="nav-caption">WORKSPACE · 工作台</p><nav class="nav-list" aria-label="主要導覽">'+nav.map(([k,l,i],n)=>'<button type="button" class="nav-btn '+(state.tab===k?'active':'')+'" data-tab="'+k+'" '+(state.tab===k?'aria-current="page"':'')+'>'+ico(i)+esc(l)+'<span class="ix">0'+(n+1)+'</span></button>').join('')+'</nav><div class="sidebar-inset"><strong><span class="signal"></span>本機驗證環境</strong><small>資料只在此分頁處理<br>不傳送至伺服器、無需帳號</small></div><div class="sidebar-foot"><b>合成資料展示</b>PUBLIC DATA LAB / v1.0</div></aside>'+
 '<div class="workarea"><header class="topbar"><div><b>公共資料整合</b><span class="slash">/</span>'+esc(preset.title)+'</div><div class="pills"><span class="pill synth">● '+(state.demo?'合成資料':'已匯入 · 本機')+'</span><span class="pill">無外部服務</span></div></header>'+
 '<main class="main" id="main-content"><div class="hero"><div><div class="eyebrow">'+eye+'</div><h1>'+title+'</h1><p>'+desc+'</p></div><div class="actions">'+button('加入 CSV / JSON','import','upload')+button('匯出報告','go-report','download','primary')+'<input type="file" id="upload" accept=".csv,.json,text/csv,application/json" hidden></div></div>'+
 '<div class="sourcebar"><div class="segment" role="group" aria-label="資料場域">'+Object.entries(PRESETS).map(([k,p])=>'<button type="button" data-profile="'+k+'" class="'+(k===state.key?'active':'')+'" aria-pressed="'+(k===state.key)+'">'+esc(p.title)+'</button>').join('')+'</div><div class="source-name" title="'+esc(sourceLabel)+'"><span class="signal"></span><b>'+state.sources.length+' 個來源：</b>'+esc(sourceLabel)+'</div></div>'+
 (state.error?'<p class="notice error" role="alert">'+esc(state.error)+'</p>':'')+widgets[state.tab](a)+
 '<p class="foot">適用於有欄位契約、可取得合法來源且需人工驗收的整合流程。此為作品集原型，不代表已通過機關驗收。'+(!state.demo?' 新上傳檔案未用來重新擬合模型。':'')+'</p></main></div></div>';
 if(focus)document.querySelector(focus)?.focus({preventScroll:true});
}
function switchTab(tab){state.tab=tab;render('[data-tab="'+tab+'"]');window.scrollTo(0,0);}
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
document.body.addEventListener('click',(e)=>{
 const b=e.target.closest('button');if(!b)return;
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
 if(action?.startsWith('toggle-review-')){
  const i=Number(action.split('-').at(-1)), row=results().results[i];
  if(row?.state!=='review')return;
  if(state.allow.has(i))state.allow.delete(i);else state.allow.add(i);
  state.queue.set(state.seq,{sequence:++state.seq,source:row.meta.order,sourceRow:row.meta.row,decision:state.allow.has(i)?'allow':'revoke'});
  render('[data-action="'+action+'"]');announce(state.allow.has(i)?'已標記人工放行':'已撤銷人工放行');return;
 }
 if(action)deliver(action);
});
document.body.addEventListener('input',(e)=>{if(e.target.id==='cutoff')document.querySelector('#cutoff-display').value=Number(e.target.value).toFixed(1);});
document.body.addEventListener('change',async(e)=>{
 const el=e.target,k=el.dataset.map,t=el.dataset.toggle;
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
