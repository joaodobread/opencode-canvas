/**
 * Script injected into previews shown inside the canvas viewer. It runs inside a fully sandboxed iframe
 * (opaque origin) and talks to the viewer only through postMessage:
 *   viewer -> frame: mode, theme, pins, focus, restore
 *   frame -> viewer: ready, scroll, pick, pin-click, missing
 */
export const INSPECTOR_JS = String.raw`(function(){
if(window.__canvasInspector)return;window.__canvasInspector=1;
var parentWin=window.parent;
function post(m){m.canvas=1;try{parentWin.postMessage(m,'*')}catch(e){}}
var mode=false,pins=[],activeId=null,els={},missingKey='',nodes={};

var style=document.createElement('style');
style.setAttribute('data-canvas-ui','');
style.textContent='html.__cc,html.__cc *{cursor:crosshair!important}@keyframes __ccpulse{0%{box-shadow:0 0 0 0 rgba(79,70,229,.55)}100%{box-shadow:0 0 0 14px rgba(79,70,229,0)}}';
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
host.appendChild(activeBox);host.appendChild(hoverBox);host.appendChild(hoverTag);host.appendChild(pinLayer);
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
  if(!mode)return;
  var t=pickable(e.target);
  if(!t){hide();return}
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
  if(!mode)return;
  if(e.target&&e.target.closest&&e.target.closest('[data-canvas-ui]'))return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
}
['mousedown','mouseup','pointerdown','pointerup','dblclick','submit','contextmenu','touchstart'].forEach(function(n){document.addEventListener(n,swallow,true)});
document.addEventListener('mousemove',onMove,true);
document.addEventListener('click',onClick,true);
document.addEventListener('mouseleave',hide,true);
document.addEventListener('keydown',function(e){if(mode&&e.key==='Escape'){post({type:'cancel'})}},true);

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
