/**
 * Script injected into previews shown inside the canvas viewer. It runs inside a fully sandboxed iframe
 * (opaque origin) and talks to the viewer only through postMessage:
 *   viewer -> frame: mode, theme, pins, focus, restore, edit, select, style
 *   frame -> viewer: ready, scroll, pick, pin-click, missing, selected, text-edit, undo, redo, cancel
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
host.appendChild(selBox);host.appendChild(activeBox);host.appendChild(hoverBox);host.appendChild(hoverTag);host.appendChild(pinLayer);
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
