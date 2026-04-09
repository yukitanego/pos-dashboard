/**
 * POS Dashboard Library v1.0
 * Self-contained JS library for rendering POS analysis dashboards.
 * Usage: POS.render('#app', data)
 * Requires: Chart.js 4.x, chartjs-plugin-annotation, Tailwind CSS (CDN)
 */
(function(global){
'use strict';
var POS={};

// --- Formatters ---
var fmt={
  yen:function(n){return '\u00a5'+Math.round(n).toLocaleString()},
  sen:function(n){return '\u00a5'+Math.round(n/1000).toLocaleString()+'\u5343\u5186'},
  num:function(n){return Math.round(n).toLocaleString()},
  pct:function(n){return n.toFixed(1)+'%'},
  man:function(n){return '\u00a5'+(n/10000).toFixed(0)+'\u4e07'},
  diff:function(n){return (n>=0?'+':'')+Math.round(n).toLocaleString()},
  diffYen:function(n){var a=Math.abs(Math.round(n));return (n>=0?'+\u00a5':'-\u00a5')+a.toLocaleString()},
  fmtDiff:function(val){
    var sign=val>=0?'+':'-',a=Math.abs(val);
    if(a>=1e6) return sign+'\u00a5'+(a/1e6).toFixed(1)+'M';
    return sign+'\u00a5'+(a/1e3).toFixed(0)+'K';
  }
};
POS._fmt=fmt;

// --- CSS injection ---
function injectCSS(){
  if(document.getElementById('pos-dash-css')) return;
  var s=document.createElement('style');s.id='pos-dash-css';
  s.textContent="body{font-family:'Noto Sans JP',sans-serif}"+
    ".tab-btn{transition:all .2s;border-bottom:2px solid transparent}"+
    ".tab-btn.active{border-color:#3B82F6;color:#3B82F6;background:#EFF6FF}"+
    ".tab-content{display:none}.tab-content.active{display:block}"+
    ".highlight-plus{background:#DCFCE7 !important}.highlight-plus:hover{background:#BBF7D0 !important}"+
    ".highlight-minus{background:#FEE2E2 !important}.highlight-minus:hover{background:#FECACA !important}"+
    ".data-bar{position:relative}"+
    ".data-bar .bar-bg{position:absolute;top:2px;left:0;bottom:2px;border-radius:2px;opacity:.25;pointer-events:none}"+
    ".data-bar .bar-val{position:relative;z-index:1}";
  document.head.appendChild(s);
}

// --- Insight generation (JS port of Python _gen_insights) ---
function genInsights(products){
  if(!products||!products.length) return {overview:[],tab:[]};
  var ts=0,tps=0,tq=0,tpq=0;
  for(var i=0;i<products.length;i++){
    ts+=products[i].s; tps+=products[i].ps;
    tq+=products[i].q; tpq+=products[i].pq;
  }
  var sy=tps>0?ts/tps*100:0, qy=tpq>0?tq/tpq*100:0;
  var diff=ts-tps, sign=diff>=0?'+':'';
  var byDiff=products.slice().sort(function(a,b){return b.sd-a.sd});
  var byGrowth=products.filter(function(p){return p.sy>0&&p.ps>0}).sort(function(a,b){return b.sy-a.sy});
  var ov=[];
  if(tps>0){
    var dStr=fmt.fmtDiff(diff);
    var line='<strong>\u524d\u671f\u6bd4'+sy.toFixed(1)+'%\uff08'+sign+dStr+'\uff09\u3002</strong>';
    if(Math.abs(sy-qy)>2){
      if(sy>qy) line+='\u6570\u91cf'+qy.toFixed(1)+'%\u306b\u5bfe\u3057\u91d1\u984d'+sy.toFixed(1)+'%\u3067\u3001\u5358\u4fa1\u4e0a\u6607\u3082\u5bc4\u4e0e\u3002';
      else line+='\u91d1\u984d'+sy.toFixed(1)+'%\u306b\u5bfe\u3057\u6570\u91cf'+qy.toFixed(1)+'%\u3067\u3001\u5358\u4fa1\u4e0b\u843d\u306e\u5f71\u97ff\u3042\u308a\u3002';
    }
    ov.push(line);
  }else{
    ov.push('<strong>\u58f2\u4e0a\u5408\u8a08 \u00a5'+(ts/1e6).toFixed(1)+'M\u3002</strong>\u524d\u671f\u30c7\u30fc\u30bf\u306a\u3057\u3002');
  }
  var plusShown={};
  for(var i=0;i<Math.min(2,byDiff.length);i++){
    var p=byDiff[i];
    if(p.sd>0&&tps>0){
      var dStr=fmt.fmtDiff(p.sd);
      var desc=i===0?'\u5727\u5012\u7684\u30d7\u30e9\u30b9\u5bc4\u4e0e':'\u5927\u5e45\u30d7\u30e9\u30b9';
      ov.push('<strong>'+p.n+'\u304c+'+dStr+'\u3067'+desc+'\u3002</strong>\u524d\u671f\u6bd4'+p.sy.toFixed(1)+'%\u3002');
      plusShown[p.n]=true;
    }
  }
  for(var i=0;i<byGrowth.length;i++){
    var p=byGrowth[i];
    if(!plusShown[p.n]&&p.sy>=150&&p.ps>100000){
      ov.push('<strong>'+p.n+'\u304c\u524d\u671f\u6bd4'+p.sy.toFixed(1)+'%\u3002</strong>');
      break;
    }
  }
  for(var i=byDiff.length-1;i>=Math.max(0,byDiff.length-2);i--){
    var p=byDiff[i];
    if(p.sd<0&&tps>0){
      var dStr=fmt.fmtDiff(p.sd);
      ov.push('<strong>'+p.n+'\u304c'+dStr+'\uff08'+p.sy.toFixed(1)+'%\uff09\u3067\u6700\u5927\u30de\u30a4\u30ca\u30b9\u3002</strong>');
      break;
    }
  }

  var tab=[];
  var aProds=products.filter(function(p){return p.r==='A'});
  if(aProds.length){
    var aShare=aProds[aProds.length-1].cp;
    var topNames=aProds.slice(0,3).map(function(p){return p.n}).join('\u30fb');
    var nA=aProds.length;
    if(nA<=5){
      var conc=aShare>=70?'\u8d85\u9ad8\u96c6\u4e2d\u69cb\u9020':'\u9ad8\u96c6\u4e2d\u69cb\u9020';
      tab.push('<strong>A\u30e9\u30f3\u30af'+nA+'\u54c1\u3067'+aShare.toFixed(1)+'%:</strong> '+topNames+'\u306e'+nA+'\u54c1\u304c\u58f2\u4e0a\u306e\u5927\u534a\u3002'+conc+'\u3002');
    }else{
      var top2Share=aProds.length>1?aProds[1].cp:aProds[0].cp;
      tab.push('<strong>A\u30e9\u30f3\u30af'+nA+'\u54c1\u3067'+aShare.toFixed(0)+'%:</strong> \u5206\u6563\u69cb\u9020\u3002\u4e0a\u4f4d2\u54c1\u3067\u3082'+top2Share.toFixed(1)+'%\u306e\u307f\u3002');
    }
  }
  var catDiff=diff, plusCount=0;
  for(var i=0;i<byDiff.length&&plusCount<3;i++){
    var p=byDiff[i];
    if(p.sd<=0||tps<=0) break;
    var dStr=fmt.fmtDiff(p.sd), extra='';
    if(catDiff!==0&&plusCount===0){
      var contrib=Math.abs(p.sd/catDiff*100);
      if(contrib>50) extra='\u30ab\u30c6\u30b4\u30ea\u6210\u9577\u984d\u306e'+contrib.toFixed(0)+'%\u30921\u54c1\u3067\u7a3c\u3050\u3002';
    }
    tab.push('<strong class="text-green-700">\u2605 '+p.n+':</strong> +'+dStr+'\uff08'+p.sy.toFixed(1)+'%\uff09\u3002'+extra);
    plusCount++;
  }
  var minusCount=0;
  for(var i=byDiff.length-1;i>=0&&minusCount<2;i--){
    var p=byDiff[i];
    if(p.sd>=0||tps<=0) break;
    var dStr=fmt.fmtDiff(p.sd);
    var label=minusCount===0?'\u6700\u5927\u30de\u30a4\u30ca\u30b9\u8981\u56e0\u3002':'';
    tab.push('<strong class="text-red-700">\u25bc '+p.n+':</strong> '+dStr+'\uff08'+p.sy.toFixed(1)+'%\uff09\u3002'+label);
    minusCount++;
  }
  var newProds=products.filter(function(p){return p.ps===0&&p.s>0});
  if(newProds.length){
    var newTotal=0;for(var i=0;i<newProds.length;i++) newTotal+=newProds[i].s;
    var dStr=fmt.fmtDiff(newTotal);
    var sorted=newProds.slice().sort(function(a,b){return b.s-a.s});
    var names=sorted.slice(0,3).map(function(p){return p.n}).join('\u3001');
    tab.push('<strong>\u65b0\u5546\u54c1'+newProds.length+'\u54c1\u304c\u5408\u8a08+'+dStr+'\u8ca2\u732e\u3002</strong>'+names+'\u7b49\u3002');
  }
  return {overview:ov.slice(0,5),tab:tab.slice(0,6)};
}

// --- Weekend/holiday detection ---
function buildWeekendFlags(dateKeys){
  return dateKeys.map(function(d){
    var dt=new Date(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6));
    var wd=dt.getDay();
    return wd===0||wd===6;
  });
}
function buildDateLabels(dateKeys,isWeekend){
  var wdN=['\u65e5','\u6708','\u706b','\u6c34','\u6728','\u91d1','\u571f'];
  return dateKeys.map(function(d,i){
    var dt=new Date(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6));
    var wd=dt.getDay();
    var l=d.slice(4,6)+'/'+d.slice(6);
    return isWeekend[i]?l+'('+wdN[wd]+')':l;
  });
}

// --- Weekend background plugin ---
function makeWeekendPlugin(isWeekend){
  return {
    id:'weekendBg',
    beforeDraw:function(chart){
      var ctx=chart.ctx,ca=chart.chartArea,x=chart.scales.x;
      if(!x||!ca) return;
      ctx.save();
      isWeekend.forEach(function(wk,i){
        if(!wk) return;
        var hw=x.width/(x.ticks.length)/2;
        var x0=x.getPixelForValue(i)-hw;
        var x1=x.getPixelForValue(i)+hw;
        ctx.fillStyle='rgba(254,202,202,0.18)';
        ctx.fillRect(x0,ca.top,x1-x0,ca.bottom-ca.top);
      });
      ctx.restore();
    }
  };
}

// --- Chart functions ---
function drawCombo(id,cur,prev,color,label,dateLabels,isWeekend){
  var yoy=cur.map(function(v,i){return prev[i]>0?v/prev[i]*100:100});
  var wkPlugin=makeWeekendPlugin(isWeekend);
  new Chart(document.getElementById(id),{
    type:'bar',plugins:[wkPlugin],
    data:{labels:dateLabels,datasets:[
      {label:'\u5f53\u671f '+label,data:cur,backgroundColor:color,borderRadius:3,order:2},
      {label:'\u524d\u671f '+label,data:prev,backgroundColor:'#CBD5E1',borderRadius:3,order:3},
      {label:'\u524d\u671f\u6bd4(%)',data:yoy,type:'line',borderColor:'#EF4444',borderWidth:2,pointRadius:2,tension:.3,fill:false,yAxisID:'y1',order:1}
    ]},
    options:{responsive:true,interaction:{mode:'index',intersect:false},
      plugins:{
        tooltip:{callbacks:{label:function(c){return c.dataset.label.indexOf('\u524d\u671f\u6bd4')===0?fmt.pct(c.raw):c.dataset.label+': '+fmt.yen(c.raw)}}},
        legend:{labels:{font:{size:10}}},
        annotation:{annotations:{line100:{type:'line',yMin:100,yMax:100,yScaleID:'y1',borderColor:'#374151',borderWidth:1.5,borderDash:[4,4],
          label:{display:true,content:'\u524d\u671f\u6bd4 100%',position:'start',font:{size:8},color:'#374151',backgroundColor:'rgba(255,255,255,0.8)'}}}}
      },
      scales:{
        y:{beginAtZero:true,ticks:{callback:function(v){return fmt.man(v)}}},
        y1:{position:'right',min:0,max:160,ticks:{callback:function(v){return v+'%'},font:{size:9}},grid:{display:false},title:{display:true,text:'\u524d\u671f\u6bd4',font:{size:9}}},
        x:{ticks:{color:function(ctx){return isWeekend[ctx.index]?'#EF4444':'#6B7280'},font:{size:8}}}
      }
    }
  });
}

function drawAxisBar(id,axisData,color){
  var yoys=axisData.map(function(d){return d.prev>0?(d.sales/d.prev*100).toFixed(1)+'%':'NEW'});
  new Chart(document.getElementById(id),{
    type:'bar',
    data:{labels:axisData.map(function(d,i){return d.name+' ('+yoys[i]+')'}),datasets:[
      {label:'\u5f53\u671f',data:axisData.map(function(d){return d.sales}),backgroundColor:color,borderRadius:3},
      {label:'\u524d\u671f',data:axisData.map(function(d){return d.prev}),backgroundColor:'#CBD5E1',borderRadius:3}
    ]},
    options:{indexAxis:'y',responsive:true,
      plugins:{legend:{labels:{font:{size:10}}},
        tooltip:{callbacks:{label:function(c){var d=axisData[c.dataIndex];return c.dataset.label+': '+fmt.yen(c.raw)+(d.prev>0?' (\u524d\u671f\u6bd4'+(d.sales/d.prev*100).toFixed(1)+'%)':'')}}}
      },
      scales:{x:{ticks:{callback:function(v){return fmt.man(v)}}}}
    }
  });
}

// --- KPI rendering ---
function renderKpi(cid,sales,ps,qty,pq,nDays,bg,showArrow){
  var sy=ps>0?sales/ps*100:0, qy=pq>0?qty/pq*100:0;
  var sd=sales-ps, avg=nDays>0?sales/nDays:0;
  var yc=function(v){return v>=100?'text-green-600':'text-red-600'};
  var ya=function(v){return showArrow?(v>=100?'\u25b2 ':'\u25bc '):''};
  var b=bg||'bg-gray-50';
  document.getElementById(cid).innerHTML=
    '<div class="'+b+' rounded-lg px-4 py-2"><p class="text-sm text-gray-400">\u58f2\u4e0a\u91d1\u984d</p><p class="text-2xl font-bold leading-tight">'+fmt.sen(sales)+'</p><p class="text-sm font-medium '+yc(sy)+'">'+ya(sy)+sy.toFixed(1)+'%</p></div>'+
    '<div class="'+b+' rounded-lg px-4 py-2"><p class="text-sm text-gray-400">\u524d\u671f\u58f2\u4e0a\u91d1\u984d</p><p class="text-2xl font-bold text-gray-500 leading-tight">'+fmt.sen(ps)+'</p><p class="text-sm '+(sd>=0?'text-green-600':'text-red-600')+'">\u5dee '+(sd>=0?'+':'')+fmt.sen(sd)+'</p></div>'+
    '<div class="'+b+' rounded-lg px-4 py-2"><p class="text-sm text-gray-400">\u5e73\u5747\u65e5\u8ca9</p><p class="text-2xl font-bold leading-tight">'+fmt.sen(avg)+'</p><p class="text-sm text-gray-400">'+nDays+'\u65e5\u9593\u5e73\u5747</p></div>'+
    '<div class="'+b+' rounded-lg px-4 py-2"><p class="text-sm text-gray-400">\u6570\u91cf</p><p class="text-2xl font-bold leading-tight">'+fmt.num(qty)+'</p><p class="text-sm font-medium '+yc(qy)+'">'+ya(qy)+qy.toFixed(1)+'%</p></div>';
}

// --- Table functions ---
var _sortState={}, _filterState={}, _dataSets={};

function getHL(p){
  if(p.sy>=150&&p.s>500000) return 'highlight-plus';
  if(p.sd>=1000000) return 'highlight-plus';
  if((p.sy===0||!p.ps)&&p.s>100000) return 'highlight-plus';
  if(p.sy<=70&&p.sy>0&&p.ps>500000) return 'highlight-minus';
  if(p.sd<=-1000000) return 'highlight-minus';
  return '';
}
function db(v,mx,c){
  var w=mx>0?Math.min(v/mx*100,100):0;
  return '<div class="data-bar"><div class="bar-bg" style="width:'+w.toFixed(1)+'%;background:'+c+'"></div><span class="bar-val">'+fmt.yen(v)+'</span></div>';
}
function dbn(v,mx,c){
  var w=mx>0?Math.min(v/mx*100,100):0;
  return '<div class="data-bar"><div class="bar-bg" style="width:'+w.toFixed(1)+'%;background:'+c+'"></div><span class="bar-val">'+fmt.num(v)+'</span></div>';
}

function getFS(cat){
  var it=_dataSets[cat]?_dataSets[cat].slice():[];
  if(_filterState[cat]&&_filterState[cat]!=='ALL') it=it.filter(function(p){return p.r===_filterState[cat]});
  var s=_sortState[cat];
  if(s&&s.key) it.sort(function(a,b){return s.asc?a[s.key]-b[s.key]:b[s.key]-a[s.key]});
  return it;
}

function renderTable(cid,prods,cat){
  var mxS=0,mxQ=0;
  for(var i=0;i<prods.length;i++){if(prods[i].s>mxS)mxS=prods[i].s;if(prods[i].q>mxQ)mxQ=prods[i].q}
  var ss=_sortState[cat]||{key:null};
  var aw=function(k){return ss.key===k?(ss.asc?' \u25b2':' \u25bc'):''};
  var sc=function(k){return ss.key===k?' text-blue-600':''};
  var hd=function(l,k,x){return '<th class="py-2 px-2 font-medium text-gray-600 cursor-pointer hover:text-blue-500 select-none'+(x||'')+' '+sc(k)+'" onclick="POS._sortByCol(\''+cat+'\',\''+k+'\')">'+l+aw(k)+'</th>'};
  var h='<table class="w-full text-xs whitespace-nowrap"><thead class="sticky top-0 z-10"><tr class="bg-gray-100 border-b">';
  h+='<th class="py-2 px-2 text-left font-medium text-gray-600">#</th>';
  h+='<th class="py-2 px-2 text-center font-medium text-gray-600">\u30e9\u30f3\u30af</th>';
  h+='<th class="py-2 px-2 text-left font-medium text-gray-600 min-w-[160px]">\u5546\u54c1\u540d</th>';
  h+=hd('\u5f53\u671f\u91d1\u984d','s',' text-right min-w-[130px]');
  h+=hd('\u524d\u671f\u91d1\u984d','ps',' text-right min-w-[130px]');
  h+=hd('\u91d1\u984d\u524d\u671f\u6bd4','sy',' text-right');
  h+=hd('\u91d1\u984d\u524d\u671f\u5dee','sd',' text-right');
  h+=hd('\u5f53\u671f\u6570\u91cf','q',' text-right min-w-[110px]');
  h+=hd('\u524d\u671f\u6570\u91cf','pq',' text-right min-w-[110px]');
  h+=hd('\u6570\u91cf\u524d\u671f\u6bd4','qy',' text-right');
  h+=hd('\u6570\u91cf\u524d\u671f\u5dee','qd',' text-right');
  h+=hd('\u7d2f\u7a4d\u69cb\u6210\u6bd4','cp',' text-right');
  h+='</tr></thead><tbody>';
  for(var i=0;i<prods.length;i++){
    var p=prods[i];
    var hl=getHL(p);
    var rc=hl?hl+' border-b':'border-b hover:bg-gray-50';
    var rk=p.r==='A'?'text-blue-600 font-bold':p.r==='B'?'text-yellow-600 font-medium':'text-gray-400';
    var syC=p.sy>=100?'text-green-600 font-medium':'text-red-600 font-medium';
    var sdC=p.sd>=0?'text-green-600':'text-red-600';
    var qyC=p.qy>=100?'text-green-600 font-medium':'text-red-600 font-medium';
    var qdC=p.qd>=0?'text-green-600':'text-red-600';
    var ic=hl==='highlight-plus'?'<span class="text-green-600">\u25b2</span> ':hl==='highlight-minus'?'<span class="text-red-500">\u25bc</span> ':'';
    h+='<tr class="'+rc+'">';
    h+='<td class="py-1.5 px-2 text-gray-400">'+(i+1)+'</td>';
    h+='<td class="py-1.5 px-2 text-center '+rk+'">'+p.r+'</td>';
    h+='<td class="py-1.5 px-2">'+ic+p.n+'</td>';
    h+='<td class="py-1.5 px-2 text-right">'+db(p.s,mxS,'#3B82F6')+'</td>';
    h+='<td class="py-1.5 px-2 text-right">'+db(p.ps,mxS,'#94A3B8')+'</td>';
    h+='<td class="py-1.5 px-2 text-right '+syC+'">'+(p.sy>0?fmt.pct(p.sy):'NEW')+'</td>';
    h+='<td class="py-1.5 px-2 text-right '+sdC+'">'+fmt.diffYen(p.sd)+'</td>';
    h+='<td class="py-1.5 px-2 text-right">'+dbn(p.q,mxQ,'#10B981')+'</td>';
    h+='<td class="py-1.5 px-2 text-right">'+dbn(p.pq,mxQ,'#94A3B8')+'</td>';
    h+='<td class="py-1.5 px-2 text-right '+qyC+'">'+(p.qy>0?fmt.pct(p.qy):'NEW')+'</td>';
    h+='<td class="py-1.5 px-2 text-right '+qdC+'">'+fmt.diff(p.qd)+'</td>';
    h+='<td class="py-1.5 px-2 text-right text-gray-500">'+fmt.pct(p.cp)+'</td>';
    h+='</tr>';
  }
  h+='</tbody></table>';
  document.getElementById(cid).innerHTML=h;
}

POS._sortByCol=function(cat,key){
  var s=_sortState[cat];
  if(!s){s={key:null,asc:true};_sortState[cat]=s}
  if(s.key===key){s.asc=!s.asc}else{s.key=key;s.asc=false}
  renderTable(cat+'Table',getFS(cat),cat);
};

POS._filterTable=function(cat,rank){
  _filterState[cat]=rank;
  var btns=document.getElementById(cat+'Filter').querySelectorAll('button');
  btns.forEach(function(b){
    b.className=b.dataset.rank===rank?'px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-500 text-white':'px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700';
  });
  renderTable(cat+'Table',getFS(cat),cat);
};

// --- Axis title helper ---
function axisTitle(num,title,axisData){
  var names=axisData.map(function(a){return a.name}).join(' / ');
  var suffix=names?'\uff08'+names+'\uff09':'';
  return '\u8ef8'+num+': '+title+suffix;
}

// --- Build insights HTML ---
function insHTML(items){
  return items.map(function(i){return '      <li>'+i+'</li>'}).join('\n');
}

// --- Build full HTML structure ---
function buildHTML(data){
  var ca=data.cat_a, cb=data.cat_b||data.cat_a;
  var caN=data.cat_a_products?data.cat_a_products.length:0;
  var cbN=data.cat_b_products?data.cat_b_products.length:0;
  var insA=genInsights(data.cat_a_products);
  var insB=genInsights(data.cat_b_products);
  var hasCatB=cb&&cb!==ca&&data.cat_b_products&&data.cat_b_products.length>0;

  var h='<div class="max-w-7xl mx-auto px-4 py-6">';

  // Header
  h+='<div class="relative rounded-2xl mb-5 overflow-hidden" style="background:linear-gradient(135deg,#1e293b 0%,#334155 50%,#1e3a5f 100%)">';
  h+='<svg class="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" stroke-width="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/></svg>';
  h+='<div class="absolute top-0 right-0 w-64 h-64 rounded-full" style="background:radial-gradient(circle,rgba(59,130,246,0.15) 0%,transparent 70%);transform:translate(30%,-30%)"></div>';
  h+='<div class="absolute bottom-0 left-0 w-48 h-48 rounded-full" style="background:radial-gradient(circle,rgba(16,185,129,0.12) 0%,transparent 70%);transform:translate(-20%,40%)"></div>';
  h+='<div class="relative px-6 py-5 flex items-center justify-between"><div>';
  h+='<div class="flex items-center gap-2.5 mb-1">';
  h+='<div class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm"><svg class="w-4.5 h-4.5 text-blue-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg></div>';
  h+='<h1 class="text-lg font-bold text-white tracking-wide">\u30ab\u30c6\u30b4\u30ea\u5206\u6790\u30c0\u30c3\u30b7\u30e5\u30dc\u30fc\u30c9</h1></div>';
  h+='<p class="text-xs text-slate-400 ml-[42px]">Python\u5b9f\u884c\u7d50\u679c\u306b\u57fa\u3065\u304f\u96c6\u8a08\u5024</p></div>';
  h+='<div class="flex gap-5">';
  h+='<div class="text-right"><p class="text-[10px] text-slate-400 tracking-wider uppercase">Category</p><p class="text-sm font-semibold text-white mt-0.5" id="hdrCat"></p></div>';
  h+='<div class="w-px bg-white/10"></div>';
  h+='<div class="text-right"><p class="text-[10px] text-slate-400 tracking-wider uppercase">Period</p><p class="text-sm font-semibold text-white mt-0.5" id="hdrPeriod"></p></div>';
  h+='<div class="w-px bg-white/10"></div>';
  h+='<div class="text-right"><p class="text-[10px] text-slate-400 tracking-wider uppercase">Products</p><p class="text-sm font-semibold text-white mt-0.5" id="hdrProd"></p></div>';
  h+='<div class="w-px bg-white/10"></div>';
  h+='<div class="text-right"><p class="text-[10px] text-slate-400 tracking-wider uppercase">Rows</p><p class="text-sm font-semibold text-white mt-0.5" id="hdrRows"></p></div>';
  h+='</div></div></div>';

  // Tabs
  h+='<div class="flex gap-1 mb-6 border-b overflow-x-auto">';
  h+='<button class="tab-btn active px-4 py-2 text-sm font-medium rounded-t" onclick="POS._switchTab(\'overview\')">\u5168\u4f53\u6982\u6cc1</button>';
  h+='<button class="tab-btn px-4 py-2 text-sm font-medium text-gray-500 rounded-t" onclick="POS._switchTab(\'catA\')">'+ca+'\uff08'+caN+'\u54c1\uff09</button>';
  if(hasCatB) h+='<button class="tab-btn px-4 py-2 text-sm font-medium text-gray-500 rounded-t" onclick="POS._switchTab(\'catB\')">'+cb+'\uff08'+cbN+'\u54c1\uff09</button>';
  h+='</div>';

  // Overview tab
  h+='<div id="tab-overview" class="tab-content active">';
  // Total section
  h+='<div class="bg-white rounded-xl shadow-sm border p-4 mb-4">';
  h+='<h3 class="text-sm font-bold text-gray-700 mb-2">\u5168\u4f53'+(hasCatB?'\uff08'+ca+'\uff0b'+cb+'\uff09':'')+'</h3>';
  h+='<div class="grid grid-cols-4 gap-2 mb-3" id="kpiAll"></div><canvas id="chartAll" height="90"></canvas></div>';
  // Cat A section
  h+='<div class="bg-white rounded-xl shadow-sm border p-4 mb-4">';
  h+='<div class="flex items-center justify-between mb-2"><h3 class="text-sm font-bold text-gray-700">'+ca+'</h3><span class="text-xs text-gray-400" id="catAShare"></span></div>';
  h+='<div class="grid grid-cols-4 gap-2 mb-3" id="kpiCatA"></div><canvas id="chartCatA" height="90"></canvas></div>';
  // Cat A insight
  h+='<div class="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-4 mb-4">';
  h+='<h4 class="text-sm font-bold text-blue-900 mb-2">'+ca+' \u30a4\u30f3\u30b5\u30a4\u30c8</h4>';
  h+='<ul class="text-sm text-blue-800 space-y-1 list-disc pl-5" id="insOvA">'+insHTML(insA.overview)+'</ul></div>';
  if(hasCatB){
    // Cat B section
    h+='<div class="bg-white rounded-xl shadow-sm border p-4 mb-4">';
    h+='<div class="flex items-center justify-between mb-2"><h3 class="text-sm font-bold text-gray-700">'+cb+'</h3><span class="text-xs text-gray-400" id="catBShare"></span></div>';
    h+='<div class="grid grid-cols-4 gap-2 mb-3" id="kpiCatB"></div><canvas id="chartCatB" height="90"></canvas></div>';
    // Cat B insight
    h+='<div class="bg-emerald-50 border-l-4 border-emerald-500 rounded-r-lg p-4">';
    h+='<h4 class="text-sm font-bold text-emerald-900 mb-2">'+cb+' \u30a4\u30f3\u30b5\u30a4\u30c8</h4>';
    h+='<ul class="text-sm text-emerald-800 space-y-1 list-disc pl-5" id="insOvB">'+insHTML(insB.overview)+'</ul></div>';
  }
  h+='</div>';

  // Cat A tab
  h+='<div id="tab-catA" class="tab-content">';
  h+='<div class="grid grid-cols-4 gap-3 mb-4" id="kpiCatATab"></div>';
  h+='<div class="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-4 mb-4">';
  h+='<h4 class="text-sm font-bold text-blue-900 mb-2">'+ca+' \u5358\u54c1\u5206\u6790\u30a4\u30f3\u30b5\u30a4\u30c8</h4>';
  h+='<ul class="text-sm text-blue-800 space-y-1 list-disc pl-5" id="insTabA">'+insHTML(insA.tab)+'</ul></div>';
  h+='<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">';
  h+='<div class="bg-white rounded-xl shadow-sm border p-4"><h3 class="text-sm font-bold text-gray-700 mb-2" id="catAAx1T"></h3><canvas id="catAAxis1" height="160"></canvas></div>';
  h+='<div class="bg-white rounded-xl shadow-sm border p-4"><h3 class="text-sm font-bold text-gray-700 mb-2" id="catAAx2T"></h3><canvas id="catAAxis2" height="160"></canvas></div></div>';
  // Table
  h+='<div class="bg-white rounded-xl shadow-sm border p-4">';
  h+='<div class="flex justify-between items-center mb-2"><div class="flex items-center gap-3">';
  h+='<h3 class="text-sm font-bold text-gray-700">\u5168\u54c1\u8a73\u7d30\u30c7\u30fc\u30bf\uff08'+caN+'\u54c1\uff09</h3>';
  h+='<div class="flex gap-1" id="catAFilter"><button data-rank="ALL" class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-500 text-white" onclick="POS._filterTable(\'catA\',\'ALL\')">\u5168\u3066</button><button data-rank="A" class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700" onclick="POS._filterTable(\'catA\',\'A\')">A</button><button data-rank="B" class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700" onclick="POS._filterTable(\'catA\',\'B\')">B</button><button data-rank="C" class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700" onclick="POS._filterTable(\'catA\',\'C\')">C</button></div>';
  h+='</div><div class="flex gap-2 text-xs"><span class="bg-green-100 text-green-700 px-2 py-0.5 rounded">\u25b2 \u30d7\u30e9\u30b9\u8981\u56e0</span><span class="bg-red-100 text-red-700 px-2 py-0.5 rounded">\u25bc \u30de\u30a4\u30ca\u30b9\u8981\u56e0</span></div></div>';
  h+='<div class="text-xs text-gray-400 mb-1">\u203b \u30d8\u30c3\u30c0\u30fc\u30af\u30ea\u30c3\u30af\u3067\u30bd\u30fc\u30c8\u5207\u66ff</div>';
  h+='<div class="overflow-x-auto"><div class="max-h-[600px] overflow-y-auto" id="catATable"></div></div></div>';
  h+='</div>';

  if(hasCatB){
    // Cat B tab
    h+='<div id="tab-catB" class="tab-content">';
    h+='<div class="grid grid-cols-4 gap-3 mb-4" id="kpiCatBTab"></div>';
    h+='<div class="bg-emerald-50 border-l-4 border-emerald-500 rounded-r-lg p-4 mb-4">';
    h+='<h4 class="text-sm font-bold text-emerald-900 mb-2">'+cb+' \u5358\u54c1\u5206\u6790\u30a4\u30f3\u30b5\u30a4\u30c8</h4>';
    h+='<ul class="text-sm text-emerald-800 space-y-1 list-disc pl-5" id="insTabB">'+insHTML(insB.tab)+'</ul></div>';
    h+='<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">';
    h+='<div class="bg-white rounded-xl shadow-sm border p-4"><h3 class="text-sm font-bold text-gray-700 mb-2" id="catBAx1T"></h3><canvas id="catBAxis1" height="160"></canvas></div>';
    h+='<div class="bg-white rounded-xl shadow-sm border p-4"><h3 class="text-sm font-bold text-gray-700 mb-2" id="catBAx2T"></h3><canvas id="catBAxis2" height="200"></canvas></div></div>';
    // Table
    h+='<div class="bg-white rounded-xl shadow-sm border p-4">';
    h+='<div class="flex justify-between items-center mb-2"><div class="flex items-center gap-3">';
    h+='<h3 class="text-sm font-bold text-gray-700">\u5168\u54c1\u8a73\u7d30\u30c7\u30fc\u30bf\uff08'+cbN+'\u54c1\uff09</h3>';
    h+='<div class="flex gap-1" id="catBFilter"><button data-rank="ALL" class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-500 text-white" onclick="POS._filterTable(\'catB\',\'ALL\')">\u5168\u3066</button><button data-rank="A" class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700" onclick="POS._filterTable(\'catB\',\'A\')">A</button><button data-rank="B" class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700" onclick="POS._filterTable(\'catB\',\'B\')">B</button><button data-rank="C" class="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700" onclick="POS._filterTable(\'catB\',\'C\')">C</button></div>';
    h+='</div><div class="flex gap-2 text-xs"><span class="bg-green-100 text-green-700 px-2 py-0.5 rounded">\u25b2 \u30d7\u30e9\u30b9\u8981\u56e0</span><span class="bg-red-100 text-red-700 px-2 py-0.5 rounded">\u25bc \u30de\u30a4\u30ca\u30b9\u8981\u56e0</span></div></div>';
    h+='<div class="text-xs text-gray-400 mb-1">\u203b \u30d8\u30c3\u30c0\u30fc\u30af\u30ea\u30c3\u30af\u3067\u30bd\u30fc\u30c8\u5207\u66ff</div>';
    h+='<div class="overflow-x-auto"><div class="max-h-[600px] overflow-y-auto" id="catBTable"></div></div></div>';
    h+='</div>';
  }

  h+='</div>';
  return h;
}

// --- Tab switching ---
POS._switchTab=function(name){
  document.querySelectorAll('.tab-content').forEach(function(el){el.classList.remove('active')});
  document.querySelectorAll('.tab-btn').forEach(function(el){el.classList.remove('active');el.classList.add('text-gray-500')});
  document.getElementById('tab-'+name).classList.add('active');
  if(event&&event.target){event.target.classList.add('active');event.target.classList.remove('text-gray-500')}
};

// --- Main render function ---
POS.render=function(selector,data){
  injectCSS();
  Chart.defaults.font.family="'Noto Sans JP',sans-serif";
  Chart.defaults.color='#6B7280';

  var root=document.querySelector(selector);
  if(!root){console.error('POS.render: selector not found: '+selector);return}

  var ca=data.cat_a, cb=data.cat_b||data.cat_a;
  var hasCatB=cb&&cb!==ca&&data.cat_b_products&&data.cat_b_products.length>0;

  // Store datasets for table interactions
  _dataSets.catA=data.cat_a_products||[];
  _dataSets.catB=data.cat_b_products||[];
  _sortState.catA={key:null,asc:true};_sortState.catB={key:null,asc:true};
  _filterState.catA='ALL';_filterState.catB='ALL';

  // Build and insert HTML
  root.innerHTML=buildHTML(data);

  // Header
  document.getElementById('hdrCat').textContent=data.hdr_cat||ca;
  document.getElementById('hdrPeriod').textContent=data.hdr_period||'\u2014';
  document.getElementById('hdrProd').textContent=data.hdr_prod||'\u2014';
  document.getElementById('hdrRows').textContent=data.hdr_rows||'\u2014';

  // Calculate totals
  var sA=0,psA=0,qA=0,pqA=0;
  for(var i=0;i<_dataSets.catA.length;i++){var p=_dataSets.catA[i];sA+=p.s;psA+=p.ps;qA+=p.q;pqA+=p.pq}
  var sB=0,psB=0,qB=0,pqB=0;
  for(var i=0;i<_dataSets.catB.length;i++){var p=_dataSets.catB[i];sB+=p.s;psB+=p.ps;qB+=p.q;pqB+=p.pq}
  var sT=sA+sB,psT=psA+psB,qT=qA+qB,pqT=pqA+pqB;

  // Daily data processing
  var daily=data.daily||{};
  var dateKeys=Object.keys(daily).sort();
  var isWeekend=buildWeekendFlags(dateKeys);
  var dateLabels=buildDateLabels(dateKeys,isWeekend);
  var nDays=dateKeys.length;

  var catADaily=dateKeys.map(function(d){return (daily[d][ca]||{}).s||0});
  var catAPrev=dateKeys.map(function(d){return (daily[d][ca]||{}).ps||0});
  var catBDaily=hasCatB?dateKeys.map(function(d){return (daily[d][cb]||{}).s||0}):dateKeys.map(function(){return 0});
  var catBPrev=hasCatB?dateKeys.map(function(d){return (daily[d][cb]||{}).ps||0}):dateKeys.map(function(){return 0});
  var totalDaily=catADaily.map(function(v,i){return v+catBDaily[i]});
  var totalPrev=catAPrev.map(function(v,i){return v+catBPrev[i]});

  // KPI cards
  renderKpi('kpiAll',sT,psT,qT,pqT,nDays,'bg-gray-50',false);
  renderKpi('kpiCatA',sA,psA,qA,pqA,nDays,'bg-blue-50',false);
  renderKpi('kpiCatATab',sA,psA,qA,pqA,nDays,'bg-blue-50',true);
  if(hasCatB){
    renderKpi('kpiCatB',sB,psB,qB,pqB,nDays,'bg-emerald-50',false);
    renderKpi('kpiCatBTab',sB,psB,qB,pqB,nDays,'bg-emerald-50',true);
  }

  // Share
  var catAShareEl=document.getElementById('catAShare');
  if(catAShareEl) catAShareEl.textContent='\u69cb\u6210\u6bd4 '+(sT>0?(sA/sT*100).toFixed(1):0)+'%';
  if(hasCatB){
    var catBShareEl=document.getElementById('catBShare');
    if(catBShareEl) catBShareEl.textContent='\u69cb\u6210\u6bd4 '+(sT>0?(sB/sT*100).toFixed(1):0)+'%';
  }

  // Charts
  drawCombo('chartAll',totalDaily,totalPrev,'rgba(99,102,241,0.7)','\u5168\u4f53',dateLabels,isWeekend);
  drawCombo('chartCatA',catADaily,catAPrev,'rgba(59,130,246,0.7)',ca,dateLabels,isWeekend);
  if(hasCatB) drawCombo('chartCatB',catBDaily,catBPrev,'rgba(16,185,129,0.7)',cb,dateLabels,isWeekend);

  // Axis charts
  var a1=data.cat_a_axis1||[], a2=data.cat_a_axis2||[];
  var b1=data.cat_b_axis1||[], b2=data.cat_b_axis2||[];
  var ax1TEl=document.getElementById('catAAx1T');
  if(ax1TEl) ax1TEl.textContent=axisTitle(1,data.cat_a_axis1_title||'\u8ef81',a1);
  var ax2TEl=document.getElementById('catAAx2T');
  if(ax2TEl) ax2TEl.textContent=axisTitle(2,data.cat_a_axis2_title||'\u8ef82',a2);
  if(a1.length) drawAxisBar('catAAxis1',a1,'rgba(59,130,246,0.7)');
  if(a2.length) drawAxisBar('catAAxis2',a2,'rgba(99,102,241,0.7)');
  if(hasCatB){
    var bx1TEl=document.getElementById('catBAx1T');
    if(bx1TEl) bx1TEl.textContent=axisTitle(1,data.cat_b_axis1_title||'\u8ef81',b1);
    var bx2TEl=document.getElementById('catBAx2T');
    if(bx2TEl) bx2TEl.textContent=axisTitle(2,data.cat_b_axis2_title||'\u8ef82',b2);
    if(b1.length) drawAxisBar('catBAxis1',b1,'rgba(16,185,129,0.7)');
    if(b2.length) drawAxisBar('catBAxis2',b2,'rgba(6,182,212,0.7)');
  }

  // Tables
  renderTable('catATable',_dataSets.catA,'catA');
  if(hasCatB) renderTable('catBTable',_dataSets.catB,'catB');
};

global.POS=POS;
})(window);
