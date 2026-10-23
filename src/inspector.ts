/**
 * Script injected into previews shown inside the canvas viewer. It runs inside a fully sandboxed iframe
 * (opaque origin) and talks to the viewer only through postMessage:
 *   viewer -> frame: mode, theme, pins, focus, restore, edit, select, style, audit, reveal
 *   frame -> viewer: ready, scroll, pick, pin-click, missing, selected, text-edit, undo, redo, cancel, audit
 */
export const INSPECTOR_JS = String.raw`(function(){
if(window.__canvasInspector)return;window.__canvasInspector=1;
var parentWin=window.parent;
function post(m){m.canvas=1;try{parentWin.postMessage(m,'*')}catch(e){}}
var mode=false,pins=[],activeId=null,els={},missingKey='',nodes={};
var edit=false,sel=null,editing=null,editOrig='',editIndex=0,editBlur=null,editPaste=null;

var style=document.createElement('style');
style.setAttribute('data-canvas-ui','');
style.textContent='html.__cc,html.__cc *{cursor:crosshair!important}html.__ce,html.__ce *{cursor:default!important}html.__ce [data-ce-editing],html.__ce [data-ce-editing] *{cursor:text!important;outline:none!important}@keyframes __ccpulse{0%{box-shadow:0 0 0 0 rgba(79,70,229,.55)}100%{box-shadow:0 0 0 14px rgba(79,70,229,0)}}';
document.documentElement.appendChild(style);

var host=document.createElement('div');
host.setAttribute('data-canvas-ui','');
host.style.cssText='position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;font:600 11px/1 ui-sans-serif,system-ui,sans-serif';
var hoverBox=document.createElement('div');
hoverBox.style.cssText='position:fixed;pointer-events:none;border:2px solid #4f46e5;background:rgba(79,70,229,.1);border-radius:3px;display:none';
var hoverTag=document.createElement('div');
hoverTag.style.cssText='position:fixed;pointer-events:none;background:#4f46e5;color:#fff;padding:3px 7px;border-radius:5px;font:11px/1.2 ui-monospace,Menlo,monospace;display:none;white-space:nowrap;max-width:70vw;overflow:hidden;text-overflow:ellipsis';
var activeBox=document.createElement('div');
activeBox.style.cssText='position:fixed;pointer-events:none;border:2px dashed #4f46e5;border-radius:3px;display:none';
var pinLayer=document.createElement('div');
var selBox=document.createElement('div');
selBox.style.cssText='position:fixed;pointer-events:none;border:2px solid #4f46e5;border-radius:3px;display:none;box-shadow:0 0 0 1px rgba(255,255,255,.75)';
var revBox=document.createElement('div');
revBox.style.cssText='position:fixed;pointer-events:none;border:2px solid #dc2626;border-radius:3px;display:none;box-shadow:0 0 0 4px rgba(220,38,38,.18)';
host.appendChild(revBox);host.appendChild(selBox);host.appendChild(activeBox);host.appendChild(hoverBox);host.appendChild(hoverTag);host.appendChild(pinLayer);
document.documentElement.appendChild(host);

function esc(s){return window.CSS&&CSS.escape?CSS.escape(s):String(s).replace(/[^a-zA-Z0-9_-]/g,'\\$&')}
function one(sel,el){try{var f=document.querySelectorAll(sel);return f.length===1&&f[0]===el}catch(e){return false}}
function selector(el){
  var parts=[],n=el;
  while(n&&n.nodeType===1&&n!==document.documentElement){
    var name=n.localName;
    if(n.id&&one('#'+esc(n.id),n)){parts.unshift('#'+esc(n.id));break}
    var did=n.getAttribute('data-id');
    if(did){var ds=name+'[data-id="'+did.replace(/(["\\])/g,'\\$1')+'"]';if(one(ds,n)){parts.unshift(ds);break}}
    if(n===document.body){parts.unshift('body');break}
    var i=1,s=n;
    while((s=s.previousElementSibling)){if(s.localName===name)i++}
    parts.unshift(name+':nth-of-type('+i+')');
    n=n.parentElement;
  }
  return parts.join(' > ');
}
function classes(el){var c=el.getAttribute('class')||'';return c.trim().split(/\s+/).filter(Boolean)}
function label(el){var t=el.localName;if(el.id)t+='#'+el.id;var c=classes(el).slice(0,3);if(c.length)t+='.'+c.join('.');return t}
function text(el){return (el.innerText||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,120)}
function html(el){
  var c=el.cloneNode(true);
  var big=c.querySelectorAll?c.querySelectorAll('svg,script,style'):[];
  for(var i=0;i<big.length;i++){big[i].textContent=''}
  return (c.outerHTML||'').replace(/\s+/g,' ').slice(0,700);
}
function pickable(t){
  if(!t||t.nodeType!==1)return null;
  if(t.closest&&t.closest('[data-canvas-ui]'))return null;
  if(t===document.documentElement)return document.body;
  return t;
}

function hide(){hoverBox.style.display='none';hoverTag.style.display='none'}
function onMove(e){
  if(!mode&&!edit)return;
  var t=pickable(e.target);
  if(!t||(editing&&editing.contains(t))){hide();return}
  var r=t.getBoundingClientRect();
  hoverBox.style.cssText+=';display:block;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px';
  hoverTag.textContent=label(t);
  hoverTag.style.display='block';
  hoverTag.style.left=Math.max(2,Math.min(r.left,innerWidth-hoverTag.offsetWidth-2))+'px';
  hoverTag.style.top=(r.top>26?r.top-24:r.bottom+4)+'px';
}
function onClick(e){
  if(!mode)return;
  var t=pickable(e.target);
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  if(!t)return;
  hide();
  post({type:'pick',anchor:{selector:selector(t),tag:t.localName,label:label(t),text:text(t),html:html(t)}});
}
function swallow(e){
  if(!mode&&!edit)return;
  if(e.target&&e.target.closest&&e.target.closest('[data-canvas-ui]'))return;
  if(edit){
    var t=pickable(e.target);
    if(editing&&t&&editing.contains(t))return;
    if(e.type==='dblclick'&&t){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();var r=textRoot(t);if(r)startEdit(r);return}
  }
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
}
['mousedown','mouseup','pointerdown','pointerup','dblclick','submit','contextmenu','touchstart'].forEach(function(n){document.addEventListener(n,swallow,true)});
document.addEventListener('mousemove',onMove,true);
document.addEventListener('click',onClick,true);
document.addEventListener('mouseleave',hide,true);
document.addEventListener('keydown',function(e){if(mode&&e.key==='Escape'){post({type:'cancel'})}},true);

var INLINE=/^(b|i|strong|em|span|a|code|br|small|mark|u|s|sub|sup)$/;
var SKIP=/^(html|body|svg|script|style|img|video|audio|canvas|input|textarea|select|iframe|hr)$/;
function textual(el){
  if(!el||el.nodeType!==1||SKIP.test(el.localName)||el.closest('svg'))return false;
  if(!(el.textContent||'').trim())return false;
  var all=el.querySelectorAll('*');
  for(var i=0;i<all.length;i++){if(!INLINE.test(all[i].localName))return false}
  return true;
}
function textRoot(el){
  var n=el;
  while(n&&n!==document.body&&!textual(n))n=n.parentElement;
  if(!n||n===document.body)return null;
  while(n.parentElement&&n.parentElement!==document.body&&textual(n.parentElement))n=n.parentElement;
  return n;
}
function hex(c){
  var m=/rgba?\(([^)]+)\)/.exec(c||'');if(!m)return '';
  var p=m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat);
  if(p.length>3&&p[3]===0)return '';
  return '#'+[0,1,2].map(function(i){return ('0'+Math.round(p[i]).toString(16)).slice(-2)}).join('');
}
function px(v){return Math.round(parseFloat(v)*10)/10||0}
function styleInfo(el){
  var cs=getComputedStyle(el);
  var lh=cs.lineHeight==='normal'?'':Math.round(parseFloat(cs.lineHeight)/parseFloat(cs.fontSize)*100)/100;
  return {
    'color':hex(cs.color),'background-color':hex(cs.backgroundColor),
    'font-size':px(cs.fontSize),'font-weight':cs.fontWeight,'font-family':cs.fontFamily.split(',')[0].replace(/["']/g,'').trim(),
    'text-align':cs.textAlign,'line-height':lh,'letter-spacing':cs.letterSpacing==='normal'?0:px(cs.letterSpacing),
    'padding-top':px(cs.paddingTop),'padding-bottom':px(cs.paddingBottom),'padding-left':px(cs.paddingLeft),'padding-right':px(cs.paddingRight),
    'margin-top':px(cs.marginTop),'margin-bottom':px(cs.marginBottom),
    'border-radius':px(cs.borderTopLeftRadius),'opacity':parseFloat(cs.opacity)
  };
}
function selectEl(el){
  sel=el;
  post({type:'selected',selector:selector(el),label:label(el),tag:el.localName,textual:!!textRoot(el),styles:styleInfo(el)});
}
function clearSel(){sel=null}
function startEdit(el){
  if(editing)finishEdit(true);
  selectEl(el);
  editOrig=el.innerHTML;
  var same=document.body.querySelectorAll('*'),n=0;editIndex=0;
  for(var i=0;i<same.length;i++){
    var c=same[i];
    if(c.closest('[data-canvas-ui]'))continue;
    if(c===el){editIndex=n;break}
    if(c.innerHTML===editOrig)n++;
  }
  editing=el;
  el.setAttribute('contenteditable','true');el.setAttribute('data-ce-editing','');
  editBlur=function(){if(editing===el)finishEdit(true)};
  editPaste=function(ev){ev.preventDefault();var t=(ev.clipboardData||window.clipboardData).getData('text/plain');document.execCommand('insertText',false,t)};
  el.addEventListener('blur',editBlur);el.addEventListener('paste',editPaste);
  el.focus();
  try{var r=document.createRange();r.selectNodeContents(el);r.collapse(false);var s=getSelection();s.removeAllRanges();s.addRange(r)}catch(x){}
}
function finishEdit(commit){
  var el=editing;if(!el)return;
  editing=null;
  el.removeEventListener('blur',editBlur);el.removeEventListener('paste',editPaste);
  el.removeAttribute('contenteditable');el.removeAttribute('data-ce-editing');
  var after=el.innerHTML.replace(/(<br\s*\/?>)+\s*$/i,'');
  if(!commit||!after.trim()){el.innerHTML=editOrig;return}
  if(after===editOrig)return;
  el.innerHTML=after;
  post({type:'text-edit',before:editOrig,after:after,index:editIndex});
}
function setEdit(on){
  edit=!!on;
  document.documentElement.classList.toggle('__ce',edit);
  if(!edit){finishEdit(true);clearSel();hide()}
}
function applyStyle(selectorText,props){
  var el=find(selectorText);if(!el)return;
  Object.keys(props||{}).forEach(function(k){
    if(props[k]===''||props[k]==null)el.style.removeProperty(k);else el.style.setProperty(k,props[k],'important');
  });
  if(sel===el)post({type:'selected',selector:selectorText,label:label(el),tag:el.localName,textual:!!textRoot(el),styles:styleInfo(el),quiet:1});
}
function onEditClick(e){
  if(!edit)return;
  if(e.target&&e.target.closest&&e.target.closest('[data-canvas-ui]'))return;
  var t=pickable(e.target);
  if(editing&&t&&editing.contains(t))return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  if(editing)finishEdit(true);
  if(t)selectEl(t);
}
document.addEventListener('click',onEditClick,true);
document.addEventListener('keydown',function(e){
  if(!edit)return;
  if(editing){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finishEdit(false);return}
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.stopPropagation();finishEdit(true);return}
    e.stopPropagation();
    return;
  }
  if((e.metaKey||e.ctrlKey)&&(e.key==='z'||e.key==='Z')){e.preventDefault();post({type:e.shiftKey?'redo':'undo'});return}
  if(e.key==='Escape'){e.preventDefault();if(sel){clearSel();post({type:'selected',none:1})}else post({type:'cancel'})}
  else if(e.key==='Enter'&&sel){var r=textRoot(sel);if(r){e.preventDefault();startEdit(r)}}
},true);

function rgba(c){
  var m=/rgba?\(([^)]+)\)/.exec(c||'');if(!m)return null;
  var p=m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat);
  return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};
}
function over(f,b){var a=f.a;return {r:f.r*a+b.r*(1-a),g:f.g*a+b.g*(1-a),b:f.b*a+b.b*(1-a),a:1}}
function lum(c){
  var v=[c.r,c.g,c.b].map(function(x){x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)});
  return .2126*v[0]+.7152*v[1]+.0722*v[2];
}
function ratio(a,b){var x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
function backdrop(el){
  var stack=[],n=el;
  while(n&&n.nodeType===1){
    var cs=getComputedStyle(n);
    if(cs.backgroundImage&&cs.backgroundImage!=='none')return null;
    var c=rgba(cs.backgroundColor);
    if(c&&c.a>0){stack.push(c);if(c.a>=1)break}
    n=n.parentElement;
  }
  var base={r:255,g:255,b:255,a:1};
  for(var i=stack.length-1;i>=0;i--)base=over(stack[i],base);
  return base;
}
function hexOf(c){return '#'+[c.r,c.g,c.b].map(function(v){return ('0'+Math.round(v).toString(16)).slice(-2)}).join('')}
function accName(el){
  var n=(el.getAttribute('aria-label')||el.getAttribute('title')||'').trim();
  if(n)return n;
  var lb=el.getAttribute('aria-labelledby');
  if(lb){var r=document.getElementById(lb);if(r&&(r.textContent||'').trim())return r.textContent.trim()}
  if((el.innerText||el.textContent||'').trim())return 'text';
  if(el.querySelector('img[alt]:not([alt=""])'))return 'img';
  if(el.localName==='input'&&(el.value||'').trim()&&/^(button|submit|reset)$/.test(el.type))return 'value';
  return '';
}
function audit(){
  var out=[],seen={};
  function add(rule,sev,el,msg){
    if(out.length>=60)return;
    var sel=selector(el),key=rule+'|'+sel;
    if(seen[key])return;seen[key]=1;
    out.push({id:'a'+out.length,rule:rule,severity:sev,message:msg,selector:sel,tag:el.localName,label:label(el),text:text(el).slice(0,60)});
  }
  var all=document.body?document.body.querySelectorAll('*'):[];
  var lastLevel=0,h1=0;
  for(var i=0;i<all.length;i++){
    var el=all[i];
    if(el.closest('[data-canvas-ui]')||/^(script|style|svg|path|noscript|br)$/.test(el.localName)||el.closest('svg'))continue;
    var r=el.getBoundingClientRect();
    if(r.width===0&&r.height===0)continue;
    var cs=getComputedStyle(el);
    if(cs.visibility==='hidden'||cs.display==='none')continue;
    var own='';
    for(var k=0;k<el.childNodes.length;k++){if(el.childNodes[k].nodeType===3)own+=el.childNodes[k].nodeValue}
    own=own.replace(/\s+/g,' ').trim();
    if(own){
      var fg=rgba(cs.color),bg=backdrop(el);
      if(fg&&bg){
        var op=parseFloat(cs.opacity);if(op<1)fg.a*=op;
        var f=over(fg,bg),size=parseFloat(cs.fontSize),bold=parseInt(cs.fontWeight,10)>=700;
        var large=size>=24||(size>=18.66&&bold),need=large?3:4.5,cr=ratio(f,bg);
        if(cr<need)add('contrast',cr<need*0.7?'error':'warn',el,'Low contrast '+(Math.round(cr*10)/10)+':1 (needs '+need+':1): text '+hexOf(f)+' on '+hexOf(bg)+'.');
      }
      var fs=parseFloat(cs.fontSize);
      if(fs<12)add('small-text','warn',el,'Text is '+Math.round(fs*10)/10+'px. Keep body text at 12px or larger (14-16px is better).');
    }
    var tag=el.localName;
    if(tag==='img'&&!el.hasAttribute('alt'))add('alt','error',el,'Image has no alt text. Add a description, or alt="" if it is decorative.');
    if(/^h[1-6]$/.test(tag)){
      var lv=parseInt(tag.charAt(1),10);
      if(lv===1)h1++;
      if(lastLevel&&lv>lastLevel+1)add('heading-order','warn',el,'Heading jumps from h'+lastLevel+' to h'+lv+'. Do not skip levels.');
      lastLevel=lv;
    }
    var interactive=tag==='button'||tag==='a'&&el.hasAttribute('href')||tag==='select'||tag==='textarea'||(tag==='input'&&el.type!=='hidden')||el.getAttribute('role')==='button';
    if(interactive){
      if((tag==='button'||tag==='a'||el.getAttribute('role')==='button')&&!accName(el))add('name','error',el,'Control has no accessible name. Add text or an aria-label.');
      if(/^(input|select|textarea)$/.test(tag)&&!/^(button|submit|reset|image)$/.test(el.type||'')){
        var labelled=el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.closest('label')||(el.id&&document.querySelector('label[for="'+esc(el.id)+'"]'));
        if(!labelled)add('label','warn',el,'Form field has no label. A placeholder alone disappears while typing.');
      }
      if(r.width<24||r.height<24)add('target','warn',el,'Touch target is '+Math.round(r.width)+'x'+Math.round(r.height)+'px. Make it at least 24x24px (44px on mobile).');
    }
  }
  if(!h1&&document.body&&document.body.querySelector('h2,h3'))out.push({id:'a'+out.length,rule:'hierarchy',severity:'info',message:'There is no h1. Give the page one clear primary heading.',selector:'body',tag:'body',label:'body',text:''});
  var weight={error:0,warn:1,info:2};
  out.sort(function(a,b){return weight[a.severity]-weight[b.severity]});
  post({type:'audit',issues:out});
}
function reveal(sel){
  var el=find(sel);if(!el)return;
  if(el.scrollIntoView)el.scrollIntoView({block:'center',inline:'center',behavior:'smooth'});
  var t0=Date.now();
  (function tick(){
    var n=find(sel);if(!n||Date.now()-t0>2600){revBox.style.display='none';return}
    var b=n.getBoundingClientRect();
    revBox.style.cssText+=';display:block;left:'+b.left+'px;top:'+b.top+'px;width:'+b.width+'px;height:'+b.height+'px';
    requestAnimationFrame(tick);
  })();
}

function setMode(on){
  mode=!!on;
  document.documentElement.classList.toggle('__cc',mode);
  if(!mode)hide();
}

function find(sel){
  if(!sel)return null;
  try{return document.querySelector(sel)}catch(e){return null}
}
function visible(r){return (r.width>0||r.height>0)&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth}

function makePin(p){
  var d=document.createElement('div');
  d.style.cssText='position:fixed;left:0;top:0;width:24px;height:24px;border-radius:50% 50% 50% 4px;display:none;align-items:center;justify-content:center;background:#4f46e5;color:#fff;border:2px solid #fff;box-shadow:0 2px 8px rgba(2,6,23,.35);pointer-events:auto;cursor:pointer;user-select:none';
  d.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();post({type:'pin-click',id:d.getAttribute('data-id')})},true);
  d.setAttribute('data-id',p.id);
  pinLayer.appendChild(d);
  return d;
}
function setPins(list,active){
  pins=list||[];activeId=active||null;
  var keep={};
  pins.forEach(function(p){keep[p.id]=1;var n=nodes[p.id]||(nodes[p.id]=makePin(p));n.textContent=p.n;n.setAttribute('data-id',p.id)});
  Object.keys(nodes).forEach(function(id){if(!keep[id]){pinLayer.removeChild(nodes[id]);delete nodes[id];delete els[id]}});
  missingKey='';
}

function frame(){
  var missing=[],act=null;
  for(var i=0;i<pins.length;i++){
    var p=pins[i],n=nodes[p.id];
    if(!n)continue;
    var el=els[p.id];
    if(!el||!el.isConnected){el=els[p.id]=find(p.selector)}
    if(!el){n.style.display='none';missing.push(p.id);continue}
    var r=el.getBoundingClientRect();
    if(!visible(r)){n.style.display='none';continue}
    var x=Math.max(4,Math.min(r.left-8,innerWidth-30)),y=Math.max(4,Math.min(r.top-8,innerHeight-30));
    n.style.display='flex';
    n.style.transform='translate('+x+'px,'+y+'px)';
    var on=p.id===activeId;
    n.style.zIndex=on?'2':'1';
    n.style.outline=on?'3px solid rgba(79,70,229,.35)':'none';
    if(on)act=r;
  }
  if(act){activeBox.style.cssText+=';display:block;left:'+act.left+'px;top:'+act.top+'px;width:'+act.width+'px;height:'+act.height+'px'}
  else activeBox.style.display='none';
  if(edit&&sel&&sel.isConnected){var sr=sel.getBoundingClientRect();selBox.style.cssText+=';display:block;left:'+sr.left+'px;top:'+sr.top+'px;width:'+sr.width+'px;height:'+sr.height+'px;border-style:'+(editing?'dashed':'solid')}
  else selBox.style.display='none';
  var key=missing.join(',');
  if(key!==missingKey){missingKey=key;post({type:'missing',ids:missing})}
  requestAnimationFrame(frame);
}

function focusPin(id){
  var p=pins.filter(function(x){return x.id===id})[0];
  if(!p)return;
  var el=els[id]||find(p.selector);
  activeId=id;
  if(el&&el.scrollIntoView){el.scrollIntoView({block:'center',inline:'center',behavior:'smooth'})}
  var n=nodes[id];
  if(n){n.style.animation='none';void n.offsetWidth;n.style.animation='__ccpulse .9s ease-out 2'}
}

addEventListener('message',function(e){
  var d=e.data;
  if(e.source!==parentWin||!d||d.canvas!==1)return;
  if(d.type==='mode')setMode(d.on);
  else if(d.type==='theme'){var r=document.documentElement;if(d.value==='auto'||!d.value)r.removeAttribute('data-theme');else r.setAttribute('data-theme',d.value)}
  else if(d.type==='pins')setPins(d.pins,d.active);
  else if(d.type==='focus')focusPin(d.id);
  else if(d.type==='restore')window.scrollTo(d.x||0,d.y||0);
  else if(d.type==='audit')audit();
  else if(d.type==='reveal')reveal(d.selector);
  else if(d.type==='edit')setEdit(d.on);
  else if(d.type==='edit-text'){if(sel){var tr=textRoot(sel);if(tr)startEdit(tr)}}
  else if(d.type==='style')applyStyle(d.selector,d.props);
  else if(d.type==='select'){var t=find(d.selector);if(t&&edit)selectEl(t)}
});

var scrollTimer=0;
addEventListener('scroll',function(){
  if(scrollTimer)return;
  scrollTimer=setTimeout(function(){scrollTimer=0;post({type:'scroll',x:window.scrollX,y:window.scrollY})},120);
},{passive:true});

requestAnimationFrame(frame);
post({type:'ready',loaded:document.readyState==='complete'});
addEventListener('load',function(){post({type:'ready',loaded:true})});
})();`

/**
 * Script for the artboards of the board view. The board catches wheel events itself (to pan and zoom)
 * and forwards them to the active artboard:
 *   viewer -> frame: scrollby {dx, dy}
 */
export const BOARD_FRAME_JS = String.raw`(function(){
if(window.__canvasBoard)return;window.__canvasBoard=1;
addEventListener('message',function(e){var d=e.data;if(e.source!==parent||!d||d.canvas!==1||d.type!=='scrollby')return;window.scrollBy(+d.dx||0,+d.dy||0)});
})();`
