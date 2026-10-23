export const VIEWER_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenCode Canvas</title>
<style>
:root{
  --bg:#f6f6f8;--panel:#ffffff;--text:#16161a;--muted:#70707c;--border:#e6e6ea;--hover:#f2f2f5;
  --accent:#5b5bd6;--accent-soft:#eeeefc;--on-accent:#ffffff;--stage:#ececf0;--dots:#d7d7de;
  --ok:#16a34a;--warn:#d97706;--bad:#dc2626;--bubble:#f2f2f5;
  --shadow:0 8px 28px rgba(20,20,35,.14);--ring:0 0 0 3px rgba(91,91,214,.18);
}
@media (prefers-color-scheme:dark){:root{
  --bg:#0d0d10;--panel:#141418;--text:#ececf1;--muted:#8a8a96;--border:#26262d;--hover:#1c1c22;
  --accent:#8f8ff7;--accent-soft:#222242;--on-accent:#0d0d10;--stage:#0a0a0d;--dots:#23232a;
  --bubble:#1c1c22;--shadow:0 8px 28px rgba(0,0,0,.5);--ring:0 0 0 3px rgba(143,143,247,.22);
}}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:grid;grid-template-columns:256px minmax(0,1fr) auto;background:var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
button,textarea,input{font:inherit;color:inherit}
button{cursor:pointer}
svg{display:block;flex:none}
[hidden]{display:none!important}
kbd{font:600 10px ui-monospace,Menlo,monospace;padding:1px 5px;border-radius:4px;background:var(--hover);color:var(--muted);border:1px solid var(--border)}
.spacer{flex:1}

aside{display:flex;flex-direction:column;background:var(--panel);border-right:1px solid var(--border);min-height:0}
.brand{display:flex;align-items:center;gap:10px;height:56px;padding:0 16px;font-weight:700;letter-spacing:-.01em;flex:none}
.logo{width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,var(--accent),#d946a8);display:grid;place-items:center;color:#fff}
.search{position:relative;margin:0 12px 8px}
.search svg{position:absolute;left:10px;top:9px;color:var(--muted)}
.search input{width:100%;height:34px;padding:0 34px 0 32px;border:1px solid var(--border);border-radius:9px;background:var(--bg);outline:none}
.search input:focus{border-color:var(--accent);box-shadow:var(--ring)}
.search kbd{position:absolute;right:8px;top:7px}
nav{flex:1;overflow:auto;padding:4px 8px 12px}
.group{margin-top:12px}
.group h3{margin:0;padding:4px 10px 6px;font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--muted);display:flex;justify-content:space-between}
.item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;height:34px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--text)}
.item svg{color:var(--muted)}
.item:hover{background:var(--hover)}
.item.active{background:var(--accent-soft);font-weight:600}
.item.active svg{color:var(--accent)}
.item .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .rev{font-size:11px;color:var(--muted);font-weight:500}
.item .cc{min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:var(--accent);color:var(--on-accent);font-size:11px;font-weight:700;display:grid;place-items:center}
.empty{margin:28px 10px;padding:22px 16px;border:1px dashed var(--border);border-radius:12px;color:var(--muted);text-align:center;font-size:13px}
.empty b{display:block;color:var(--text);margin-bottom:4px}
.empty code{background:var(--hover);padding:1px 5px;border-radius:5px}
.foot{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
.live{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px rgba(22,163,74,.18)}
.live.off{background:var(--bad);box-shadow:0 0 0 3px rgba(220,38,38,.16)}

main{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0}
.top{height:56px;flex:none;display:flex;align-items:center;gap:8px;padding:0 16px;background:var(--panel);border-bottom:1px solid var(--border)}
.ttl{display:flex;align-items:center;gap:12px;min-width:0}
.kico{width:32px;height:32px;border-radius:9px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;flex:none}
.tt{min-width:0}
.tt h1{margin:0;font-size:14px;font-weight:650;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sub{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vsep{width:1px;height:20px;background:var(--border);margin:0 4px}
.btn{position:relative;height:32px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--panel);display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:var(--text);text-decoration:none;white-space:nowrap}
.btn:hover{background:var(--hover)}
.btn.icon{width:32px;padding:0;justify-content:center}
.btn.on,.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.btn.on:hover,.btn.primary:hover{filter:brightness(1.06);background:var(--accent)}
.btn.on kbd{background:rgba(255,255,255,.22);border-color:transparent;color:inherit}
.btn.primary:disabled{opacity:.45;cursor:not-allowed}
.btn.sm{height:28px;padding:0 10px;font-size:12px}
.btn.ghost{border-color:transparent;background:transparent;color:var(--muted)}
.btn.ghost:hover{background:var(--hover);color:var(--text)}
.badge{position:absolute;top:-6px;right:-6px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:var(--accent);color:var(--on-accent);border:2px solid var(--panel);font-size:10px;font-weight:700;display:grid;place-items:center;line-height:1}
.menuwrap{position:relative}
.menu{position:absolute;right:0;top:38px;width:200px;padding:5px;background:var(--panel);border:1px solid var(--border);border-radius:11px;box-shadow:var(--shadow);z-index:30}
.menu>*{display:flex;align-items:center;gap:10px;width:100%;height:34px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--text);text-decoration:none;font-size:13px;text-align:left}
.menu>*:hover{background:var(--hover)}
.menu svg{color:var(--muted)}

.stage{position:relative;flex:1;min-height:0;overflow:hidden;display:flex;justify-content:center;align-items:center;padding:20px 20px 76px;background-color:var(--stage);background-image:radial-gradient(var(--dots) 1px,transparent 1px);background-size:20px 20px}
.stage.commenting::after{content:'';position:absolute;inset:0;border:2px solid var(--accent);pointer-events:none;z-index:4}
.hint{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:5;display:none;align-items:center;gap:8px;background:var(--accent);color:var(--on-accent);border-radius:99px;padding:7px 14px;font-size:12px;font-weight:600;box-shadow:var(--shadow);white-space:nowrap}
.commenting .hint{display:flex}
.frame-box{position:relative;flex:none}
.frame-wrap{position:absolute;left:0;top:0;transform-origin:top left;background:#fff;box-shadow:0 1px 2px rgba(20,20,35,.08),0 18px 50px rgba(20,20,35,.2);border-radius:10px;overflow:hidden}
.frame-wrap.mobile{border-radius:36px;border:10px solid #0b0b10}
.frame-wrap.tablet{border-radius:24px;border:10px solid #0b0b10}
iframe{display:block;width:100%;height:100%;border:0;background:#fff}
.welcome{margin:auto;max-width:420px;text-align:center;color:var(--muted)}
.welcome .ic{width:52px;height:52px;border-radius:16px;margin:0 auto 14px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}
.welcome h2{color:var(--text);margin:0 0 6px;font-size:18px}
.welcome p{margin:0}

.dock{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:8;display:flex;align-items:center;gap:4px;padding:4px;background:var(--panel);border:1px solid var(--border);border-radius:13px;box-shadow:var(--shadow)}
.grp{display:flex;gap:2px}
.grp button{width:34px;height:32px;border:0;border-radius:9px;background:transparent;color:var(--muted);display:grid;place-items:center}
.grp button:hover{background:var(--hover);color:var(--text)}
.grp button.on{background:var(--accent-soft);color:var(--accent)}
.dsep{width:1px;height:20px;background:var(--border);margin:0 4px}
.dsize:empty{display:none}
.dsize{font-size:11px;color:var(--muted);padding:0 10px 0 6px;font-variant-numeric:tabular-nums;white-space:nowrap}
.toast{position:fixed;left:50%;bottom:76px;transform:translate(-50%,8px);background:var(--text);color:var(--bg);padding:8px 14px;border-radius:9px;font-size:13px;opacity:0;transition:.2s;pointer-events:none;z-index:40;max-width:70vw}
.toast.show{opacity:1;transform:translate(-50%,0)}

#panel{width:352px;display:flex;flex-direction:column;background:var(--panel);border-left:1px solid var(--border);min-height:0}
.ph{height:56px;flex:none;display:flex;align-items:center;gap:8px;padding:0 12px 0 16px}
.ph b{font-size:14px;font-weight:650}
.ph .cnt{font-size:12px;color:var(--muted)}
.tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--border);flex:none}
.tabs button{height:36px;padding:0 10px;border:0;background:transparent;color:var(--muted);font-size:13px;font-weight:500;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs button:hover{color:var(--text)}
.tabs button.on{color:var(--text);border-bottom-color:var(--accent)}
#threads{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--bg)}
.none{margin:auto;max-width:250px;color:var(--muted);text-align:center;font-size:13px}
.none .ic{width:44px;height:44px;border-radius:14px;margin:0 auto 12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}
.none b{display:block;color:var(--text);margin-bottom:4px;font-size:14px}
.card{border:1px solid var(--border);border-radius:12px;background:var(--panel);overflow:hidden}
.card.active{border-color:var(--accent);box-shadow:var(--ring)}
.card.resolved{opacity:.7}
.card.draft{border-color:var(--accent);box-shadow:var(--ring)}
.chead{display:flex;align-items:center;gap:8px;padding:10px 12px 6px;cursor:pointer}
.pin{flex:none;width:22px;height:22px;border-radius:50% 50% 50% 4px;background:var(--accent);color:var(--on-accent);font-size:11px;font-weight:700;display:grid;place-items:center}
.pin.done{background:var(--ok);color:#fff}
.anchor{min-width:0;font:11px ui-monospace,Menlo,monospace;color:var(--muted);background:var(--hover);padding:2px 7px;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);white-space:nowrap}
.st i{width:6px;height:6px;border-radius:50%;background:var(--accent)}
.st.done i{background:var(--ok)}
.quote{margin:0 12px 4px;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.warn{margin:4px 12px 4px;padding:6px 9px;border-radius:8px;background:rgba(217,119,6,.12);color:var(--warn);font-size:12px}
.msgs{display:flex;flex-direction:column;gap:3px;padding:2px 12px 10px}
.meta{font-size:10.5px;color:var(--muted);margin:6px 2px 1px}
.meta.r{align-self:flex-end}
.msg{max-width:92%;padding:8px 11px;border-radius:12px;background:var(--bubble);white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}
.msg.user{align-self:flex-end;background:var(--accent);color:var(--on-accent);border-bottom-right-radius:4px}
.msg.agent{align-self:flex-start;border-bottom-left-radius:4px}
.state{padding:0 12px 10px;font-size:12px;color:var(--muted);display:flex;align-items:center;gap:8px}
.state.bad{color:var(--bad)}
.dots{display:inline-flex;gap:3px}.dots i{width:5px;height:5px;border-radius:50%;background:var(--muted);animation:b 1s infinite}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes b{0%,60%,100%{opacity:.25}30%{opacity:1}}
.compose{display:flex;gap:6px;align-items:flex-end;padding:8px 10px;border-top:1px solid var(--border)}
.compose textarea,.draftbox textarea{flex:1;min-width:0;resize:none;border:1px solid transparent;border-radius:9px;background:var(--bg);padding:8px 10px;max-height:140px;min-height:34px;outline:none}
.compose textarea:focus,.draftbox textarea:focus{border-color:var(--accent);box-shadow:var(--ring)}
.send{width:32px;height:32px;border-radius:50%;border:0;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;flex:none}
.send:hover{filter:brightness(1.08)}
.tf{display:flex;gap:6px;padding:0 10px 10px;align-items:center}
.draftbox{padding:4px 12px 12px;display:flex;flex-direction:column;gap:8px}
.row{display:flex;gap:6px;align-items:center}
@media (max-width:1180px){#panel{position:fixed;right:0;top:0;bottom:0;z-index:25;box-shadow:-12px 0 36px rgba(20,20,35,.22)}}
@media (max-width:860px){body{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}aside{max-height:34vh;border-right:0;border-bottom:1px solid var(--border)}#panel{width:100%}.sub,.btn kbd,.foot{display:none}}
</style>
</head>
<body>
<aside>
  <div class="brand"><span class="logo" data-i="layers" data-s="14"></span>Canvas</div>
  <div class="search"><span data-i="search" data-s="14"></span><input id="q" placeholder="Search designs" autocomplete="off"><kbd>/</kbd></div>
  <nav id="nav"></nav>
  <div class="foot"><span id="live" class="live off"></span><span id="livet">Connecting</span><span class="spacer"></span><span><kbd>C</kbd> comment</span></div>
</aside>
<main>
  <header class="top" id="bar" hidden>
    <div class="ttl"><span class="kico" id="kico"></span><div class="tt"><h1 id="title"></h1><div class="sub" id="sub"></div></div></div>
    <span class="spacer"></span>
    <button class="btn" id="cmode" title="Click an element to comment on it"><span data-i="msgplus"></span><span id="cmodet">Comment</span><kbd>C</kbd></button>
    <button class="btn icon" id="cpanel" title="Show comments"><span data-i="comment"></span><span class="badge" id="cbadge" hidden>0</span></button>
    <span class="vsep"></span>
    <div class="menuwrap">
      <button class="btn icon" id="more" title="More"><span data-i="more"></span></button>
      <div class="menu" id="menu" hidden>
        <button id="m-reload"><span data-i="refresh"></span>Reload preview</button>
        <a id="open" target="_blank" rel="noopener"><span data-i="external"></span>Open in new tab</a>
        <a id="download"><span data-i="download"></span>Export as HTML</a>
        <button id="copy"><span data-i="link"></span>Copy link</button>
      </div>
    </div>
  </header>
  <div class="stage" id="stage"></div>
  <div class="dock" id="dock" hidden>
    <div class="grp" id="devices">
      <button data-d="responsive" title="Fit to window"><span data-i="fit"></span></button>
      <button data-d="desktop" title="Desktop 1280 x 800"><span data-i="monitor"></span></button>
      <button data-d="tablet" title="Tablet 820 x 1100"><span data-i="tablet"></span></button>
      <button data-d="mobile" title="Mobile 390 x 800"><span data-i="phone"></span></button>
    </div>
    <span class="dsep" id="dsep"></span>
    <div class="grp" id="themes">
      <button data-t="auto" title="Follow system theme"><span data-i="auto"></span></button>
      <button data-t="light" title="Light"><span data-i="sun"></span></button>
      <button data-t="dark" title="Dark"><span data-i="moon"></span></button>
    </div>
    <span class="dsize" id="dsize"></span>
  </div>
</main>
<section id="panel" hidden>
  <div class="ph"><b>Comments</b><span class="cnt" id="pcnt"></span><span class="spacer"></span><button class="btn icon ghost" id="pclose" title="Close"><span data-i="x"></span></button></div>
  <div class="tabs" id="pfilter"><button data-f="open">Open</button><button data-f="resolved">Resolved</button><button data-f="all">All</button></div>
  <div id="threads"></div>
</section>
<div class="toast" id="toast"></div>
<script>
(function(){
  var KINDS=[["design-system","Design systems"],["screen","Screens"],["component","Components"],["prototype","Prototypes"],["system-design","System designs"],["document","Documents"]];
  var KIND_ICON={"design-system":"palette",screen:"monitor",component:"grid",prototype:"pointer","system-design":"network",document:"doc"};
  var FRAMED={screen:1,component:1,prototype:1,document:1};
  var SIZES={desktop:[1280,800],tablet:[820,1100],mobile:[390,800]};
  var ICON={
    layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    palette:'<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4c2 0 3.6-1.6 3.6-3.6C21 6.8 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    monitor:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    pointer:'<path d="M5 3l14 8-6 2-2 6z"/>',
    network:'<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.5 6h7M7.3 8.2l3.8 7.6M16.7 8.2l-3.8 7.6"/>',
    doc:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    comment:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    msgplus:'<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7.5v5M9.5 10h5"/>',
    x:'<path d="M6 6l12 12M18 6L6 18"/>',
    more:'<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    external:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    download:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    auto:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
    fit:'<path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/>',
    tablet:'<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M11 18.5h2"/>',
    phone:'<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
    check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    up:'<path d="M12 19V6M6 11.5L12 5.5l6 6"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/>',
    undo:'<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>'
  };
  function icon(n,s){s=s||16;return '<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+(ICON[n]||'')+'</svg>'}
  function paintIcons(root){[].forEach.call((root||document).querySelectorAll('[data-i]'),function(e){e.innerHTML=icon(e.getAttribute('data-i'),+e.getAttribute('data-s')||16);e.removeAttribute('data-i')})}

  var state={items:[],comments:[],current:null,device:null,theme:'auto',query:'',mode:false,panel:false,filter:'open',active:null,draft:null,replies:{},missing:{},ready:false,scroll:{},restore:null};
  var $=function(id){return document.getElementById(id)};
  var nav=$('nav'),stage=$('stage'),bar=$('bar'),threads=$('threads'),dock=$('dock');
  var token=new URLSearchParams(location.search).get('token')||'';
  function q(path){return path+(token?(path.indexOf('?')<0?'?':'&')+'token='+encodeURIComponent(token):'')}
  function hash(){return decodeURIComponent(location.hash.slice(1))}
  function toast(m){var t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){t.classList.remove('show')},2200)}
  function ago(ts){var s=Math.round((Date.now()-ts)/1000);if(s<10)return'just now';if(s<60)return s+'s ago';if(s<3600)return Math.round(s/60)+'m ago';if(s<86400)return Math.round(s/3600)+'h ago';return Math.round(s/86400)+'d ago'}
  function find(id){return state.items.filter(function(a){return a.id===id})[0]}
  function h(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
  function withIcon(tag,cls,name,label,size){var e=h(tag,cls);e.innerHTML=icon(name,size||15)+(label?'<span></span>':'');if(label)e.lastChild.textContent=label;return e}
  function api(method,path,body){
    return fetch(q(path),{method:method,headers:{'content-type':'application/json','x-canvas':'1'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j})});
  }
  function frameEl(){return stage.querySelector('iframe')}
  function post(m){var f=frameEl();if(!f||!f.contentWindow)return;m.canvas=1;f.contentWindow.postMessage(m,'*')}

  function designComments(){return state.comments.filter(function(c){return c.designId===state.current})}
  function numberOf(c){return designComments().indexOf(c)+1}
  function openCount(id){return state.comments.filter(function(c){return c.designId===id&&c.status==='open'}).length}

  function renderNav(){
    nav.textContent='';
    var term=state.query.toLowerCase();
    var shown=state.items.filter(function(a){return!term||(a.title+' '+a.id+' '+a.kind).toLowerCase().indexOf(term)>=0});
    if(!state.items.length){var e=h('div','empty');e.innerHTML='<b>Nothing here yet</b>Ask the agent to create a design system or a screen with the <code>canvas</code> tools.';nav.appendChild(e);return}
    if(!shown.length){nav.appendChild(h('div','empty','No designs match your search.'));return}
    KINDS.forEach(function(k){
      var list=shown.filter(function(a){return a.kind===k[0]});
      if(!list.length)return;
      var g=h('div','group');
      var hd=h('h3');hd.appendChild(h('span',null,k[1]));hd.appendChild(h('span',null,String(list.length)));g.appendChild(hd);
      list.forEach(function(a){
        var b=h('button','item'+(a.id===state.current?' active':''));
        b.innerHTML=icon(KIND_ICON[a.kind]||'doc',16);
        b.appendChild(h('span','t',a.title));
        var n=openCount(a.id);if(n)b.appendChild(h('span','cc',String(n)));
        else b.appendChild(h('span','rev','v'+a.revision));
        b.title=a.id+' \u00b7 v'+a.revision;b.onclick=function(){select(a.id)};g.appendChild(b);
      });
      nav.appendChild(g);
    });
  }

  function device(a){if(!FRAMED[a.kind])return'responsive';return state.device||a.device||'responsive'}

  function layout(){
    var a=find(state.current);if(!a)return;
    var box=stage.querySelector('.frame-box');if(!box)return;
    var wrap=box.firstChild,d=device(a);
    wrap.className='frame-wrap '+(d==='responsive'?'':d);
    if(d==='responsive'){
      box.style.width='100%';box.style.height='100%';
      wrap.style.width='100%';wrap.style.height='100%';wrap.style.transform='none';
      $('dsize').textContent='';
    }else{
      var s=SIZES[d],pad=d==='desktop'?0:20,W=s[0]+pad,H=s[1]+pad;
      var cs=getComputedStyle(stage);
      var aw=stage.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
      var ah=stage.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
      var k=Math.max(.1,Math.min(1,aw/W,ah/H));
      box.style.width=Math.round(W*k)+'px';box.style.height=Math.round(H*k)+'px';
      wrap.style.width=W+'px';wrap.style.height=H+'px';wrap.style.transform='scale('+k+')';
      $('dsize').textContent=s[0]+' \u00d7 '+s[1]+(k<.995?' \u00b7 '+Math.round(k*100)+'%':'');
    }
    [].forEach.call($('devices').children,function(b){b.classList.toggle('on',b.getAttribute('data-d')===d)});
  }

  function renderStage(force){
    var a=find(state.current);
    if(!a){
      bar.hidden=true;dock.hidden=true;stage.textContent='';state.ready=false;
      var w=h('div','welcome');w.innerHTML='<div class="ic">'+icon('layers',24)+'</div><h2>OpenCode Canvas</h2><p>Pick a design on the left. New designs the agent creates show up here automatically.</p>';
      stage.appendChild(w);return;
    }
    bar.hidden=false;dock.hidden=false;
    $('title').textContent=a.title;
    $('kico').innerHTML=icon(KIND_ICON[a.kind]||'doc',17);
    subtitle();
    var framed=!!FRAMED[a.kind];
    $('devices').hidden=!framed;$('dsep').hidden=!framed;
    [].forEach.call($('themes').children,function(b){b.classList.toggle('on',b.getAttribute('data-t')===state.theme)});
    var url=q('/view/'+encodeURIComponent(a.id)+'?inspect=1&v='+a.revision);
    $('open').href=q('/view/'+encodeURIComponent(a.id));
    $('download').href=q('/export/'+encodeURIComponent(a.id));
    $('download').setAttribute('download',a.id+'.html');
    var box=stage.querySelector('.frame-box'),frame=box&&box.querySelector('iframe');
    if(!box||box.getAttribute('data-id')!==a.id){
      stage.textContent='';
      var hint=h('div','hint');hint.innerHTML=icon('pointer',14)+'<span>Click an element to comment \u00b7 Esc to cancel</span>';stage.appendChild(hint);
      box=h('div','frame-box');box.setAttribute('data-id',a.id);
      var wrap=h('div','frame-wrap');
      frame=document.createElement('iframe');
      frame.setAttribute('sandbox','allow-scripts allow-forms allow-popups allow-modals');
      frame.title=a.title;wrap.appendChild(frame);box.appendChild(wrap);stage.appendChild(box);force=true;
    }
    layout();
    if(force||frame.getAttribute('data-rev')!==String(a.revision)){
      state.ready=false;
      state.restore=frame.getAttribute('data-rev')?state.scroll[a.id]||null:null;
      frame.setAttribute('data-rev',a.revision);frame.src=url;
    }
    syncFrame();
  }

  function subtitle(){var a=find(state.current);if(a)$('sub').textContent=a.kind.replace('-',' ')+' \u00b7 v'+a.revision+' \u00b7 updated '+ago(a.updatedAt)+(a.designSystem?' \u00b7 '+a.designSystem:'')}

  function pinList(){
    return designComments().filter(function(c){return c.status==='open'&&c.anchor}).map(function(c){return{id:c.id,n:numberOf(c),selector:c.anchor.selector}});
  }
  function syncFrame(){
    stage.classList.toggle('commenting',state.mode);
    post({type:'mode',on:state.mode});
    post({type:'theme',value:state.theme});
    post({type:'pins',pins:pinList(),active:state.active});
    var m=$('cmode');m.classList.toggle('on',state.mode);$('cmodet').textContent=state.mode?'Pick an element':'Comment';
    $('cpanel').classList.toggle('on',state.panel);
  }

  function visibleComments(){
    return designComments().filter(function(c){return state.filter==='all'||c.status===state.filter});
  }

  function keepFocus(fn){
    var el=document.activeElement,key=el&&el.getAttribute&&el.getAttribute('data-key'),start=el&&el.selectionStart,end=el&&el.selectionEnd;
    fn();
    if(key){var n=threads.querySelector('[data-key="'+key+'"]');if(n){n.focus();try{n.setSelectionRange(start,end)}catch(e){}}}
  }

  function autosize(t){t.style.height='auto';t.style.height=Math.min(140,t.scrollHeight+2)+'px'}
  function input(key,placeholder,rows,onSend){
    var t=document.createElement('textarea');t.rows=rows||1;t.placeholder=placeholder;t.setAttribute('data-key',key);
    t.value=state.replies[key]||'';
    t.oninput=function(){state.replies[key]=t.value;autosize(t)};
    t.onkeydown=function(e){
      if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();onSend()}
      if(e.key==='Escape'&&key==='draft'){e.stopPropagation();cancelDraft()}
    };
    setTimeout(function(){autosize(t)},0);
    return t;
  }
  function sendBtn(onClick,title){var b=h('button','send');b.title=title||'Send';b.innerHTML=icon('up',16);b.onclick=onClick;return b}

  function renderDraft(){
    var card=h('div','card draft');
    var head=h('div','chead');head.appendChild(h('span','pin','+'));
    head.appendChild(h('span','anchor',state.draft.anchor.label));
    head.appendChild(h('span','st','New comment'));
    card.appendChild(head);
    if(state.draft.anchor.text)card.appendChild(h('div','quote',state.draft.anchor.text));
    var box=h('div','draftbox');
    var send=function(){submitDraft()};
    box.appendChild(input('draft','What should change here?',3,send));
    var row=h('div','row');
    var s=withIcon('button','btn primary sm','up','Send to agent',14);s.onclick=send;
    var c=h('button','btn ghost sm','Cancel');c.onclick=cancelDraft;
    row.appendChild(s);row.appendChild(c);row.appendChild(h('span','spacer'));
    var k=h('kbd');k.textContent='Enter';row.appendChild(k);
    box.appendChild(row);card.appendChild(box);
    return card;
  }

  function stateLine(c){
    var last=c.messages[c.messages.length-1];
    if(c.delivery==='failed'||c.delivery==='pending'){
      var f=h('div','state'+(c.delivery==='failed'?' bad':''));
      f.appendChild(h('span',null,c.error||(c.delivery==='failed'?'Could not reach the agent.':'Waiting for an OpenCode session...')));
      f.appendChild(h('span','spacer'));
      var r=h('button','btn sm','Retry');r.onclick=function(){retry(c.id)};f.appendChild(r);return f;
    }
    if(c.status==='open'&&last&&last.role==='user'){var w=h('div','state');var d=h('span','dots');d.innerHTML='<i></i><i></i><i></i>';w.appendChild(d);w.appendChild(h('span',null,'Sent to the agent'));return w}
    return null;
  }

  function renderThread(c){
    var n=numberOf(c),done=c.status==='resolved';
    var card=h('div','card'+(c.id===state.active?' active':'')+(done?' resolved':''));
    card.setAttribute('data-id',c.id);
    var head=h('div','chead');
    var pin=h('span','pin'+(done?' done':''));
    if(done)pin.innerHTML=icon('check',13);else pin.textContent=String(n);
    head.appendChild(pin);
    head.appendChild(h('span','anchor',c.anchor?c.anchor.label:'whole design'));
    var st=h('span','st'+(done?' done':''));st.appendChild(h('i'));st.appendChild(h('span',null,done?'Resolved':'Open'));head.appendChild(st);
    head.onclick=function(){state.active=c.id;post({type:'pins',pins:pinList(),active:state.active});post({type:'focus',id:c.id});renderThreads()};
    card.appendChild(head);
    if(c.anchor&&c.anchor.text)card.appendChild(h('div','quote',c.anchor.text));
    if(state.missing[c.id]&&c.status==='open')card.appendChild(h('div','warn','This element is no longer in the design. The agent may have changed or removed it.'));
    var msgs=h('div','msgs');
    c.messages.forEach(function(m){
      msgs.appendChild(h('div','meta'+(m.role==='user'?' r':''),(m.role==='user'?'You':'Agent')+' \u00b7 '+ago(m.at)));
      msgs.appendChild(h('div','msg '+m.role,m.text));
    });
    card.appendChild(msgs);
    var sl=stateLine(c);if(sl)card.appendChild(sl);
    var compose=h('div','compose');
    var send=function(){submitReply(c.id)};
    compose.appendChild(input('r-'+c.id,done?'Reopen with a reply...':'Reply...',1,send));
    compose.appendChild(sendBtn(send));
    card.appendChild(compose);
    var foot=h('div','tf');foot.style.paddingTop='8px';
    var res=done?withIcon('button','btn sm','undo','Reopen',14):withIcon('button','btn sm','check','Resolve',14);
    res.onclick=function(){setStatus(c.id,done?'open':'resolved')};
    var del=h('button','btn ghost sm icon');del.innerHTML=icon('trash',14);del.title='Delete comment';del.style.width='28px';del.style.padding='0';del.onclick=function(){removeComment(c.id)};
    foot.appendChild(res);foot.appendChild(h('span','spacer'));foot.appendChild(del);card.appendChild(foot);
    return card;
  }

  function renderThreads(){
    var all=designComments(),open=all.filter(function(c){return c.status==='open'}).length;
    var badge=$('cbadge');badge.hidden=!open;badge.textContent=open;
    [].forEach.call($('pfilter').children,function(b){b.classList.toggle('on',b.getAttribute('data-f')===state.filter)});
    $('pcnt').textContent=all.length?open+' open':'';
    $('panel').hidden=!state.panel;
    $('cpanel').classList.toggle('on',state.panel);
    if(!state.panel)return;
    keepFocus(function(){
      threads.textContent='';
      if(state.draft&&state.draft.designId===state.current)threads.appendChild(renderDraft());
      var list=visibleComments();
      if(!list.length&&!state.draft){
        var e=h('div','none');
        e.innerHTML='<div class="ic">'+icon('msgplus',20)+'</div>';
        e.appendChild(h('b',null,all.length?'Nothing in this view':'No comments yet'));
        e.appendChild(h('span',null,all.length?'Try another tab above.':'Press Comment, click any element in the design and describe the change. The agent replies right here.'));
        threads.appendChild(e);
      }
      list.forEach(function(c){threads.appendChild(renderThread(c))});
    });
  }

  function togglePanel(on){state.panel=on==null?!state.panel:on;renderThreads();layout()}
  function setMode(on){
    state.mode=on;
    if(on){state.panel=true;state.draft=null}
    syncFrame();renderThreads();layout();
  }
  function cancelDraft(){state.draft=null;delete state.replies.draft;setMode(false)}

  function submitDraft(){
    var text=(state.replies.draft||'').trim();
    if(!text||!state.draft)return;
    var d=state.draft;
    api('POST','/api/comments',{designId:d.designId,text:text,anchor:d.anchor}).then(function(r){
      state.draft=null;delete state.replies.draft;state.active=r.comment.id;
      upsert(r.comment);afterChange();toast(r.comment.delivery==='sent'?'Sent to the agent':'Saved. Waiting for a session');
    }).catch(function(e){toast(e.message)});
  }
  function submitReply(id){
    var key='r-'+id,text=(state.replies[key]||'').trim();
    if(!text)return;
    api('POST','/api/comments/'+id+'/messages',{text:text}).then(function(r){delete state.replies[key];upsert(r.comment);afterChange()}).catch(function(e){toast(e.message)});
  }
  function retry(id){api('POST','/api/comments/'+id+'/retry').then(function(r){upsert(r.comment);afterChange()}).catch(function(e){toast(e.message)})}
  function setStatus(id,status){api('POST','/api/comments/'+id+'/status',{status:status}).then(function(r){upsert(r.comment);afterChange()}).catch(function(e){toast(e.message)})}
  function removeComment(id){api('DELETE','/api/comments/'+id).then(function(){state.comments=state.comments.filter(function(c){return c.id!==id});if(state.active===id)state.active=null;afterChange()}).catch(function(e){toast(e.message)})}
  function upsert(c){var i=state.comments.map(function(x){return x.id}).indexOf(c.id);if(i<0)state.comments.push(c);else state.comments[i]=c;state.comments.sort(function(a,b){return a.createdAt-b.createdAt})}
  function afterChange(){renderNav();renderThreads();syncFrame()}

  function select(id,keep){
    state.current=id;if(!keep)state.device=null;
    state.mode=false;state.draft=null;state.active=null;state.missing={};
    if(hash()!==id)history.replaceState(null,'','#'+encodeURIComponent(id));
    renderNav();renderThreads();renderStage(true);
  }

  function loadComments(){return fetch(q('/api/comments')).then(function(r){return r.json()}).then(function(d){state.comments=d.comments;renderNav();renderThreads();syncFrame()})}

  function load(focusId){
    return fetch(q('/api/artifacts')).then(function(r){return r.json()}).then(function(data){
      state.items=data.artifacts;
      var want=focusId||(find(state.current)?state.current:hash());
      if(!find(want))want=state.items.length?state.items[0].id:null;
      if(want!==state.current){select(want)}
      else{renderNav();renderStage(false)}
    });
  }

  function connect(){
    var es=new EventSource(q('/events'));
    es.onopen=function(){$('live').className='live';$('livet').textContent='Live \u00b7 '+location.host;loadComments()};
    es.onerror=function(){$('live').className='live off';$('livet').textContent='Reconnecting'};
    es.onmessage=function(m){
      var ev=JSON.parse(m.data);
      if(ev.type==='comment'){loadComments();return}
      if(ev.type==='remove'){load();loadComments();return}
      if(ev.type==='focus'){if(ev.id&&find(ev.id)&&!state.draft&&ev.id!==state.current)select(ev.id);return}
      var wasCurrent=state.current===ev.id;
      load(ev.focus&&!wasCurrent&&!state.draft?ev.id:null).then(function(){if(ev.focus&&!wasCurrent&&!state.draft)toast('Showing '+(find(ev.id)||{title:ev.id}).title)});
    };
  }

  addEventListener('message',function(e){
    var f=frameEl(),d=e.data;
    if(!f||e.source!==f.contentWindow||!d||d.canvas!==1)return;
    if(d.type==='ready'){
      state.ready=true;syncFrame();
      if(state.restore){post({type:'restore',x:state.restore.x,y:state.restore.y});if(d.loaded)state.restore=null}
    }
    else if(d.type==='scroll'){if(!state.restore)state.scroll[state.current]={x:d.x,y:d.y}}
    else if(d.type==='pick'&&d.anchor){
      state.draft={designId:state.current,anchor:d.anchor};state.panel=true;state.mode=false;
      syncFrame();renderThreads();layout();
      var t=threads.querySelector('[data-key="draft"]');if(t)t.focus();
    }
    else if(d.type==='pin-click'){state.active=d.id;state.panel=true;if(state.filter==='resolved')state.filter='open';renderThreads();layout();syncFrame();var c=threads.querySelector('[data-id="'+d.id+'"]');if(c)c.scrollIntoView({block:'nearest',behavior:'smooth'})}
    else if(d.type==='missing'){state.missing={};(d.ids||[]).forEach(function(id){state.missing[id]=1});renderThreads()}
    else if(d.type==='cancel'){if(state.mode)setMode(false)}
  });

  function closeMenu(){$('menu').hidden=true}
  $('more').onclick=function(e){e.stopPropagation();$('menu').hidden=!$('menu').hidden};
  addEventListener('click',function(e){if(!$('menu').hidden&&!e.target.closest('.menuwrap'))closeMenu()});
  $('menu').onclick=closeMenu;
  $('m-reload').onclick=function(){renderStage(true)};
  $('q').oninput=function(e){state.query=e.target.value;renderNav()};
  $('devices').onclick=function(e){var b=e.target.closest('button'),d=b&&b.getAttribute('data-d');if(d){state.device=d;renderStage(false)}};
  $('themes').onclick=function(e){var b=e.target.closest('button'),t=b&&b.getAttribute('data-t');if(t){state.theme=t;renderStage(false)}};
  $('pfilter').onclick=function(e){var f=e.target.getAttribute&&e.target.getAttribute('data-f');if(f){state.filter=f;renderThreads()}};
  $('cmode').onclick=function(){setMode(!state.mode)};
  $('cpanel').onclick=function(){togglePanel()};
  $('pclose').onclick=function(){togglePanel(false)};
  $('copy').onclick=function(){var a=find(state.current);if(!a)return;var u=location.origin+'/view/'+encodeURIComponent(a.id)+(token?'?token='+encodeURIComponent(token):'');(navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){toast('Link copied')},function(){toast(u)})};
  addEventListener('keydown',function(e){
    var tag=(e.target.tagName||'').toLowerCase();
    if(e.key==='Escape'){closeMenu();if(state.draft)cancelDraft();else if(state.mode)setMode(false);return}
    if(tag==='textarea'||tag==='input'||e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.key==='/'){e.preventDefault();$('q').focus();return}
    if((e.key==='c'||e.key==='C')&&find(state.current)){e.preventDefault();setMode(!state.mode)}
  });
  addEventListener('hashchange',function(){var id=hash();if(id&&id!==state.current&&find(id))select(id)});
  addEventListener('resize',layout);
  setInterval(subtitle,30000);
  paintIcons();
  load().then(function(){return loadComments()}).then(connect);
})();
</script>
</body>
</html>`
