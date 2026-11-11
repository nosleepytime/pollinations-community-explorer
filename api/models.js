/** GET /api/models — transparent, searchable mirror of Pollinations public catalog.
 * No API key is used; no paid generations are executed. */
const UPSTREAM = 'https://gen.pollinations.ai/models';
const MAX_LIMIT = 1000;
const CACHE_MS = 15_000;
let cache = { at: 0, models: null };

const str = v => v == null ? '' : String(v).trim();
const bool = (v, fallback = false) => v == null || v === '' ? fallback : ['1','true','yes','on'].includes(str(v).toLowerCase());
const number = v => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const nested = (o,...keys) => keys.reduce((v,k)=>v?.[k],o);
const own = (o,k) => o && Object.prototype.hasOwnProperty.call(o,k);
const flat = arr => [...new Set(arr.flat(Infinity).filter(Boolean).map(x=>str(x).toLowerCase()))];

export function getCategory(m) {
  const cat = str(m.category || m.type || m.model_type || m.modality || '').toLowerCase();
  if (/embedding/.test(cat)) return 'embeddings';
  if (/video/.test(cat)) return 'video';
  if (/audio|speech|transcri|tts/.test(cat)) return 'audio';
  if (/image/.test(cat)) return 'image';
  if (/3d/.test(cat)) return '3d';
  if (/real.?time/.test(cat)) return 'realtime';
  return 'text';
}

export function getCapabilities(m) {
  const c = m.capabilities || {};
  const flags = [];
  const has = (...names) => names.some(k => c[k] === true || m[k] === true || nested(m,'supports',k) === true);
  const declared = Array.isArray(c) ? c : Object.entries(c).filter(([,v])=>v===true).map(([k])=>k);
  for (const x of declared) flags.push(String(x).replaceAll('_','-').toLowerCase());
  if(has('vision','supports_vision','image_input','input_image'))flags.push('vision');
  if(has('video_vision','video_input','supports_video','video_understanding'))flags.push('video-vision');
  if(has('reasoning','supports_reasoning','thinking'))flags.push('reasoning');
  if(has('tools','tool_calling','function_calling','supports_tools','functionCalling'))flags.push('tool-calling');
  if(has('streaming','supports_streaming'))flags.push('streaming');
  const input = flat([m.input_modalities || [], nested(m,'modalities','input') || [], m.input || []]);
  const output = flat([m.output_modalities || [], nested(m,'modalities','output') || [], m.output || []]);
  if(input.includes('image'))flags.push('vision');
  if(input.includes('video'))flags.push('video-vision');
  if(input.includes('audio'))flags.push('audio-input');
  if(output.includes('audio'))flags.push('audio-output');
  if(output.includes('image') || getCategory(m)==='image')flags.push('image-generation');
  if(output.includes('video') || getCategory(m)==='video')flags.push('video-generation');
  if(getCategory(m)==='embeddings')flags.push('embeddings');
  if(Array.isArray(m.supported_endpoints) && m.supported_endpoints.some(e=>/chat.completions|responses/.test(e)))flags.push('chat');
  return [...new Set(flags)];
}

function priceValues(m) {
  const o = m.pricing ?? m.price ?? m.cost;
  if(o === null || o === undefined) return [];
  if(typeof o === 'number')return [o];
  if(typeof o === 'string') {
    const n = Number(o); return Number.isFinite(n) ? [n] : [];
  }
  if(typeof o !== 'object')return [];
  const result=[];
  for(const [k,v] of Object.entries(o)) {
    if (/currency|unit|symbol|model|description/i.test(k))continue;
    if(typeof v==='object' && v!==null)result.push(...priceValues({pricing:v}));
    else if((typeof v === 'number' || typeof v === 'string') && str(v)!==''){
      const n = Number(v);if(Number.isFinite(n))result.push(n);
    }
  }
  return result;
}

/** "unknown" is not the same as free. Never label missing prices as verified free. */
export function getFreeStatus(m){
  if(m.paid_only === true || m.is_paid === true || m.requires_payment === true || m.free === false || m.is_free === false)return 'paid';
  if(m.free === true || m.is_free === true)return 'free';
  const prices = priceValues(m);
  if(prices.some(p=>p>0))return 'paid';
  if(prices.length && prices.every(p=>p===0))return 'free';
  return 'unknown';
}

export function normalizeModel(m) {
  const id = str(m.id || m.model || m.name);
  const caps = getCapabilities(m);
  const community = id.startsWith('community/') || m.source === 'community' || m.community === true;
  return {
    id, name: str(m.name || id.split('/').at(-1) || id),
    description: str(m.description || m.summary || ''),
    source: community ? 'community' : 'official',
    category: getCategory(m),
    publisher: str(m.publisher || m.provider || m.brand || (community ? id.split('/')[1] : '')),
    freeStatus: getFreeStatus(m),
    isFree: getFreeStatus(m)==='free',
    capabilities: caps,
    rpm: number(m.per_user_rpm ?? m.rpm ?? nested(m,'rate_limits','rpm') ?? nested(m,'limits','rpm')),
    contextWindow: number(m.context_window ?? m.context_length ?? m.context_size ?? m.max_context_tokens),
    maxOutputTokens: number(m.max_output_tokens ?? m.max_tokens),
    health: m.health ?? null,
    status: str(nested(m,'health','status') || m.status || 'unknown').toLowerCase(),
    pricing: m.pricing ?? m.price ?? null,
    aliases: m.aliases ?? [],
    supportedEndpoints: m.supported_endpoints ?? [],
    inputModalities: m.input_modalities ?? nested(m,'modalities','input') ?? [],
    outputModalities: m.output_modalities ?? nested(m,'modalities','output') ?? [],
    raw: m
  };
}

async function fetchCatalog(force=false) {
  if(!force && cache.models && Date.now()-cache.at<CACHE_MS) return {models:cache.models,cached:true};
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),12000);
  try {
    const url = new URL(UPSTREAM);
    url.searchParams.set('reliability','all');
    const response = await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Upstream HTTP ${response.status}`);
    const json=await response.json();
    const models=Array.isArray(json)?json:Array.isArray(json.models)?json.models:Array.isArray(json.data)?json.data:null;
    if(!models)throw new Error('Unexpected upstream catalog format');
    cache={at:Date.now(),models};
    return {models,cached:false};
  } catch(e) {
    if(cache.models)return {models:cache.models,cached:true,stale:true,upstreamError:e.message};
    throw e;
  } finally {clearTimeout(timeout);}
}

export function filterModels(models, params) {
  const q=str(params.get('q') || params.get('search')).toLowerCase();
  const category=str(params.get('category')||'all').toLowerCase().replace(/\s*&\s*/g,'-').replaceAll(' ','-');
  const capability=str(params.get('capability')||params.get('capabilities')).toLowerCase().replaceAll('_','-');
  const source=str(params.get('source')||'community').toLowerCase();
  const status=str(params.get('status')||'all').toLowerCase();
  const freeOnly=bool(params.get('freeOnly')??params.get('free'),true);
  const sort=str(params.get('sort')||'name').toLowerCase();
  const aliases={ 'text-&-reasoning':'text','text-reasoning':'text','reasoning':'text','image-generation':'image','audio-generation':'audio','video-generation':'video','embedding':'embeddings','all':'all'};
  const resolvedCategory=aliases[category]||category;
  let result=models.map(normalizeModel).filter(m=>{
    if(source!=='all' && m.source!==source)return false;
    if(freeOnly && m.freeStatus==='paid')return false; // Community model with unreported price remains discoverable, but is marked 'unknown'.
    if(resolvedCategory!=='all'&&m.category!==resolvedCategory)return false;
    if(capability && capability!=='all' && !m.capabilities.some(c=>c===capability||c.includes(capability)))return false;
    if(status!=='all' && m.status!==status)return false;
    if(q&&!([m.id,m.name,m.description,m.publisher,m.category,...m.capabilities,...(Array.isArray(m.aliases)?m.aliases:[])].join(' ').toLowerCase().includes(q)))return false;
    return true;
  });
  if(sort==='rpm') result.sort((a,b)=>(b.rpm??-1)-(a.rpm??-1));
  else if(sort==='health')result.sort((a,b)=>(b.health?.success_rate??-1)-(a.health?.success_rate??-1));
  else if(sort==='category')result.sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
  else result.sort((a,b)=>a.name.localeCompare(b.name));
  return result;
}

export async function modelsHandler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=15, stale-while-revalidate=10');
  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.setHeader('Allow','GET, HEAD, OPTIONS');res.end(JSON.stringify({error:'Method not allowed. GET only.'}));return;}
  try {
    const params=new URL(req.url || '/api/models','http://localhost').searchParams;
    const allowed=['all','community','official'];
    const source=str(params.get('source')||'community').toLowerCase();
    if(!allowed.includes(source)){res.statusCode=400;res.end(JSON.stringify({error:'source must be all, community, or official'}));return;}
    const limit=Math.max(1,Math.min(MAX_LIMIT,Number.parseInt(params.get('limit')||'1000',10)||1000));
    const offset=Math.max(0,Number.parseInt(params.get('offset')||'0',10)||0);
    const {models,cached,stale,upstreamError}=await fetchCatalog(bool(params.get('refresh'),false));
    const filtered=filterModels(models,params);
    const summary={total:filtered.length,categories:{},free:{free:0,paid:0,unknown:0},statuses:{}};
    filtered.forEach(m=>{summary.categories[m.category]=(summary.categories[m.category]||0)+1;summary.free[m.freeStatus]++;summary.statuses[m.status]=(summary.statuses[m.status]||0)+1;});
    const includeRaw=bool(params.get('includeRaw'),true);
    const items=filtered.slice(offset,offset+limit).map(m=>includeRaw?m:(({raw,...rest})=>rest)(m));
    const data={object:'list',source,filters:{q:params.get('q')||params.get('search')||'',category:params.get('category')||'all',capability:params.get('capability')||'all',freeOnly:bool(params.get('freeOnly')??params.get('free'),true),status:params.get('status')||'all'},total:filtered.length,count:items.length,limit,offset,hasMore:offset+limit<filtered.length,updatedAt:new Date(cache.at).toISOString(),cached,stale:!!stale,warning:upstreamError||undefined,summary,data:items};
    if(req.method==='HEAD'){res.statusCode=200;res.end();return;}
    res.statusCode=200;res.end(JSON.stringify(data));
  }catch(error){res.statusCode=502;res.end(JSON.stringify({error:'Could not retrieve the upstream model catalog',details:error.message,data:[]}));}
}
export default modelsHandler;
