async function sha(value){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
async function requireAdmin(request,env){const m=(request.headers.get("Cookie")||"").match(/(?:^|;\s*)minios_tv_session=([^;]+)/);if(!m)return null;let token;try{token=decodeURIComponent(m[1]);}catch{return null;}if(token.length!==64)return null;const now=Math.floor(Date.now()/1000);const row=await env.DB.prepare("SELECT u.id,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active' LIMIT 1").bind(await sha(token),now).first();return row&&row.role==="admin"?row:null;}
function validOrigin(request){try{return request.url.startsWith("https://")&&request.headers.get("Origin")===new URL(request.url).origin;}catch{return false;}}
const CATEGORIES=["general","sports","news","music","kids","movies","series","documentary","entertainment","education","culture","lifestyle","religion"];
const COUNTRIES=["AR","BR","CL","UY","PY","BO","PE","EC","CO","VE","MX","CR","CU","DO","SV","GT","HN","NI","PA","PR"];
function isVideoSource(value){try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password)return false;return /\.(?:m3u8|mpd|mp4|m4v|webm|ogv|ogg)$/i.test(u.pathname);}catch{return false;}}
function normalizeChannelName(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function publicHttpsUrl(value){try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||(u.port&&u.port!=="443"))return null;let host=u.hostname.toLowerCase().replace(/^\[|\]$/g,"");if(!host||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".test"))return null;const ip=host.split(".");if(ip.length===4&&ip.every(x=>/^\d{1,3}$/.test(x)&&Number(x)<=255)){const a=Number(ip[0]),b=Number(ip[1]);if(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127))return null;}if(host.includes(":")&&(host==="::"||host==="::1"||host.startsWith("fc")||host.startsWith("fd")||/^fe[89ab]/i.test(host)||host.startsWith("ff")))return null;return u;}catch{return null;}}
const DIRECT_VIDEO_EXTENSIONS=["m3u8","mpd","mp4","m4v","webm","ogv","ogg"];
function directVideoExtension(url){const match=url.pathname.match(/\.([a-z0-9]+)$/i);return match?match[1].toLowerCase():"";}
async function probeVideoSource(value,timeoutMs=2800){
 const safe=publicHttpsUrl(String(value||""));
 if(!safe)return {ok:false,code:"invalid_url",message:"URL HTTPS no válida."};
 const extension=directVideoExtension(safe);
 if(!DIRECT_VIDEO_EXTENSIONS.includes(extension))return {ok:false,code:"unsupported_format",message:"Formato no admitido para reproducción directa."};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(700,Math.min(3500,timeoutMs)));
 let response,reader,prefix="";
 try{
  response=await fetch(safe.href,{method:"GET",redirect:"manual",signal:controller.signal,headers:{"Accept":"application/vnd.apple.mpegurl,application/x-mpegURL,application/dash+xml,video/*,application/octet-stream;q=0.9,*/*;q=0.5","Range":"bytes=0-4095","User-Agent":"Lumina-TV/1.3 stream-compatibility-check"}});
  if(response.status>=300&&response.status<400)return {ok:false,code:"redirect",message:"La señal redirige a otra URL; se requiere revisar la dirección final.",httpStatus:response.status};
  if(!response.ok)return {ok:false,code:"http_error",message:"El servidor respondió HTTP "+response.status+".",httpStatus:response.status};
  const contentType=String(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
  reader=response.body?.getReader();
  if(reader){
   const decoder=new TextDecoder();let received=0;
   while(received<4096){
    const part=await reader.read();if(part.done)break;
    const chunk=part.value.subarray(0,4096-received);
    prefix+=decoder.decode(chunk,{stream:true});received+=chunk.byteLength;
    if((extension==="m3u8"&&/#EXTM3U/i.test(prefix))||(extension==="mpd"&&/<MPD(?:\\s|>)/i.test(prefix)))break;
   }
   await reader.cancel().catch(()=>{});
  }
  const isHls=extension==="m3u8"||contentType.includes("mpegurl");
  const isDash=extension==="mpd"||contentType.includes("dash+xml");
  if(isHls&&!/^\uFEFF?\s*#EXTM3U/im.test(prefix))return {ok:false,code:"invalid_hls",message:"La URL no devolvió una lista HLS válida (#EXTM3U).",httpStatus:response.status,contentType};
  if(isDash&&!/<MPD(?:\s|>)/i.test(prefix))return {ok:false,code:"invalid_dash",message:"La URL no devolvió un manifiesto MPEG-DASH válido.",httpStatus:response.status,contentType};
  if(!isHls&&!isDash){
   const validType=contentType.startsWith("video/")||contentType==="application/octet-stream"||contentType==="application/ogg"||contentType==="audio/ogg";
   if(!validType)return {ok:false,code:"invalid_content_type",message:"El servidor no entregó un tipo de contenido de vídeo reconocido.",httpStatus:response.status,contentType};
  }
  const kind=isHls?"HLS":isDash?"MPEG-DASH":extension.toUpperCase();
  return {ok:true,code:"verified",kind,contentType,httpStatus:response.status,checkedAt:Math.floor(Date.now()/1000),message:"El enlace respondió y su contenido coincide con el formato "+kind+"."};
 }catch(error){
  const timeout=error?.name==="AbortError";
  return {ok:false,code:timeout?"timeout":"network_error",message:timeout?"La señal tardó demasiado en responder.":"No se pudo conectar con la señal."};
 }finally{clearTimeout(timer);if(reader)try{await reader.cancel();}catch{}}
}
const COUNTRY_ALIASES={AR:"AR",ARG:"AR",ARGENTINA:"AR",BR:"BR",BRA:"BR",BRASIL:"BR",BRAZIL:"BR",CL:"CL",CHILE:"CL",UY:"UY",URUGUAY:"UY",PY:"PY",PARAGUAY:"PY",BO:"BO",BOLIVIA:"BO",PE:"PE",PERU:"PE",EC:"EC",ECUADOR:"EC",CO:"CO",COLOMBIA:"CO",VE:"VE",VENEZUELA:"VE",MX:"MX",MEXICO:"MX",CR:"CR",COSTARICA:"CR",CU:"CU",CUBA:"CU",DO:"DO",DOMINICANREPUBLIC:"DO",SV:"SV",ELSALVADOR:"SV",GT:"GT",GUATEMALA:"GT",HN:"HN",HONDURAS:"HN",NI:"NI",NICARAGUA:"NI",PA:"PA",PANAMA:"PA",PR:"PR",PUERTORICO:"PR"};
function countryCode(value,fallback=""){const key=String(value||"").split(/[;,|]/)[0].trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[\s_-]+/g,"");return COUNTRY_ALIASES[key]||fallback;}
function categoryFromGroup(value){const s=String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();if(/sport|deport|futbol|football|basket|tenis/.test(s))return "sports";if(/news|notic|inform|24.?h|actualidad/.test(s))return "news";if(/music|musica|radio|videoclip/.test(s))return "music";if(/kid|child|infant|nino|juvenil|cartoon|animacion/.test(s))return "kids";if(/movie|pelicul|cine|film/.test(s))return "movies";if(/series|serie|episodio|drama|comedia/.test(s))return "series";if(/document|documental|naturaleza|science/.test(s))return "documentary";if(/educ|school|univers/.test(s))return "education";if(/culture|cultur|arte|historia/.test(s))return "culture";if(/lifestyle|estilo|cocina|viaje|hogar/.test(s))return "lifestyle";if(/relig|faith/.test(s))return "religion";if(/entertain|entreten|show|variedad/.test(s))return "entertainment";return "general";}
function parseM3UEntries(text,defaultCountry,feedUrl,evidence){const lines=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/),entries=[];let meta=null,skipped=0;for(const raw of lines){const line=raw.trim();if(!line)continue;if(line.startsWith("#EXTINF:")){const comma=line.indexOf(","),attrsText=line.slice(8,comma<0?undefined:comma),attrs={};for(const m of attrsText.matchAll(/([\w-]+)=["']([^"']*)["']/g))attrs[m[1].toLowerCase()]=m[2];const name=comma<0?"":line.slice(comma+1).trim();meta={name:name||attrs["tvg-name"]||attrs["tvg-id"]||"",logo:attrs["tvg-logo"]||"",group:attrs["group-title"]||"",country:attrs["tvg-country"]||"",language:attrs["tvg-language"]||""};continue;}if(line.startsWith("#")||!meta)continue;let u;try{u=new URL(line);}catch{skipped++;meta=null;continue;}if(!isVideoSource(u.href)||!publicHttpsUrl(u.href)){skipped++;meta=null;continue;}const country=countryCode(meta.country,defaultCountry);if(!country||!COUNTRIES.includes(country)||!meta.name){skipped++;meta=null;continue;}const logo=publicHttpsUrl(meta.logo);entries.push({name:meta.name.slice(0,100),country,category:categoryFromGroup(meta.group),language:meta.language.slice(0,40),logo:logo?logo.href:"",url:u.href,group:meta.group.slice(0,80),feedUrl:feedUrl||"",evidence});meta=null;if(entries.length>=500)break;}return {entries,skipped};}
export async function onRequest(context){const {request,env}=context;if(!env.DB)return json({error:"service_unavailable"},503);const actor=await requireAdmin(request,env);if(!actor)return json({error:"forbidden"},403);const url=new URL(request.url),parts=url.pathname.split("/").filter(Boolean),resource=parts[2],id=parts[3];const now=Math.floor(Date.now()/1000);
if(request.method==="GET"&&resource==="users"){const r=await env.DB.prepare("SELECT id,email,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 500").all();const rows=r.results||[];const permissions=await env.DB.prepare("SELECT user_id,category FROM user_category_permissions").all();const channelPermissions=await env.DB.prepare("SELECT user_id,channel_id FROM user_channel_permissions").all();const channelConfigured=await env.DB.prepare("SELECT user_id FROM user_channel_settings").all();const configured=await env.DB.prepare("SELECT user_id FROM user_category_settings").all();const byUser={};for(const p of permissions.results||[])(byUser[p.user_id]??=[]).push(p.category);const configuredIds=new Set((configured.results||[]).map(x=>x.user_id));const byChannel={};for(const p of channelPermissions.results||[])(byChannel[p.user_id]??=[]).push(p.channel_id);const channelConfiguredIds=new Set((channelConfigured.results||[]).map(x=>x.user_id));return json({users:rows.map(u=>({...u,categories:configuredIds.has(u.id)?(byUser[u.id]||[]):CATEGORIES,channelIds:channelConfiguredIds.has(u.id)?(byChannel[u.id]||[]):null}))});}
if(request.method==="GET"&&resource==="channels"){const r=await env.DB.prepare("SELECT id,name,country,category,enabled,created_at,sources_json FROM channels ORDER BY name LIMIT 500").all();return json({channels:(r.results||[]).map(row=>{let meta={};try{meta=JSON.parse(row.sources_json||"[]")[0]||{};}catch{}return {id:row.id,name:row.name,country:row.country,category:row.category,enabled:!!row.enabled,created_at:row.created_at,source:typeof meta.url==="string"?meta.url:"",sources:(()=>{try{return JSON.parse(row.sources_json||"[]").map(x=>x.url).filter(Boolean)}catch{return []}})(),evidence:typeof meta.evidence==="string"?meta.evidence:"",website:typeof meta.website==="string"?meta.website:"",logo:typeof meta.logo==="string"?meta.logo:"",language:typeof meta.language==="string"?meta.language:"",description:typeof meta.description==="string"?meta.description:"",directory:meta.directory||"",verification:meta.verification&&typeof meta.verification==="object"?meta.verification:null};})});}
if(request.method==="GET"&&resource==="discover"){
 const q=(url.searchParams.get("q")||"").trim().slice(0,80);
 if(q.length<2)return json({results:[]});
 try{
  const headers={"Accept":"application/json","User-Agent":"Lumina-TV/1.2 (public channel metadata discovery)"};
  const endpoint=new URL("https://www.wikidata.org/w/api.php");
  endpoint.search=new URLSearchParams({action:"wbsearchentities",search:q,language:"es",uselang:"es",type:"item",limit:"35",format:"json"}).toString();
  const response=await fetch(endpoint,{headers});
  if(!response.ok)return json({error:"discovery_unavailable"},502);
  const data=await response.json();
  const matches=(data.search||[]).filter(x=>/canal de televisión|cadena de televisión|emisora de televisión|television channel|broadcaster|television station/i.test((x.description||"")+" "+(x.label||""))).slice(0,30);
  if(!matches.length)return json({results:[],source:"Wikidata",notice:"No se encontraron coincidencias de canales."});
  const ids=matches.map(x=>x.id).join("|");
  const detailUrl=new URL("https://www.wikidata.org/w/api.php");
  detailUrl.search=new URLSearchParams({action:"wbgetentities",ids,props:"claims",languages:"es",format:"json"}).toString();
  const detailResponse=await fetch(detailUrl,{headers});
  if(!detailResponse.ok)return json({error:"discovery_unavailable"},502);
  const details=await detailResponse.json();
  const countries={
   "Q414":"AR","Q155":"BR","Q298":"CL","Q77":"UY","Q733":"PY","Q750":"BO","Q419":"PE","Q736":"EC","Q739":"CO","Q717":"VE",
   "Q96":"MX","Q800":"CR","Q241":"CU","Q786":"DO","Q792":"SV","Q774":"GT","Q783":"HN","Q811":"NI","Q804":"PA","Q1183":"PR"
  };
  const labels={
   AR:"Argentina",BR:"Brasil",CL:"Chile",UY:"Uruguay",PY:"Paraguay",BO:"Bolivia",PE:"Perú",EC:"Ecuador",CO:"Colombia",VE:"Venezuela",
   MX:"México",CR:"Costa Rica",CU:"Cuba",DO:"República Dominicana",SV:"El Salvador",GT:"Guatemala",HN:"Honduras",NI:"Nicaragua",PA:"Panamá",PR:"Puerto Rico"
  };
  const claimIds=(claims,property)=>(claims[property]||[]).map(item=>item?.mainsnak?.datavalue?.value?.id).filter(Boolean);
  const results=matches.map(x=>{
   const claims=details.entities?.[x.id]?.claims||{};
   const countryCandidates=[...claimIds(claims,"P17"),...claimIds(claims,"P495"),...claimIds(claims,"P131")];
   const country=countryCandidates.map(qid=>countries[qid]).find(Boolean)||"";
   const languageIds=claimIds(claims,"P407");
   const language=languageIds.includes("Q1321")?"Español":languageIds.includes("Q5146")?"Portugués":languageIds.includes("Q1860")?"Inglés":languageIds.includes("Q150")?"Francés":"";
   const websiteValues=(claims.P856||[]).map(item=>item?.mainsnak?.datavalue?.value).filter(value=>typeof value==="string");
   const website=websiteValues.find(value=>/^https:\/\//i.test(value)&&!/^https:\/\/(?:www\.)?wikidata\.org\//i.test(value))||"";
   const file=claims.P154?.[0]?.mainsnak?.datavalue?.value?.id||claims.P18?.[0]?.mainsnak?.datavalue?.value?.id||"";
   return {id:x.id,label:x.label,description:x.description||"",url:"https://www.wikidata.org/wiki/"+x.id,country,countryName:labels[country]||"",language,website,logo:file?"https://commons.wikimedia.org/wiki/Special:FilePath/"+encodeURIComponent(file):""};
  }).filter(item=>COUNTRIES.includes(item.country));
  return json({results,source:"Wikidata",notice:"Solo se muestran candidatos con país latinoamericano identificado. Son referencias de metadatos; no verifican derechos ni transmisiones.",excluded:matches.length-results.length});
 }catch{return json({error:"discovery_unavailable"},502);}
}
if(!validOrigin(request))return json({error:"invalid_origin"},403);
let body={};if(request.method!=="DELETE"){try{const raw=await request.text();const maxBytes=resource==="import-m3u"?1200000:32768;if(new TextEncoder().encode(raw).length>maxBytes)return json({error:"payload_too_large"},413);body=JSON.parse(raw);if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_request"},400);}catch{return json({error:"invalid_request"},400);}}
if(resource==="discover"&&request.method==="POST"){
 const items=Array.isArray(body.items)?body.items:[];
 if(!items.length||items.length>40)return json({error:"invalid_discovery_batch"},400);
 const existingResult=await env.DB.prepare("SELECT id,name,country FROM channels LIMIT 1000").all();
 const existing=new Set((existingResult.results||[]).map(x=>String(x.country||"")+"|"+normalizeChannelName(x.name)));
 const incoming=new Set(),stmts=[];let added=0,duplicates=0,invalid=0;
 for(const item of items){
  const id=String(item?.id||""),name=String(item?.label||"").trim().slice(0,100),country=String(item?.country||"").toUpperCase();
  if(!/^Q\d{1,12}$/.test(id)||!name||!COUNTRIES.includes(country)){invalid++;continue;}
  const key=country+"|"+normalizeChannelName(name);if(existing.has(key)||incoming.has(key)){duplicates++;continue;}
  incoming.add(key);
  let logo="";const logoUrl=publicHttpsUrl(String(item.logo||""));if(logoUrl)logo=logoUrl.href;
  const evidence="https://www.wikidata.org/wiki/"+id;
  const metadata={url:"",language:String(item.language||"").slice(0,40),logo,description:String(item.description||"").slice(0,500),evidence,discoveryId:id};
  const channelId=crypto.randomUUID();
  stmts.push(env.DB.prepare("INSERT INTO channels(id,name,country,category,sources_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(channelId,name,country,"general",JSON.stringify([metadata]),0,now,now));
  stmts.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_discovered_pending","channel",channelId,now));
  existing.add(key);added++;
 }
 for(let i=0;i<stmts.length;i+=100)await env.DB.batch(stmts.slice(i,i+100));
 return json({ok:true,added,duplicates,invalid});
}
if(resource==="discover-playlists"&&request.method==="POST"){
 const selectedCountry=String(body.country||"ALL").toUpperCase();
 const rawCategory=String(body.category??"ALL").trim();
 const selectedCategory=!rawCategory||rawCategory.toLowerCase()==="all"?"ALL":rawCategory.toLowerCase();
 if(selectedCountry!=="ALL"&&!COUNTRIES.includes(selectedCountry))return json({error:"invalid_country"},400);
 if(selectedCategory!=="ALL"&&!CATEGORIES.includes(selectedCategory))return json({error:"invalid_category"},400);
 const requestedLimit=Number(body.limit??20);
 const limit=Math.max(1,Math.min(60,Number.isFinite(requestedLimit)?Math.floor(requestedLimit):20));
 const requestedBudget=Number(body.timeBudgetSeconds??12);
 const timeBudgetSeconds=Math.max(5,Math.min(25,Number.isFinite(requestedBudget)?Math.floor(requestedBudget):12));
 const startedAt=Date.now(),deadline=startedAt+timeBudgetSeconds*1000;
 const directoryUrl="https://raw.githubusercontent.com/teleonline/listas/main/tv.json";
 const directoryPage="https://github.com/teleonline/listas";
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(8000,Math.max(2500,Math.floor(timeBudgetSeconds*450))));
 let raw="";
 try{
  const response=await fetch(directoryUrl,{method:"GET",redirect:"manual",signal:controller.signal,headers:{"Accept":"application/json","User-Agent":"Lumina-TV/1.3 authorized-source-catalog-discovery"}});
  if(response.status>=300&&response.status<400)return json({error:"directory_redirect_blocked"},502);
  if(!response.ok)return json({error:"directory_fetch_failed",status:response.status},502);
  const length=Number(response.headers.get("content-length")||0);
  if(length>5242880)return json({error:"directory_too_large"},413);
  const reader=response.body?.getReader();if(!reader)return json({error:"directory_empty"},502);
  const decoder=new TextDecoder();let bytes=0;
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>5242880){await reader.cancel();return json({error:"directory_too_large"},413);}raw+=decoder.decode(part.value,{stream:true});}
  raw+=decoder.decode();
 }catch{return json({error:"directory_fetch_failed"},502);}finally{clearTimeout(timer);}
 let directory;try{directory=JSON.parse(raw);}catch{return json({error:"directory_invalid"},502);}
 const cleanCountry=value=>countryCode(String(value||"").replace(/^[^\p{L}]*/u,"").trim());
 const candidates=[],seen=new Set();let skipped=0,withoutStream=0;
 for(const countryRecord of directory.countries||[]){
  const country=cleanCountry(countryRecord.name);
  if(!COUNTRIES.includes(country)||(selectedCountry!=="ALL"&&country!==selectedCountry))continue;
  for(const ambit of countryRecord.ambits||[]){
   if(selectedCategory!=="ALL"&&categoryFromGroup(ambit.name||"")!==selectedCategory)continue;
   for(const item of ambit.channels||[]){
    const name=String(item?.name||"").trim().slice(0,100);
    if(!name){skipped++;continue;}
    const options=Array.isArray(item.options)?item.options:[];
    const priority={m3u8:0,mpd:1,mp4:2,m4v:3,webm:4,ogv:5,ogg:6};
    const streams=[...new Set(options.map(option=>publicHttpsUrl(String(option?.url||""))).filter(candidate=>candidate&&DIRECT_VIDEO_EXTENSIONS.includes(directVideoExtension(candidate))).map(candidate=>candidate.href))].sort((a,b)=>priority[directVideoExtension(new URL(a))]-priority[directVideoExtension(new URL(b))]).slice(0,5);
    if(!streams.length){withoutStream++;continue;}
    const key=country+"|"+normalizeChannelName(name);
    if(seen.has(key)){skipped++;continue;}
    seen.add(key);
    const website=publicHttpsUrl(String(item.web||""));
    const logoUrl=publicHttpsUrl(String(item.logo||""));
    candidates.push({name,country,category:categoryFromGroup(ambit.name||""),urls:streams,logo:logoUrl?logoUrl.href:"",website:website?website.href:"",evidence:website?website.href:directoryPage});
   }
  }
 }
 const checked=[];
 let cursor=0;
 while(cursor<candidates.length&&checked.length<limit&&Date.now()<deadline-1000){
  const batchSize=Math.min(3,limit-checked.length,candidates.length-cursor);
  if(batchSize<1)break;
  const batch=candidates.slice(cursor,cursor+batchSize);
  const results=await Promise.all(batch.map(async item=>{
   const remaining=deadline-Date.now()-150;
   if(remaining<700)return {...item,url:item.urls[0],probe:{ok:false,code:"time_budget",message:"Se alcanzó el tiempo máximo de esta búsqueda."}};
   const probes=await Promise.all(item.urls.map(url=>probeVideoSource(url,Math.min(2600,remaining))));
   const successful=probes.findIndex(probe=>probe.ok),chosen=successful>=0?successful:0;
   return {...item,url:item.urls[chosen],probe:probes[chosen],verifiedSources:item.urls.map((url,index)=>({url,probe:probes[index]})).filter(x=>x.probe.ok),alternativesChecked:probes.length};
  }));
  checked.push(...results);cursor+=batch.length;
 }
 const existingResult=await env.DB.prepare("SELECT id,name,country,sources_json,enabled FROM channels LIMIT 2000").all();
 const existing=new Map();
 for(const row of existingResult.results||[]){
  const key=String(row.country||"")+"|"+normalizeChannelName(row.name);
  let meta={};try{meta=JSON.parse(row.sources_json||"[]")[0]||{};}catch{}
  existing.set(key,{...row,meta});
 }
 const statements=[];let added=0,enriched=0,alreadyConfigured=0,failed=0;
 for(const item of checked){
  if(!item.probe.ok){failed++;continue;}
  const key=item.country+"|"+normalizeChannelName(item.name),previous=existing.get(key);
  const verification={status:"verified",kind:item.probe.kind,contentType:item.probe.contentType||"",httpStatus:item.probe.httpStatus,checkedAt:item.probe.checkedAt,note:"La respuesta HTTP y el formato fueron comprobados desde el servidor. La reproducción final también depende de CORS, región, códecs y disponibilidad en el dispositivo."};
  const oldSources=previous?(()=>{try{return JSON.parse(previous.sources_json||"[]").filter(x=>x&&typeof x.url==="string")}catch{return []}})():[];
  const additions=(item.verifiedSources||[]).map((entry,index)=>({url:entry.url,logo:item.logo||"",description:"OP "+(index+1)+" · señal detectada y comprobada; pendiente de revisión de autorización.",evidence:item.evidence,website:item.website,directory:"teleonline",directoryUrl:directoryPage,directoryCheckedAt:now,verification:{status:"verified",kind:entry.probe.kind,contentType:entry.probe.contentType||"",httpStatus:entry.probe.httpStatus,checkedAt:entry.probe.checkedAt}}));
  const mergedSources=[...oldSources,...additions.filter(x=>!oldSources.some(y=>y.url===x.url))].slice(0,5);
  const metadata={...(previous?.meta||{}),...(mergedSources[0]||{}),url:mergedSources[0]?.url||item.url,logo:item.logo||previous?.meta?.logo||"",description:"Señales detectadas automáticamente. Pendientes de revisión de autorización y reproducción en el dispositivo.",evidence:item.evidence,website:item.website,directory:"teleonline",directoryUrl:directoryPage,directoryCheckedAt:now,verification};
  if(previous){
   if(previous.meta?.url&&previous.meta.url!==item.url){alreadyConfigured++;continue;}
   statements.push(env.DB.prepare("UPDATE channels SET sources_json=?,enabled=?,updated_at=? WHERE id=?").bind(JSON.stringify(mergedSources.length?mergedSources:[metadata]),previous.enabled?1:0,now,previous.id));
   statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_stream_verified","channel",previous.id,now));
   if(previous.meta?.url)alreadyConfigured++;else enriched++;
   previous.meta=metadata;
  }else{
   const channelId=crypto.randomUUID();
   statements.push(env.DB.prepare("INSERT INTO channels(id,name,country,category,sources_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(channelId,item.name,item.country,item.category,JSON.stringify([metadata]),0,now,now));
   statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_stream_discovered_verified_pending","channel",channelId,now));
   existing.set(key,{id:channelId,name:item.name,country:item.country,meta:metadata,enabled:0});added++;
  }
 }
 for(let i=0;i<statements.length;i+=100)await env.DB.batch(statements.slice(i,i+100));
 const elapsedMs=Date.now()-startedAt,notChecked=Math.max(0,candidates.length-checked.length);
 return json({ok:true,source:"Teleonline",country:selectedCountry,category:selectedCategory,requestedLimit:limit,timeBudgetSeconds,elapsedMs,candidatesFound:candidates.length,checked:checked.length,verified:checked.filter(x=>x.probe.ok).length,verifiedOptions:checked.reduce((n,x)=>n+(x.verifiedSources?.length||0),0),failed,added,enriched,alreadyConfigured,withoutStream,skipped,notChecked,results:checked.map(x=>({name:x.name,country:x.country,category:x.category,ok:x.probe.ok,options:x.verifiedSources?.length||0,code:x.probe.code,kind:x.probe.kind||"",message:x.probe.message,added:!!x.probe.ok})),directoryUrl});
}
if(resource==="import-m3u"&&request.method==="POST"){
 if(body.rightsConfirmed!==true)return json({error:"rights_confirmation_required"},400);
 const evidenceUrl=publicHttpsUrl(String(body.evidence||""));if(!evidenceUrl)return json({error:"invalid_evidence"},400);
 const defaultCountry=countryCode(body.defaultCountry||"");if(body.defaultCountry&&!COUNTRIES.includes(defaultCountry))return json({error:"invalid_country"},400);
 let playlistText="",feedUrl="";
 if(typeof body.sourceUrl==="string"&&body.sourceUrl.trim()){
  const feed=publicHttpsUrl(body.sourceUrl.trim());if(!feed)return json({error:"invalid_feed_url"},400);feedUrl=feed.href;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch(feed.href,{method:"GET",redirect:"manual",signal:controller.signal,headers:{"Accept":"application/x-mpegURL,application/vnd.apple.mpegurl,audio/x-mpegurl,text/plain,*/*","User-Agent":"Lumina-TV/1.0 playlist importer"}});
   if(response.status>=300&&response.status<400)return json({error:"feed_redirect_blocked"},400);
   if(!response.ok)return json({error:"feed_fetch_failed",status:response.status},502);
   const reader=response.body?.getReader();if(!reader)return json({error:"feed_empty"},502);
   const decoder=new TextDecoder();let bytes=0;
   while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1048576){await reader.cancel();return json({error:"feed_too_large"},413);}playlistText+=decoder.decode(part.value,{stream:true});}
   playlistText+=decoder.decode();
  }catch{return json({error:"feed_fetch_failed"},502);}finally{clearTimeout(timer);}
 }else if(typeof body.playlistText==="string"){playlistText=body.playlistText;const size=new TextEncoder().encode(playlistText).length;if(size>1048576)return json({error:"feed_too_large"},413);}
 else return json({error:"feed_required"},400);
 if(!playlistText.trim())return json({error:"feed_empty"},400);
 const parsed=parseM3UEntries(playlistText,defaultCountry,feedUrl,evidenceUrl.href);if(!parsed.entries.length)return json({error:"no_supported_entries",skipped:parsed.skipped},400);
 const existingResult=await env.DB.prepare("SELECT id,name,country,sources_json FROM channels LIMIT 1000").all();
 const existing=new Map();for(const row of existingResult.results||[]){const key=String(row.country||"")+"|"+normalizeChannelName(row.name);let meta={};try{meta=JSON.parse(row.sources_json)[0]||{};}catch{}existing.set(key,{...row,meta});}
 const statements=[],seen=new Set();let added=0,updated=0,duplicates=0,disabled=0;
 for(const entry of parsed.entries){
  const key=entry.country+"|"+normalizeChannelName(entry.name);if(seen.has(key)){duplicates++;continue;}seen.add(key);
  const previous=existing.get(key);
  const metadata={url:entry.url,language:entry.language,logo:entry.logo,description:entry.group?"Grupo: "+entry.group:"Importado desde lista M3U autorizada",evidence:evidenceUrl.href,feedUrl:entry.feedUrl};
  if(previous){
   if(!feedUrl||previous.meta.feedUrl!==feedUrl){duplicates++;continue;}
   statements.push(env.DB.prepare("UPDATE channels SET name=?,country=?,category=?,sources_json=?,enabled=1,updated_at=? WHERE id=?").bind(entry.name,entry.country,entry.category,JSON.stringify([metadata]),now,previous.id));
   statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_feed_refresh","channel",previous.id,now));updated++;
  }else{
   const channelId=crypto.randomUUID();
   statements.push(env.DB.prepare("INSERT INTO channels(id,name,country,category,sources_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(channelId,entry.name,entry.country,entry.category,JSON.stringify([metadata]),1,now,now));
   statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_feed_import","channel",channelId,now));
   existing.set(key,{id:channelId,name:entry.name,country:entry.country,meta:{feedUrl}});added++;
  }
 }
 if(feedUrl){for(const [key,row] of existing){if(row.meta.feedUrl===feedUrl&&!seen.has(key)){statements.push(env.DB.prepare("UPDATE channels SET enabled=0,updated_at=? WHERE id=?").bind(now,row.id));statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_feed_removed","channel",row.id,now));disabled++;}}}
 for(let i=0;i<statements.length;i+=100)await env.DB.batch(statements.slice(i,i+100));
 return json({ok:true,added,updated,duplicates,disabled,skipped:parsed.skipped,feedUrl});
}
if(resource==="users"&&id&&parts[4]==="channels"&&request.method==="PATCH"){
 const target=await env.DB.prepare("SELECT role FROM users WHERE id=?").bind(id).first();
 if(!target||target.role==="admin")return json({error:"not_found"},404);

 if(!Object.prototype.hasOwnProperty.call(body,"channelIds"))return json({error:"invalid_channels"},400);
 const allChannels=body.channelIds===null;
 const channelIds=allChannels?[]:body.channelIds;
 if(!Array.isArray(channelIds)||channelIds.length>500||channelIds.some(x=>typeof x!=="string"||x.length>80)||new Set(channelIds).size!==channelIds.length)return json({error:"invalid_channels"},400);

 const existing=channelIds.length
  ?await env.DB.prepare("SELECT id FROM channels WHERE id IN ("+channelIds.map(()=>"?").join(",")+")").bind(...channelIds).all()
  :{results:[]};
 if((existing.results||[]).length!==channelIds.length)return json({error:"invalid_channels"},400);

 const stmts=[env.DB.prepare("DELETE FROM user_channel_permissions WHERE user_id=?").bind(id)];
 if(allChannels){
  // Removing the settings row restores unrestricted access, including future channels.
  stmts.push(env.DB.prepare("DELETE FROM user_channel_settings WHERE user_id=?").bind(id));
 }else{
  // A settings row marks this as a custom allowlist; an empty list means no channels.
  for(const channelId of channelIds)stmts.push(env.DB.prepare("INSERT INTO user_channel_permissions(user_id,channel_id) VALUES(?,?)").bind(id,channelId));
  stmts.push(env.DB.prepare("INSERT INTO user_channel_settings(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING").bind(id));
 }
 stmts.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,allChannels?"user_channels_all":"user_channels_custom","user",id,now));
 await env.DB.batch(stmts);
 return json({ok:true,mode:allChannels?"all":"custom",channelIds:allChannels?null:channelIds});
}
if(resource==="users"&&id&&parts[4]==="categories"&&request.method==="PATCH"){const target=await env.DB.prepare("SELECT role FROM users WHERE id=?").bind(id).first();if(!target||target.role==="admin")return json({error:"not_found"},404);if(!Array.isArray(body.categories)||body.categories.length>CATEGORIES.length||body.categories.some(c=>!CATEGORIES.includes(c)))return json({error:"invalid_categories"},400);const stmts=[env.DB.prepare("DELETE FROM user_category_permissions WHERE user_id=?").bind(id),...body.categories.map(c=>env.DB.prepare("INSERT INTO user_category_permissions(user_id,category) VALUES(?,?)").bind(id,c)),env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"user_categories_update","user",id,now)];await env.DB.batch(stmts);return json({ok:true,categories:body.categories});}
if(resource==="users"&&id&&parts[4]==="password"&&request.method==="PATCH"){const target=await env.DB.prepare("SELECT role FROM users WHERE id=?").bind(id).first();if(!target||target.role==="admin")return json({error:"not_found"},404);const password=body.password;if(typeof password!=="string"||password.length<12||password.length>128)return json({error:"invalid_password"},400);const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,"0")).join("");const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:new TextEncoder().encode(salt),iterations:100000},key,256);const hash=Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,"0")).join("");await env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?").bind(hash,salt,now,id).run();await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"user_password_reset","user",id,now).run();return json({ok:true,sessions_revoked:true});}
if(resource==="users"&&id&&request.method==="PATCH"){if(!["active","suspended"].includes(body.status))return json({error:"invalid_status"},400);const target=await env.DB.prepare("SELECT role FROM users WHERE id=?").bind(id).first();if(!target||target.role==="admin")return json({error:"not_found"},404);await env.DB.prepare("UPDATE users SET status=?,updated_at=? WHERE id=?").bind(body.status,now,id).run();await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"user_status_"+body.status,"user",id,now).run();return json({ok:true});}
if(resource==="channels"&&id==="bulk-delete"&&request.method==="POST"){
 const all=body.all===true;
 let ids=[];
 if(all){
  if(body.confirmAll!=="BORRAR TODOS LOS CANALES")return json({error:"confirmation_required"},400);
  const result=await env.DB.prepare("SELECT id FROM channels").all();
  ids=(result.results||[]).map(row=>row.id);
 }else{
  if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>500||body.ids.some(x=>typeof x!=="string"||x.length>80))return json({error:"invalid_channel_ids"},400);
  ids=[...new Set(body.ids)];
  const existing=await env.DB.prepare("SELECT id FROM channels WHERE id IN ("+ids.map(()=>"?").join(",")+")").bind(...ids).all();
  ids=(existing.results||[]).map(row=>row.id);
 }
 if(!ids.length)return json({ok:true,deleted:0});
 const statements=[];
 for(const channelId of ids){
  statements.push(env.DB.prepare("DELETE FROM channels WHERE id=?").bind(channelId));
  statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,all?"channels_bulk_delete_all":"channel_bulk_delete","channel",channelId,now));
 }
 for(let i=0;i<statements.length;i+=100)await env.DB.batch(statements.slice(i,i+100));
 return json({ok:true,deleted:ids.length,all});
}
if(resource==="channels"&&request.method==="POST"){const name=String(body.name||"").trim(),country=String(body.country||"").trim().toUpperCase(),category=String(body.category||"general"),source=String(body.source||"").trim(),language=String(body.language||"").trim().slice(0,40),logo=String(body.logo||"").trim(),description=String(body.description||"").trim().slice(0,500),evidence=String(body.evidence||"").trim();if(!name||name.length>100||!COUNTRIES.includes(country)||!CATEGORIES.includes(category)||!evidence||evidence.length>500)return json({error:"invalid_channel"},400);let ev,lg;try{ev=new URL(evidence);if(logo)lg=new URL(logo);}catch{return json({error:"invalid_channel"},400);}if(ev.protocol!=="https:"||ev.username||ev.password||(logo&&(lg.protocol!=="https:"||lg.username||lg.password)))return json({error:"invalid_channel"},400);const pending=body.pending===true;const duplicate=await env.DB.prepare("SELECT id FROM channels WHERE country=? AND name=? COLLATE NOCASE LIMIT 1").bind(country,name).first();if(duplicate)return json({error:"channel_exists"},409);let stream="";if(!pending){let u;try{u=new URL(source);}catch{return json({error:"invalid_source"},400);}if(!isVideoSource(u.href))return json({error:"invalid_source"},400);stream=u.href;}let verification=null;if(!pending){verification=await probeVideoSource(stream);if(!verification.ok)return json({error:"source_not_verified",probe:verification},422);}const channelId=crypto.randomUUID(),metadata={url:stream,language,logo:logo||"",description,evidence:ev.href,verification};await env.DB.prepare("INSERT INTO channels(id,name,country,category,sources_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(channelId,name,country,category,JSON.stringify([metadata]),pending?0:1,now,now).run();await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,pending?"channel_pending":"channel_create","channel",channelId,now).run();return json({ok:true,id:channelId,pending},201);}
if(resource==="channels"&&id&&request.method==="PATCH"){const name=String(body.name||"").trim(),country=String(body.country||"").toUpperCase(),category=String(body.category||"general"),source=String(body.source||"").trim(),evidence=String(body.evidence||"").trim(),enabled=body.enabled===true;if(!name||name.length>100||!COUNTRIES.includes(country)||!CATEGORIES.includes(category)||!evidence)return json({error:"invalid_channel"},400);let ev;try{ev=new URL(evidence)}catch{return json({error:"invalid_channel"},400)}if(ev.protocol!=="https:"||ev.username||ev.password)return json({error:"invalid_channel"},400);const old=await env.DB.prepare("SELECT sources_json FROM channels WHERE id=?").bind(id).first();if(!old)return json({error:"not_found"},404);let oldSources=[];try{oldSources=JSON.parse(old.sources_json||"[]").filter(x=>x&&typeof x==="object")}catch{}const requested=Array.isArray(body.sources)?body.sources:[source];const urls=[...new Set(requested.map(x=>String(x||"").trim()).filter(Boolean))].slice(0,5);let nextSources=oldSources,failedSources=0;if(urls.length){const checked=[];for(const value of urls){let u;try{u=new URL(value)}catch{return json({error:"invalid_source"},400)}if(!isVideoSource(u.href))return json({error:"invalid_source"},400);const verification=enabled?await probeVideoSource(u.href):null;if(enabled&&!verification.ok){failedSources++;continue;}const previous=oldSources.find(x=>x.url===u.href)||{};checked.push({...previous,url:u.href,evidence:ev.href,verification:verification||previous.verification||null});}if(checked.length)nextSources=checked;}if(enabled&&!nextSources.some(x=>x.url))return json({error:"source_not_verified",failedSources},422);if(!nextSources.length)nextSources=[{url:"",evidence:ev.href}];const meta={...(nextSources[0]||{}),evidence:ev.href};for(const k of ["language","logo","description"])if(body[k]!==undefined)meta[k]=String(body[k]).slice(0,500);if(nextSources.length)nextSources[0]=meta;await env.DB.prepare("UPDATE channels SET name=?,country=?,category=?,sources_json=?,enabled=?,updated_at=? WHERE id=?").bind(name,country,category,JSON.stringify(nextSources),enabled?1:0,now,id).run();await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_update","channel",id,now).run();return json({ok:true,enabled,sourceCount:nextSources.filter(x=>x.url).length,failedSources});}
if(resource==="channels"&&id&&request.method==="DELETE"){await env.DB.prepare("DELETE FROM channels WHERE id=?").bind(id).run();await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_delete","channel",id,now).run();return json({ok:true});}
return json({error:"not_found"},404);}
