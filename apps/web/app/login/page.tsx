import { LoginForm } from "./login-form";

const PREVIEW_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0d1117;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    overflow: hidden;
  }
  .wrap { width: 100%; max-width: 480px; }
  .eyebrow { font-size:11px; font-weight:700; letter-spacing:.10em; text-transform:uppercase; color:#f45b52; margin-bottom:8px; }
  .heading { font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:22px; }
  .metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px; }
  .metric { background:#161b27; border:1px solid #1f2937; border-radius:12px; padding:14px; animation:fadeUp .5s ease both; }
  .metric:nth-child(2) { animation-delay:.1s; }
  .metric:nth-child(3) { animation-delay:.2s; }
  .m-label { font-size:10px; color:#6b7280; font-weight:600; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px; }
  .m-value { font-size:20px; font-weight:800; color:#f8fafc; font-variant-numeric:tabular-nums; }
  .m-delta { font-size:10px; color:#22c55e; font-weight:600; margin-top:3px; }
  .chart-wrap { background:#161b27; border:1px solid #1f2937; border-radius:12px; padding:16px 18px 10px; margin-bottom:12px; animation:fadeUp .5s ease .3s both; }
  .chart-label { font-size:11px; color:#9ca3af; font-weight:600; margin-bottom:10px; }
  .grid-line { stroke:#263244; stroke-width:1; opacity:.72; }
  .axis-label { fill:#64748b; font-size:8px; font-weight:600; }
  .chart-reveal { transform-box:fill-box; transform-origin:left center; transform:scaleX(0); animation:revealChart 2.4s cubic-bezier(.16,1,.3,1) .45s forwards; }
  .chart-path, .chart-path-2 { stroke-dasharray:900; stroke-dashoffset:900; animation:drawLine 2.45s cubic-bezier(.16,1,.3,1) .45s forwards; }
  .chart-path-2 { animation-delay:.62s; }
  .bars { background:#161b27; border:1px solid #1f2937; border-radius:12px; padding:14px 18px; animation:fadeUp .5s ease .5s both; }
  .bar-row { display:flex; align-items:center; gap:10px; margin-bottom:9px; }
  .bar-row:last-child { margin-bottom:0; }
  .bar-name { font-size:10px; color:#9ca3af; font-weight:600; width:52px; flex-shrink:0; }
  .bar-track { flex:1; height:7px; background:#1f2937; border-radius:99px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:99px; width:0; transition:width 1.4s cubic-bezier(.16,1,.3,1); }
  .bar-val { font-size:10px; color:#6b7280; width:32px; text-align:right; flex-shrink:0; }
  .glow { position:fixed; top:-120px; right:-120px; width:360px; height:360px; border-radius:50%; background:radial-gradient(circle,rgba(244,91,82,.15) 0%,transparent 70%); pointer-events:none; }
  @keyframes drawLine { to { stroke-dashoffset:0; } }
  @keyframes revealChart { to { transform:scaleX(1); } }
  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
</style>
</head>
<body>
<div class="glow"></div>
<div class="wrap">
  <div class="eyebrow">Live dashboard preview</div>
  <div class="heading">Everything in one view.</div>
  <div class="metrics">
    <div class="metric">
      <div class="m-label">Revenue</div>
      <div class="m-value" id="rev">$0</div>
      <div class="m-delta">↑ 18% vs last mo.</div>
    </div>
    <div class="metric">
      <div class="m-label">GSC Clicks</div>
      <div class="m-value" id="clicks">0</div>
      <div class="m-delta">↑ 34% vs last mo.</div>
    </div>
    <div class="metric">
      <div class="m-label">Amazon Orders</div>
      <div class="m-value" id="orders">0</div>
      <div class="m-delta">↑ 12% vs last mo.</div>
    </div>
  </div>
  <div class="chart-wrap">
    <div class="chart-label">GSC Clicks &amp; Impressions — last 30 days</div>
    <svg viewBox="0 0 460 112" fill="none" style="width:100%;display:block;">
      <defs>
        <linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f45b52" stop-opacity=".24"/>
          <stop offset="100%" stop-color="#f45b52" stop-opacity="0"/>
        </linearGradient>
        <clipPath id="chartClip">
          <rect class="chart-reveal" x="34" y="6" width="406" height="82" rx="0"/>
        </clipPath>
      </defs>
      <line class="grid-line" x1="34" y1="14" x2="440" y2="14"/>
      <line class="grid-line" x1="34" y1="38" x2="440" y2="38"/>
      <line class="grid-line" x1="34" y1="62" x2="440" y2="62"/>
      <line class="grid-line" x1="34" y1="86" x2="440" y2="86"/>
      <text class="axis-label" x="9" y="17">2</text>
      <text class="axis-label" x="7" y="41">1.5</text>
      <text class="axis-label" x="9" y="65">1</text>
      <text class="axis-label" x="7" y="89">0</text>
      <text class="axis-label" x="34" y="107">Mar 29</text>
      <text class="axis-label" x="191" y="107">Apr 5</text>
      <text class="axis-label" x="332" y="107">Apr 19</text>
      <g clip-path="url(#chartClip)">
        <path d="M34,86 L34,62 L48,86 L62,86 L76,62 L90,86 L104,86 L118,62 L132,86 L146,86 L160,14 L174,86 L188,86 L202,62 L216,86 L230,62 L244,86 L258,14 L272,86 L286,86 L300,86 L314,86 L328,62 L342,86 L356,86 L370,86 L384,86 L398,14 L412,50 L426,86" fill="none" stroke="#f45b52" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity=".22"/>
        <path d="M34,86 L48,53 L62,64 L76,57 L90,64 L104,64 L118,36 L132,44 L146,60 L160,76 L174,82 L188,24 L202,44 L216,14 L230,53 L244,47 L258,36 L272,86 L286,78 L300,78 L314,67 L328,60 L342,47 L356,26 L370,78 L384,65 L398,73 L412,69 L426,78" fill="none" stroke="#818cf8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity=".22"/>
        <path d="M34,86 L34,62 L48,86 L62,86 L76,62 L90,86 L104,86 L118,62 L132,86 L146,86 L160,14 L174,86 L188,86 L202,62 L216,86 L230,62 L244,86 L258,14 L272,86 L286,86 L300,86 L314,86 L328,62 L342,86 L356,86 L370,86 L384,86 L398,14 L412,50 L426,86 L426,94 L34,94 Z" fill="url(#gfill)" opacity=".55"/>
        <path class="chart-path" d="M34,86 L34,62 L48,86 L62,86 L76,62 L90,86 L104,86 L118,62 L132,86 L146,86 L160,14 L174,86 L188,86 L202,62 L216,86 L230,62 L244,86 L258,14 L272,86 L286,86 L300,86 L314,86 L328,62 L342,86 L356,86 L370,86 L384,86 L398,14 L412,50 L426,86" stroke="#f45b52" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="chart-path-2" d="M34,86 L48,53 L62,64 L76,57 L90,64 L104,64 L118,36 L132,44 L146,60 L160,76 L174,82 L188,24 L202,44 L216,14 L230,53 L244,47 L258,36 L272,86 L286,78 L300,78 L314,67 L328,60 L342,47 L356,26 L370,78 L384,65 L398,73 L412,69 L426,78" stroke="#818cf8" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g style="opacity:.9;">
        <line x1="244" y1="98" x2="268" y2="98" stroke="#f45b52" stroke-width="2.6"/>
        <text class="axis-label" x="274" y="101">Clicks</text>
        <line x1="322" y1="98" x2="346" y2="98" stroke="#818cf8" stroke-width="2.6"/>
        <text class="axis-label" x="352" y="101">Impressions</text>
      </g>
    </svg>
  </div>
  <div class="bars">
    <div class="bar-row">
      <div class="bar-name">Shopify</div>
      <div class="bar-track"><div class="bar-fill" id="b1" style="background:#f45b52"></div></div>
      <div class="bar-val">$8.2k</div>
    </div>
    <div class="bar-row">
      <div class="bar-name">Amazon</div>
      <div class="bar-track"><div class="bar-fill" id="b2" style="background:#ffb454"></div></div>
      <div class="bar-val">$4.6k</div>
    </div>
    <div class="bar-row">
      <div class="bar-name">Organic</div>
      <div class="bar-track"><div class="bar-fill" id="b3" style="background:#818cf8"></div></div>
      <div class="bar-val">3.2k</div>
    </div>
  </div>
</div>
<script>
function countUp(id,target,prefix,dur){var el=document.getElementById(id),start=null;function step(ts){if(!start)start=ts;var p=Math.min((ts-start)/dur,1);var ease=1-Math.pow(1-p,3);el.textContent=prefix+Math.floor(ease*target).toLocaleString();if(p<1)requestAnimationFrame(step);}requestAnimationFrame(step);}
setTimeout(function(){countUp('rev',12840,'$',1800);countUp('clicks',3241,'',1800);countUp('orders',284,'',1800);},400);
setTimeout(function(){[['b1',72],['b2',40],['b3',28]].forEach(function(b){var el=document.getElementById(b[0]);if(el)el.style.width=b[1]+'%';});},600);
</script>
</body>
</html>`;

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh bg-[#0d1117]">
      {/* Left — form */}
      <div className="flex w-full flex-col justify-center px-8 py-12 md:w-[420px] md:shrink-0 lg:px-12">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#f45b52] to-[#ffb454] text-base font-black text-white">
            ✦
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-100">Sunday Stripe</p>
            <p className="text-xs text-zinc-500">Commerce Hub</p>
          </div>
        </div>

        <h1 className="mb-1 text-2xl font-extrabold text-zinc-100">Welcome back</h1>
        <p className="mb-8 text-sm text-zinc-500">Sign in to your operations dashboard.</p>

        <LoginForm />
      </div>

      {/* Right — animated preview */}
      <div className="hidden flex-1 overflow-hidden md:block">
        <iframe
          srcDoc={PREVIEW_HTML}
          className="h-full w-full border-0"
          title="Dashboard preview"
          sandbox="allow-scripts"
        />
      </div>
    </div>
  );
}
