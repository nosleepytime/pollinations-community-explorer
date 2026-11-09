import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Search, RefreshCw, ChevronDown, ExternalLink, SlidersHorizontal, Sparkles, Eye, Video, BrainCircuit, Wrench, Globe2, Code2, AudioLines, Image as ImageIcon, Box, Clock3, Activity, Zap, X, Check, CircleHelp, ArrowUpRight, Layers3 } from "lucide-react";
import "./styles.css";

const API = "https://gen.pollinations.ai/models?source=community&reliability=all";
const REFRESH_MS = 20_000;

const get = (obj, ...keys) => {
  for (const key of keys) if (obj?.[key] !== undefined && obj?.[key] !== null) return obj[key];
  return undefined;
};
const str = (v) => typeof v === "string" ? v : v == null ? "" : String(v);
const arr = (v) => Array.isArray(v) ? v : v ? [v] : [];
const titleCase = (s) => str(s).replace(/[_-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());

function modelList(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["models", "data", "items", "results"]) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}
function modelId(m) { return str(get(m, "id", "name", "model")); }
function modelTitle(m) { return str(get(m, "title", "name", "id", "model")) || "Untitled model"; }
function modelCategory(m) { return str(get(m, "category", "type", "model_type")).toLowerCase() || "other"; }
function capabilities(m) {
  const c = get(m, "capabilities", "features");
  if (Array.isArray(c)) return c.map(x => typeof x === "string" ? x : str(x?.name || x?.id)).filter(Boolean);
  if (c && typeof c === "object") return Object.entries(c).filter(([,v]) => v === true || (v && typeof v === "object" && v.enabled !== false)).map(([k]) => k);
  return [];
}
function modalityList(m) {
  return [...arr(get(m, "input_modalities", "inputModalities", "modalities", "modalities_supported")), ...arr(get(m, "output_modalities", "outputModalities"))].map(x => str(x).toLowerCase());
}
function numericPrices(m) {
  const found = [];
  const walk = (obj, path = "") => {
    if (!obj || typeof obj !== "object") return;
    for (const [k,v] of Object.entries(obj)) {
      const p = path ? path + "." + k : k;
      if (typeof v === "number" && /(price|cost|pollen|per_token|per_image|per_second|input|output|prompt|completion)/i.test(k)) found.push(v);
      else if (v && typeof v === "object") walk(v,p);
    }
  };
  walk(get(m, "pricing", "prices", "price"));
  for (const k of ["input_price","output_price","price_per_image","price_per_second","prompt_text_price","completion_text_price"]) if (typeof m?.[k] === "number") found.push(m[k]);
  return found;
}
function isFree(m) {
  if (get(m, "paid_only", "paidOnly") === true) return false;
  if (get(m, "is_free", "free") === true) return true;
  const p = numericPrices(m);
  return p.length > 0 && p.every(n => n === 0);
}
function rpm(m) {
  const n = get(m, "per_user_rpm", "perUserRpm", "rpm", "requests_per_minute");
  return typeof n === "number" ? n.toLocaleString() : "Not published";
}
function status(m) {
  const h = get(m, "health", "status");
  const s = typeof h === "string" ? h : get(h, "status");
  return str(s).toLowerCase() || "unreported";
}
function categoryLabel(c) {
  return ({text:"Text & reasoning",image:"Image generation",video:"Video generation",audio:"Audio",embedding:"Embeddings","3d":"3D generation",realtime:"Realtime",decision:"Decision"}[c] || titleCase(c));
}
function iconForCapability(cap) {
  const c = cap.toLowerCase();
  if (c.includes("vision") || c.includes("image") || c.includes("visual")) return Eye;
  if (c.includes("video") || c.includes("frame")) return Video;
  if (c.includes("reason")) return BrainCircuit;
  if (c.includes("tool") || c.includes("call") || c.includes("function")) return Wrench;
  if (c.includes("search") || c.includes("web")) return Globe2;
  if (c.includes("code")) return Code2;
  if (c.includes("audio") || c.includes("speech") || c.includes("voice")) return AudioLines;
  return Sparkles;
}
function capabilityGroups(m) {
  const caps = capabilities(m);
  const mods = modalityList(m);
  const text = caps.join(" ").toLowerCase();
  const groups = [];
  if (mods.some(x => x.includes("image")) || /vision|image_input|image input/.test(text)) groups.push(["Vision capabilities", Eye]);
  if (mods.some(x => x.includes("video")) || /video/.test(text)) groups.push(["Video vision capabilities", Video]);
  if (/reason/.test(text) || get(m,"reasoning") === true) groups.push(["Reasoning capabilities", BrainCircuit]);
  if (/tool_calling|function.?call|tool.?use/.test(text) || get(m,"tool_calling") === true) groups.push(["Calling capabilities", Wrench]);
  if (/web_search|search/.test(text)) groups.push(["Web search", Globe2]);
  if (/code_execution/.test(text)) groups.push(["Code execution", Code2]);
  if (mods.some(x => x.includes("audio"))) groups.push(["Audio capabilities", AudioLines]);
  return groups;
}
function App() {
  const [models,setModels] = useState([]);
  const [previous,setPrevious] = useState([]);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,setError] = useState("");
  const [lastUpdated,setLastUpdated] = useState(null);
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("all");
  const [capFilter,setCapFilter] = useState("all");
  const [freeOnly,setFreeOnly] = useState(true);
  const [sort,setSort] = useState("name");
  const [showFilters,setShowFilters] = useState(false);
  const [selected,setSelected] = useState(null);
  const [changeLog,setChangeLog] = useState({added:[],removed:[],changed:[]});

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch(API, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!res.ok) throw new Error(`Catalog returned HTTP ${res.status}`);
      const payload = await res.json();
      const next = modelList(payload);
      if (!Array.isArray(next)) throw new Error("Unexpected catalog response");
      setModels(old => {
        const oldMap = new Map(old.map(m => [modelId(m), JSON.stringify(m)]));
        const nextMap = new Map(next.map(m => [modelId(m), JSON.stringify(m)]));
        const added = next.filter(m => !oldMap.has(modelId(m)));
        const removed = old.filter(m => !nextMap.has(modelId(m)));
        const changed = next.filter(m => oldMap.has(modelId(m)) && oldMap.get(modelId(m)) !== nextMap.get(modelId(m)));
        if (old.length) setChangeLog({added,removed,changed});
        setPrevious(old);
        return next;
      });
      setError("");
      setLastUpdated(new Date());
    } catch (e) {
      setError(e?.message || "Unable to load the Pollinations catalog.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => refresh(false), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const freeCount = useMemo(() => models.filter(isFree).length,[models]);
  const categories = useMemo(() => ["all",...new Set(models.map(modelCategory))].sort((a,b)=>a==="all"?-1:a.localeCompare(b)),[models]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = models.filter(m => {
      if (freeOnly && !isFree(m)) return false;
      if (category !== "all" && modelCategory(m) !== category) return false;
      if (capFilter !== "all" && !capabilityGroups(m).some(([label]) => label === capFilter)) return false;
      if (q && ![modelTitle(m),modelId(m),get(m,"description"),get(m,"publisher"),...capabilities(m)].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a,b) => sort === "rpm" ? (Number(get(b,"per_user_rpm","perUserRpm"))||-1)-(Number(get(a,"per_user_rpm","perUserRpm"))||-1) : modelTitle(a).localeCompare(modelTitle(b)));
  },[models,freeOnly,category,capFilter,query,sort]);

  const updatedText = lastUpdated ? lastUpdated.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "Waiting for first sync";
  const selectedModel = selected ? models.find(m => modelId(m) === selected) : null;

  return <div className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <a className="brand" href="https://pollinations.ai/" target="_blank" rel="noreferrer"><span className="brand-mark"><Sparkles size={19}/></span><span>pollinations<span className="brand-muted"> / explorer</span></span></a>
      <div className="topbar-right"><span className="live-dot"/><span className="live-label">LIVE CATALOG</span><span className="top-separator"/><span className="sync-label"><RefreshCw size={12}/> Auto-sync · 20s</span></div>
    </header>

    <main className="main">
      <section className="hero">
        <div className="eyebrow"><span className="eyebrow-line"/> COMMUNITY COLLECTION <span className="eyebrow-line"/></div>
        <h1>Find your next<br/><span>AI model.</span></h1>
        <p className="hero-copy">A live directory of community-built models on Pollinations.<br className="desktop-break"/> Explore capabilities, limits and metadata in one place.</p>
        <div className="hero-stats">
          <div><strong>{loading ? "—" : freeCount.toLocaleString()}</strong><span>FREE MODELS</span></div>
          <i/>
          <div><strong>{loading ? "—" : models.length.toLocaleString()}</strong><span>COMMUNITY MODELS</span></div>
          <i/>
          <div><strong>20s</strong><span>REFRESH RATE</span></div>
        </div>
      </section>

      <section className="catalog-section">
        <div className="section-heading"><div><div className="section-kicker">THE DIRECTORY</div><h2>Community models <span className="count-pill">{filtered.length}</span></h2></div>
          <button className="refresh-button" onClick={()=>refresh(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing?"spin":""}/>{refreshing?"Refreshing":"Manual refresh"}</button>
        </div>

        <div className="toolbar">
          <div className="searchbox"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search models, publishers, capabilities…"/>{query && <button onClick={()=>setQuery("")} aria-label="Clear search"><X size={15}/></button>}<kbd>⌘ K</kbd></div>
          <button className={showFilters?"filter-button active":"filter-button"} onClick={()=>setShowFilters(v=>!v)}><SlidersHorizontal size={16}/> Filters <ChevronDown size={14}/></button>
        </div>

        {showFilters && <div className="filter-panel">
          <label className="toggle-row"><span><strong>Free models only</strong><small>Only models with explicitly zero pricing</small></span><button role="switch" aria-checked={freeOnly} className={freeOnly?"switch on":"switch"} onClick={()=>setFreeOnly(v=>!v)}><span/></button></label>
          <label className="select-label">SORT BY<select value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Model name</option><option value="rpm">Highest RPM first</option></select></label>
          <label className="select-label">CAPABILITY<select value={capFilter} onChange={e=>setCapFilter(e.target.value)}><option value="all">All capabilities</option>{["Vision capabilities","Video vision capabilities","Reasoning capabilities","Calling capabilities","Web search","Code execution","Audio capabilities"].map(x=><option key={x}>{x}</option>)}</select></label>
        </div>}

        <div className="category-row">
          {categories.map(c=><button key={c} onClick={()=>setCategory(c)} className={category===c?"category-chip selected":"category-chip"}>{c==="all"?"All models":categoryLabel(c)}</button>)}
        </div>

        <div className="catalog-meta"><span>{loading?"SYNCING CATALOG":`SHOWING ${filtered.length} OF ${models.length} MODELS`}</span><span className="updated"><span className="tiny-live"/> Last updated {updatedText}</span></div>
        {error && <div className="error-banner"><CircleHelp size={16}/><span>{error} <button onClick={()=>refresh(true)}>Try again</button></span></div>}
        {changeLog.added.length+changeLog.removed.length+changeLog.changed.length>0 && <div className="change-banner"><Activity size={15}/><span>Catalog changes detected: {changeLog.added.length} added · {changeLog.removed.length} removed · {changeLog.changed.length} updated</span><button onClick={()=>setChangeLog({added:[],removed:[],changed:[]})}>Dismiss</button></div>}

        {loading ? <div className="loading-grid">{[1,2,3,4,5,6].map(x=><div className="skeleton" key={x}/>)}</div> :
          filtered.length ? <div className="model-grid">{filtered.map(m=><ModelCard key={modelId(m)} model={m} onClick={()=>setSelected(modelId(m))}/>)}</div> :
          <div className="empty-state"><Layers3 size={30}/><h3>No models found</h3><p>Try changing your search or filters.</p><button onClick={()=>{setQuery("");setCategory("all");setCapFilter("all");setFreeOnly(false)}}>Clear filters</button></div>}
      </section>

      <footer className="footer"><div className="footer-brand"><span className="brand-mark small"><Sparkles size={14}/></span><span>COMMUNITY MODEL EXPLORER</span></div><p>Made by <a href="https://guns.lol/nosleepytimee" target="_blank" rel="noreferrer">3fow <ArrowUpRight size={12}/></a></p><p>This website is not associated with Pollinations.ai.</p><p><a href="https://pollinations.ai/" target="_blank" rel="noreferrer">Official Pollinations website <ExternalLink size={11}/></a></p><small>© {new Date().getFullYear()} 3fow. All rights reserved.</small></footer>
    </main>

    <a className="floating-source" href="https://enter.pollinations.ai/models?q=source:community" target="_blank" rel="noreferrer"><span className="source-spark">✳</span> Models from Pollinations.ai <ExternalLink size={13}/></a>
    {selectedModel && <ModelModal model={selectedModel} onClose={()=>setSelected(null)}/>}
  </div>;
}

function ModelCard({model:m,onClick}) {
  const caps=capabilities(m), groups=capabilityGroups(m), category=modelCategory(m);
  const desc=str(get(m,"description","summary")) || "No description has been published for this model.";
  const health=status(m);
  const price=numericPrices(m);
  return <button className="model-card" onClick={onClick}>
    <div className="card-top"><span className="model-type"><span className="type-icon"><Layers3 size={13}/></span>{categoryLabel(category)}</span><span className={health==="healthy"||health==="operational"?"health healthy":"health"}><i/>{titleCase(health)}</span></div>
    <div className="model-name-row"><h3>{modelTitle(m)}</h3><ArrowUpRight size={16}/></div>
    <div className="model-id">{modelId(m)}</div>
    <p className="model-description">{desc}</p>
    <div className="capability-tags">{groups.slice(0,3).map(([label,Icon])=><span key={label}><Icon size={12}/>{label}</span>)}{caps.length>0&&!groups.length&&caps.slice(0,2).map(c=><span key={c}><Sparkles size={12}/>{titleCase(c)}</span>)}{!groups.length&&!caps.length&&<span className="muted-tag">No capabilities listed</span>}</div>
    <div className="card-divider"/>
    <div className="card-stats"><div><span>REQUESTS / MIN</span><strong>{rpm(m)}</strong></div><div><span>PRICING</span><strong className={isFree(m)?"free-text":""}>{isFree(m)?"Free":price.length?"Paid / mixed":"Not published"}</strong></div><div><span>CONTEXT</span><strong>{get(m,"context_length","contextLength") ? Number(get(m,"context_length","contextLength")).toLocaleString() : "—"}</strong></div></div>
  </button>;
}

function ModelModal({model:m,onClose}) {
  const caps=capabilities(m), mods=modalityList(m), groups=capabilityGroups(m);
  const details=[
    ["Model ID",modelId(m)],["Publisher",get(m,"publisher","owner")||"Not published"],["Category",categoryLabel(modelCategory(m))],["Requests per minute",rpm(m)],["Context length",get(m,"context_length","contextLength")?.toLocaleString?.()||"Not published"],["Pricing",isFree(m)?"Free (zero-priced)":numericPrices(m).length?"Pricing applies":"Not published"],["Health",titleCase(status(m))],["Streaming",get(m,"supports_streaming","streaming")===true?"Supported":get(m,"supports_streaming","streaming")===false?"Not supported":"Not published"]
  ];
  useEffect(()=>{const fn=e=>{if(e.key==="Escape")onClose()};window.addEventListener("keydown",fn);return()=>window.removeEventListener("keydown",fn)},[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal">
    <div className="modal-head"><div><div className="section-kicker">MODEL DETAILS</div><h2>{modelTitle(m)}</h2><code>{modelId(m)}</code></div><button className="close-button" onClick={onClose}><X size={18}/></button></div>
    <p className="modal-description">{get(m,"description","summary")||"No description has been published."}</p>
    <div className="details-grid">{details.map(([k,v])=><div className="detail-cell" key={k}><span>{k}</span><strong>{String(v)}</strong></div>)}</div>
    <div className="modal-block"><h4>CAPABILITIES</h4><div className="modal-tags">{caps.length?caps.map(c=>{const Icon=iconForCapability(c);return <span key={c}><Icon size={14}/>{titleCase(c)}</span>}):<em>Not published</em>}</div></div>
    <div className="modal-block"><h4>MODALITIES</h4><div className="modal-tags">{mods.length?mods.map(x=><span key={x}>{titleCase(x)}</span>):<em>Not published</em>}</div></div>
    <div className="modal-block"><h4>SUPPORTED ENDPOINTS</h4><div className="modal-tags">{arr(get(m,"supported_endpoints","endpoints")).length?arr(get(m,"supported_endpoints","endpoints")).map(x=><span key={str(x)}>{str(x)}</span>):<em>Not published</em>}</div></div>
    <div className="modal-note"><CircleHelp size={15}/> Limits and capabilities are shown only when Pollinations publishes them. “Not published” does not mean unsupported.</div>
    <a className="modal-link" href="https://enter.pollinations.ai/models?q=source:community" target="_blank" rel="noreferrer">Open Pollinations model catalog <ExternalLink size={14}/></a>
  </section></div>;
}

createRoot(document.getElementById("root")).render(<App/>);