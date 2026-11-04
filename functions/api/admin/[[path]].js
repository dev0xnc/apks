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

function categoryFromCatalog(values){
 const text=(Array.isArray(values)?values:[values]).map(value=>String(value||"")).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
 if(/sport|deport|football|soccer/.test(text))return "sports";
 if(/news|notic|inform|current affairs/.test(text))return "news";
 if(/music|musica/.test(text))return "music";
 if(/kid|child|animation|cartoon|juvenil/.test(text))return "kids";
 if(/movie|film|cinema|pelicul/.test(text))return "movies";
 if(/series|serie|drama|comedy/.test(text))return "series";
 if(/document|science|nature|wildlife/.test(text))return "documentary";
 if(/education|educational|school|university/.test(text))return "education";
 if(/culture|arts|art|history/.test(text))return "culture";
 if(/lifestyle|travel|cooking|food|health|fashion/.test(text))return "lifestyle";
 if(/relig|faith/.test(text))return "religion";
 if(/entertain|variety|show/.test(text))return "entertainment";
 return "general";
}
function parseM3UEntries(text,defaultCountry,feedUrl,evidence){const lines=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/),entries=[];let meta=null,skipped=0;for(const raw of lines){const line=raw.trim();if(!line)continue;if(line.startsWith("#EXTINF:")){const comma=line.indexOf(","),attrsText=line.slice(8,comma<0?undefined:comma),attrs={};for(const m of attrsText.matchAll(/([\w-]+)=["']([^"']*)["']/g))attrs[m[1].toLowerCase()]=m[2];const name=comma<0?"":line.slice(comma+1).trim();meta={name:name||attrs["tvg-name"]||attrs["tvg-id"]||"",logo:attrs["tvg-logo"]||"",group:attrs["group-title"]||"",country:attrs["tvg-country"]||"",language:attrs["tvg-language"]||""};continue;}if(line.startsWith("#")||!meta)continue;let u;try{u=new URL(line);}catch{skipped++;meta=null;continue;}if(!isVideoSource(u.href)||!publicHttpsUrl(u.href)){skipped++;meta=null;continue;}const country=countryCode(meta.country,defaultCountry);if(!country||!COUNTRIES.includes(country)||!meta.name||/(adult|nsfw|porn|erotic|xxx|18\s*\+)/i.test(meta.name+" "+meta.group)){skipped++;meta=null;continue;}const logo=publicHttpsUrl(meta.logo);entries.push({name:meta.name.slice(0,100),country,category:categoryFromGroup(meta.group),language:meta.language.slice(0,40),logo:logo?logo.href:"",url:u.href,group:meta.group.slice(0,80),feedUrl:feedUrl||"",evidence});meta=null;if(entries.length>=500)break;}return {entries,skipped};}


const OFFICIAL_FREE_SOURCES=[
 {id:"tv-publica",name:"TV Pública",country:"AR",category:"general",website:"https://www.tvpublica.com.ar/vivo/",provider:"TV Pública · señal oficial",access:"Gratis · señal en vivo desde el sitio oficial",accessLevel:"free",tags:["televisión abierta","actualidad","entretenimiento"],description:"Señal pública argentina con noticias, cultura, entrevistas y programación general."},
 {id:"c5n",name:"C5N",country:"AR",category:"news",website:"https://www.c5n.com/vivo",provider:"C5N · sitio oficial",access:"Gratis · señal en vivo en la web oficial",accessLevel:"free",tags:["noticias","actualidad","argentina"],description:"Canal argentino de noticias con transmisión en vivo y programación informativa."},
 {id:"a24",name:"A24",country:"AR",category:"news",website:"https://www.a24.com/vivo",provider:"A24 · sitio oficial",access:"Gratis · señal en vivo según disponibilidad del sitio",accessLevel:"free",tags:["noticias","actualidad","argentina"],description:"Canal de noticias argentino. El sitio oficial publica su señal en vivo."},
 {id:"canal-26",name:"Canal 26",country:"AR",category:"news",website:"https://www.canal26.com/canal26-en-vivo/",provider:"Canal 26 · sitio oficial",access:"Gratis · señal en vivo en la web oficial",accessLevel:"free",tags:["noticias","internacional","actualidad"],description:"Señal informativa en vivo desde la página oficial de Canal 26."},
 {id:"tyc-sports-play",name:"TyC Sports Play",country:"AR",category:"sports",website:"https://play.tycsports.com/",provider:"TyC Sports Play · sitio oficial",access:"Gratis con registro para contenidos y eventos seleccionados; la señal lineal de 24 h requiere usuario de cableoperador.",accessLevel:"free_partial",tags:["fútbol","selección argentina","copa argentina","ascenso","básquet","vóley","tenis"],description:"Transmisiones en vivo y contenido a demanda. No confundir el contenido gratuito con la señal lineal completa, que exige credencial de un cableoperador."},
 {id:"deportv-live",name:"DeporTV",country:"AR",category:"sports",website:"https://deportv.gob.ar/vivo",provider:"DeporTV · sitio oficial",access:"Canal público; página oficial de TV en vivo. La reproducción puede depender de la emisión y la región.",accessLevel:"free",tags:["deportes","fútbol","básquet","motor","tenis","vóley"],description:"Canal público argentino dedicado al deporte. La web oficial ofrece una sección DeporTV Vivo."},
 {id:"fifa-plus",name:"FIFA+",country:"AR",global:true,excludedCountries:["CU"],category:"sports",website:"https://www.dazn.com/es-AR/fifaplus",provider:"FIFA+ en DAZN · plataforma oficial",access:"Parte del catálogo y determinados partidos son gratuitos con cuenta; disponibilidad según país y competición.",accessLevel:"free_partial",tags:["fútbol","selecciones","juveniles","archivo"],description:"Fútbol internacional, torneos, selecciones y archivo. Los partidos disponibles y sus condiciones cambian según territorio."},
 {id:"afa-seleccion",name:"AFA Selección",country:"AR",global:true,category:"sports",website:"https://www.youtube.com/@AFASeleccion",provider:"AFA · canal oficial de YouTube",access:"Gratis · directos y videos cuando la AFA los publica",accessLevel:"free",tags:["fútbol","selección argentina","afa","youtube"],description:"Canal oficial de las selecciones argentinas. No es una señal lineal 24/7; los directos dependen de los eventos publicados."},
 {id:"fiba-youtube",name:"FIBA",country:"AR",global:true,category:"sports",website:"https://www.youtube.com/@FIBA",provider:"FIBA · canal oficial de YouTube",access:"Gratis · transmisiones y videos seleccionados",accessLevel:"free",tags:["básquet","basketball","selecciones","youtube"],description:"Básquet internacional y eventos oficiales cuando FIBA los transmite en abierto."},
 {id:"cinear-tv",name:"CINE.AR TV",country:"AR",category:"movies",website:"https://www.cine.ar/",provider:"CINE.AR · señal oficial",access:"Gratis por TDA y en operadores que incluyen la señal; no equivale a un reproductor web libre.",accessLevel:"free_antenna",tags:["cine","películas","documentales","argentina"],description:"Canal público de cine argentino con programación las 24 horas. La señal lineal se distribuye por TDA y operadores; para ver por internet, consultá CINE.AR Play."},
 {id:"cinear-play",name:"CINE.AR Play",country:"AR",category:"movies",website:"https://play.cine.ar/",provider:"INCAA / ARSAT · CINE.AR Play",access:"Catálogo gratuito con registro sin costo · películas, series, cortos y documentales",accessLevel:"free_ondemand",tags:["cine","películas","series","documentales","cortometrajes"],description:"Plataforma argentina gratuita de video a demanda. No es un canal lineal: ofrece películas, series, documentales y cortometrajes."},
 {id:"runtime-espanol",name:"Runtime Español",country:"AR",category:"movies",website:"https://www.runtime.tv/es/linear/runtime-espanol",provider:"Runtime · sitio oficial",access:"Gratis · películas y series con publicidad",accessLevel:"free_ads",tags:["películas","series","cine","entretenimiento"],description:"Canal temático en español con películas y series gratuitas."},
 {id:"pluto-tv",name:"Pluto TV",country:"AR",category:"entertainment",website:"https://plutotv.com.ar/welcome",provider:"Pluto TV · plataforma oficial",access:"Gratis con publicidad · canales en vivo y catálogo a demanda",accessLevel:"free_ads",tags:["películas","series","noticias","deportes","infantil","música","documentales"],description:"Plataforma FAST gratuita con canales temáticos y contenido bajo demanda. La grilla puede cambiar por país."},
 {id:"plex-live-tv",name:"Plex TV en vivo",country:"AR",global:true,excludedCountries:["CU"],category:"entertainment",website:"https://watch.plex.tv/live-tv",provider:"Plex · plataforma oficial",access:"Gratis con publicidad · canales en vivo y catálogo; cantidad y títulos dependen del país",accessLevel:"free_ads",tags:["películas","series","noticias","deportes","infantil","documentales"],description:"Servicio de TV en vivo y contenido a demanda gratuito con anuncios. No incluye señales premium de cable; la oferta varía por región."},
 {id:"samsung-tv-plus",name:"Samsung TV Plus",country:"AR",category:"entertainment",website:"https://www.samsung.com/latin/support/tv-audio-video/use-tv-plus-on-your-samsung-smart-tv-samsung-projector-or-samsung-monitor/",provider:"Samsung · TV Plus",access:"Gratis con publicidad, solo en televisores, proyectores y monitores Samsung compatibles (modelos 2019 o posteriores según región).",accessLevel:"free_device",tags:["películas","series","noticias","deportes","infantil","música","documentales"],description:"Servicio gratuito con canales de varias categorías. Requiere un dispositivo Samsung compatible; no se ofrece como reproductor web universal."},
 {id:"tda-argentina",name:"Televisión Digital Abierta (TDA)",country:"AR",category:"general",website:"https://www.tda.com.ar/",provider:"TDA Argentina · televisión abierta",access:"Gratis por antena TDA; más de 20 señales según cobertura y provincia. No es streaming web.",accessLevel:"free_antenna",tags:["televisión abierta","noticias","deportes","infantil","cultura","cine"],description:"Servicio de televisión abierta digital sin abono. La grilla disponible depende de la cobertura local; requiere antena y receptor compatibles."},
 {id:"pakapaka",name:"Pakapaka",country:"AR",category:"kids",website:"https://www.pakapaka.gob.ar/",provider:"Pakapaka · señal pública",access:"Contenidos oficiales gratuitos en la web; la señal lineal se distribuye por TDA y operadores.",accessLevel:"free_ondemand",tags:["infantil","dibujos animados","educación","familia"],description:"Señal pública infantil con contenidos educativos y culturales. El sitio reúne programas y emisiones; la distribución lineal depende de TDA y operadores."},
 {id:"encuentro",name:"Canal Encuentro",country:"AR",category:"education",website:"https://encuentro.gob.ar/",provider:"Canal Encuentro · señal pública",access:"Contenidos oficiales gratuitos en la web; la señal lineal se distribuye por TDA y operadores.",accessLevel:"free_ondemand",tags:["educación","historia","ciencia","cultura","documentales"],description:"Señal pública educativa y cultural. El sitio oficial ofrece contenidos de ciencia, historia, cultura y educación."},
 {id:"red-bull-tv",name:"Red Bull TV",country:"AR",global:true,category:"sports",website:"https://www.redbull.com/int-en/live",provider:"Red Bull · plataforma oficial",access:"Gratis · eventos y contenidos seleccionados; disponibilidad según territorio",accessLevel:"free_partial",tags:["deportes","motor","surf","skate","música","documentales"],description:"Transmisiones y producciones deportivas/culturales gratuitas seleccionadas; no es una señal deportiva premium convencional."}
];

const MAX_CHANNEL_SOURCES=50;
export async function onRequest(context){const {request,env}=context;if(!env.DB)return json({error:"service_unavailable"},503);const actor=await requireAdmin(request,env);if(!actor)return json({error:"forbidden"},403);const url=new URL(request.url),parts=url.pathname.split("/").filter(Boolean),resource=parts[2],id=parts[3];const now=Math.floor(Date.now()/1000);
if(request.method==="GET"&&resource==="users"){const r=await env.DB.prepare("SELECT id,email,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 500").all();const rows=r.results||[];const permissions=await env.DB.prepare("SELECT user_id,category FROM user_category_permissions").all();const channelPermissions=await env.DB.prepare("SELECT user_id,channel_id FROM user_channel_permissions").all();const channelConfigured=await env.DB.prepare("SELECT user_id FROM user_channel_settings").all();const configured=await env.DB.prepare("SELECT user_id FROM user_category_settings").all();const byUser={};for(const p of permissions.results||[])(byUser[p.user_id]??=[]).push(p.category);const configuredIds=new Set((configured.results||[]).map(x=>x.user_id));const byChannel={};for(const p of channelPermissions.results||[])(byChannel[p.user_id]??=[]).push(p.channel_id);const channelConfiguredIds=new Set((channelConfigured.results||[]).map(x=>x.user_id));return json({users:rows.map(u=>({...u,categories:configuredIds.has(u.id)?(byUser[u.id]||[]):CATEGORIES,channelIds:channelConfiguredIds.has(u.id)?(byChannel[u.id]||[]):null}))});}
if(request.method==="GET"&&resource==="channels"){const r=await env.DB.prepare("SELECT id,name,country,category,enabled,created_at,sources_json FROM channels ORDER BY name LIMIT 500").all();return json({channels:(r.results||[]).map(row=>{let meta={};try{meta=JSON.parse(row.sources_json||"[]")[0]||{};}catch{}return {id:row.id,name:row.name,country:row.country,category:row.category,enabled:!!row.enabled,created_at:row.created_at,source:typeof meta.url==="string"?meta.url:"",sources:(()=>{try{return JSON.parse(row.sources_json||"[]").map(x=>x.url).filter(Boolean)}catch{return []}})(),evidence:typeof meta.evidence==="string"?meta.evidence:"",website:typeof meta.website==="string"?meta.website:"",externalSources:(()=>{try{return JSON.parse(row.sources_json||"[]").filter(x=>x&&x.type==="official_page"&&x.authorizationScope==="external_link_only"&&x.authorizationStatus==="approved"&&publicHttpsUrl(String(x.website||""))).map(x=>({website:x.website,provider:x.provider||"Fuente oficial",access:x.access||"",accessLevel:x.accessLevel||"free_partial",description:x.description||""})).slice(0,50)}catch{return []}})(),logo:typeof meta.logo==="string"?meta.logo:"",language:typeof meta.language==="string"?meta.language:"",description:typeof meta.description==="string"?meta.description:"",directory:meta.directory||"",verification:meta.verification&&typeof meta.verification==="object"?meta.verification:null};})});}

if(request.method==="GET"&&resource==="discover-catalog"){
 const selectedCountry=String(url.searchParams.get("country")||"ALL").trim().toUpperCase();
 const rawCategory=String(url.searchParams.get("category")||"ALL").trim();
 const selectedCategory=!rawCategory||rawCategory.toLowerCase()==="all"?"ALL":rawCategory.toLowerCase();
 const query=String(url.searchParams.get("q")||"").trim().toLowerCase().slice(0,80);
 const limit=Math.max(1,Math.min(180,Number(url.searchParams.get("limit")||120)||120));
 const offset=Math.max(0,Math.min(5000,Number(url.searchParams.get("offset")||0)||0));
 if(selectedCountry!=="ALL"&&!COUNTRIES.includes(selectedCountry))return json({error:"invalid_country"},400);
 if(selectedCategory!=="ALL"&&!CATEGORIES.includes(selectedCategory))return json({error:"invalid_category"},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 let records;
 try{
  const response=await fetch("https://iptv-org.github.io/api/channels.json",{headers:{"Accept":"application/json","User-Agent":"Lumina-TV/1.4 public-channel-metadata-discovery"},signal:controller.signal,cf:{cacheTtl:900}});
  if(!response.ok)return json({error:"metadata_source_failed",status:response.status},502);
  const size=Number(response.headers.get("content-length")||0);
  if(size>12582912)return json({error:"metadata_source_too_large"},413);
  records=await response.json();
  if(!Array.isArray(records))return json({error:"metadata_source_invalid"},502);
 }catch(error){
  return json({error:error?.name==="AbortError"?"metadata_source_timeout":"metadata_source_failed"},502);
 }finally{clearTimeout(timer);}
 const eligible=[];
 for(const row of records){
  const country=String(row?.country||"").toUpperCase();
  if(!COUNTRIES.includes(country)||(selectedCountry!=="ALL"&&country!==selectedCountry))continue;
  const safetyText=[row.name,...(Array.isArray(row.categories)?row.categories:[]),...(Array.isArray(row.alt_names)?row.alt_names:[])].join(" ").toLowerCase();
  if(row.is_nsfw===true||row.closed||/(adult|nsfw|porn|erotic|xxx|18\s*\+)/i.test(safetyText))continue;
  const name=String(row.name||"").trim().slice(0,100);
  if(!name)continue;
  const category=categoryFromCatalog(row.categories||[]);
  if(selectedCategory!=="ALL"&&category!==selectedCategory)continue;
  const website=publicHttpsUrl(String(row.website||""));
  const searchText=[name,...(Array.isArray(row.alt_names)?row.alt_names:[]),row.network,...(Array.isArray(row.owners)?row.owners:[])].join(" ").toLowerCase();
  if(query&&!searchText.includes(query))continue;
  eligible.push({id:"IPTV:"+String(row.id||"").slice(0,140),label:name,description:[row.network,...(Array.isArray(row.owners)?row.owners:[])].filter(Boolean).join(" · ").slice(0,300),country,countryName:country,category,language:"",website:website?website.href:"",logo:"",source:"iptv-org"});
 }
 eligible.sort((a,b)=>a.country.localeCompare(b.country)||a.category.localeCompare(b.category)||a.label.localeCompare(b.label));
 const page=eligible.slice(offset,offset+limit);
 const wrapped=page.length?page:(offset?eligible.slice(0,limit):[]);
 return json({results:wrapped,source:"iptv-org",total:eligible.length,offset:page.length?offset:0,nextOffset:eligible.length?(page.length?((offset+page.length)%eligible.length):0):0,notice:"Metadatos públicos de canales. No incluyen transmisiones ni acreditan derechos de distribución."});
}
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
  if(!(/^Q\d{1,12}$/.test(id)||/^IPTV:[A-Za-z0-9._-]{1,140}$/.test(id))||!name||!COUNTRIES.includes(country)){invalid++;continue;}
  const key=country+"|"+normalizeChannelName(name);if(existing.has(key)||incoming.has(key)){duplicates++;continue;}
  incoming.add(key);
  let logo="";const logoUrl=publicHttpsUrl(String(item.logo||""));if(logoUrl)logo=logoUrl.href;
  const sourceKind=id.startsWith("IPTV:")?"iptv-org":"wikidata";
  const evidence=sourceKind==="wikidata"?"https://www.wikidata.org/wiki/"+id:"https://github.com/iptv-org/database";
  const officialWebsite=publicHttpsUrl(String(item.website||""));
  const category=CATEGORIES.includes(String(item.category||""))?String(item.category):"general";
  const metadata={url:"",language:String(item.language||"").slice(0,40),logo,description:String(item.description||"").slice(0,500),evidence:officialWebsite?officialWebsite.href:evidence,website:officialWebsite?officialWebsite.href:"",discoveryId:id,directory:sourceKind,directoryUrl:sourceKind==="iptv-org"?"https://iptv-org.github.io/api/channels.json":"https://www.wikidata.org/"};
  const channelId=crypto.randomUUID();
  stmts.push(env.DB.prepare("INSERT INTO channels(id,name,country,category,sources_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(channelId,name,country,category,JSON.stringify([metadata]),0,now,now));
  stmts.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_discovered_pending","channel",channelId,now));
  existing.add(key);added++;
 }
 for(let i=0;i<stmts.length;i+=100)await env.DB.batch(stmts.slice(i,i+100));
 return json({ok:true,added,duplicates,invalid});
}
if(resource==="discover-playlists"&&request.method==="POST")return json({error:"legacy_stream_scraping_disabled",message:"El descubridor ahora muestra sitios oficiales externos y no extrae enlaces de retransmisión de terceros."},410);
if((resource==="discover-official-sources"||resource==="discover-all-playlists")&&request.method==="POST"){
 const country=String(body.country||"ALL").trim().toUpperCase();
 const rawCategory=String(body.category||"ALL").trim().toLowerCase();
 const category=rawCategory==="all"?"ALL":rawCategory;
 if(country!=="ALL"&&!COUNTRIES.includes(country))return json({error:"invalid_country"},400);
 if(category!=="ALL"&&!CATEGORIES.includes(category))return json({error:"invalid_category"},400);
 const normalizeSearch=value=>String(value||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().trim();
 const q=normalizeSearch(body.q).slice(0,80);
 const results=OFFICIAL_FREE_SOURCES.filter(item=>(country==="ALL"||item.country===country||(item.global&&!(item.excludedCountries||[]).includes(country)))&&(category==="ALL"||item.category===category)&&(!q||normalizeSearch([item.name,item.provider,item.description,item.access,...(item.tags||[])].join(" ")).includes(q))).map(item=>({...item,country:country==="ALL"?item.country:country}));
 return json({ok:true,source:"official-free-directory",country,category,results:results.map(item=>({...item,externalOnly:true,authorizationStatus:"approved_for_external_link"})),total:results.length,notice:"Directorio de fuentes oficiales con acceso gratuito, parcialmente gratuito o condicionado. Las opciones abren la web del titular; no extraen ni retransmiten señales. Revisá la condición de acceso y la disponibilidad territorial."});
}
if((resource==="official-source"||resource==="official-sports")&&request.method==="POST"){
 const sourceId=String(body.sourceId||"");
 const source=OFFICIAL_FREE_SOURCES.find(item=>item.id===sourceId);
 if(!source)return json({error:"unknown_official_source"},404);
 const requestedCountry=String(body.country||source.country).toUpperCase();
 if(!COUNTRIES.includes(requestedCountry)||(!source.global&&requestedCountry!==source.country)||(source.excludedCountries||[]).includes(requestedCountry))return json({error:"official_source_unavailable_in_country"},400);
 const country=requestedCountry,category=source.category,name=source.name;
 const website=publicHttpsUrl(source.website);
 if(!website)return json({error:"invalid_official_source"},400);
 const existing=await env.DB.prepare("SELECT id,sources_json,enabled FROM channels WHERE country=? AND name=? COLLATE NOCASE LIMIT 1").bind(country,name).first();
 const officialEntry={type:"official_page",website:website.href,url:"",provider:source.provider,access:source.access,accessLevel:source.accessLevel,description:source.description,authorizationStatus:"approved",authorizationScope:"external_link_only",directory:"official-free-directory",directoryUrl:website.href,discoveredAt:now};
 if(existing){
  let sources=[];try{sources=JSON.parse(existing.sources_json||"[]").filter(x=>x&&typeof x==="object");}catch{}
  const merged=[...sources.filter(x=>x.website!==website.href),officialEntry].slice(0,50);
  await env.DB.batch([
   env.DB.prepare("UPDATE channels SET category=?,sources_json=?,enabled=1,updated_at=? WHERE id=?").bind(category,JSON.stringify(merged),now,existing.id),
   env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"official_free_source_added","channel",existing.id,now)
  ]);
  return json({ok:true,id:existing.id,added:true,updated:true,options:merged.filter(x=>x.type==="official_page").length});
 }
 const channelId=crypto.randomUUID();
 await env.DB.batch([
  env.DB.prepare("INSERT INTO channels(id,name,country,category,sources_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(channelId,name,country,category,JSON.stringify([officialEntry]),1,now,now),
  env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"official_free_source_added","channel",channelId,now)
 ]);
 return json({ok:true,id:channelId,added:true,updated:false,options:1},201);
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
   const response=await fetch(feed.href,{method:"GET",redirect:"manual",signal:controller.signal,headers:{"Accept":"application/x-mpegURL,application/vnd.apple.mpegurl,audio/x-mpegurl,text/plain,*/*","User-Agent":"Lumina-TV/1.0 authorized playlist importer"}});
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
 const parsed=parseM3UEntries(playlistText,defaultCountry,feedUrl,evidenceUrl.href);
 if(!parsed.entries.length)return json({error:"no_supported_entries",skipped:parsed.skipped},400);
 const grouped=new Map(),seen=new Set();
 let duplicates=0,capped=0;
 for(const entry of parsed.entries){
  const key=entry.country+"|"+normalizeChannelName(entry.name);
  let group=grouped.get(key);
  if(!group){group={name:entry.name,country:entry.country,category:entry.category,entries:[]};grouped.set(key,group);}
  if(group.entries.some(item=>item.url===entry.url)){duplicates++;continue;}
  group.entries.push(entry);
  seen.add(key);
 }
 const existingResult=await env.DB.prepare("SELECT id,name,country,category,sources_json,enabled FROM channels LIMIT 5000").all();
 const existing=new Map();
 for(const row of existingResult.results||[]){
  const key=String(row.country||"")+"|"+normalizeChannelName(row.name);
  let sources=[];try{sources=JSON.parse(row.sources_json||"[]").filter(x=>x&&typeof x==="object");}catch{}
  existing.set(key,{...row,sources});
 }
 const statements=[];let added=0,updated=0,disabled=0,optionsAdded=0;
 for(const [key,group] of grouped){
  const incoming=group.entries.map(entry=>({
   url:entry.url,language:entry.language,logo:entry.logo,
   description:entry.group?"Grupo: "+entry.group:"Importado desde lista M3U autorizada",
   evidence:evidenceUrl.href,feedUrl:entry.feedUrl||"",
   directory:"authorized-m3u",authorizationStatus:"approved",authorizationScope:"direct_feed",
   verification:{status:"not_checked"}
  }));
  const previous=existing.get(key);
  let merged=[];
  if(previous){
   const previousSources=previous.sources||[];
   const preserved=feedUrl?previousSources.filter(item=>item.feedUrl!==feedUrl):previousSources;
   merged=[...preserved,...incoming];
   if(!feedUrl){
    for(const old of previousSources)if(!incoming.some(item=>item.url===old.url)&&!merged.some(item=>item.url===old.url))merged.push(old);
   }
   merged=[...new Map(merged.filter(item=>item.url).map(item=>[item.url,item])).values()];
   if(merged.length>MAX_CHANNEL_SOURCES){capped+=merged.length-MAX_CHANNEL_SOURCES;merged=merged.slice(0,MAX_CHANNEL_SOURCES);}
   const beforeUrls=new Set(previousSources.map(item=>item.url).filter(Boolean));
   const addedForGroup=merged.filter(item=>!beforeUrls.has(item.url)).length;
   optionsAdded+=addedForGroup;
   if(addedForGroup===0&&JSON.stringify(previousSources)===JSON.stringify(merged)){duplicates+=incoming.length;continue;}
   statements.push(env.DB.prepare("UPDATE channels SET category=?,sources_json=?,enabled=0,updated_at=? WHERE id=?").bind(group.category,JSON.stringify(merged),now,previous.id));
   statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_feed_import_pending","channel",previous.id,now));
   previous.sources=merged;previous.enabled=0;updated++;
  }else{
   merged=incoming.slice(0,MAX_CHANNEL_SOURCES);
   if(incoming.length>MAX_CHANNEL_SOURCES)capped+=incoming.length-MAX_CHANNEL_SOURCES;
   const channelId=crypto.randomUUID();
   statements.push(env.DB.prepare("INSERT INTO channels(id,name,country,category,sources_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(channelId,group.name,group.country,group.category,JSON.stringify(merged),0,now,now));
   statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_feed_import_pending","channel",channelId,now));
   existing.set(key,{id:channelId,name:group.name,country:group.country,category:group.category,sources:merged,enabled:0});added++;optionsAdded+=merged.length;
  }
 }
 if(feedUrl){
  for(const [key,row] of existing){
   if(seen.has(key))continue;
   const previousSources=row.sources||[];
   if(!previousSources.some(item=>item.feedUrl===feedUrl))continue;
   const remaining=previousSources.filter(item=>item.feedUrl!==feedUrl);
   statements.push(env.DB.prepare("UPDATE channels SET sources_json=?,enabled=?,updated_at=? WHERE id=?").bind(JSON.stringify(remaining),remaining.length?Number(row.enabled||0):0,now,row.id));
   statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_feed_removed","channel",row.id,now));
   row.sources=remaining;disabled++;
  }
 }
 for(let i=0;i<statements.length;i+=100)await env.DB.batch(statements.slice(i,i+100));
 return json({ok:true,added,updated,optionsAdded,duplicates,disabled,capped,skipped:parsed.skipped,feedUrl,pending:true,maxOptionsPerChannel:MAX_CHANNEL_SOURCES,notice:"Las entradas importadas quedan pendientes y desactivadas. Revisá los derechos y probá cada opción antes de activarlas."});
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

if(resource==="channels"&&id==="bulk-status"&&request.method==="POST"){
 if(typeof body.enabled!=="boolean")return json({error:"invalid_channel_status"},400);
 const all=body.all===true;
 let rows=[];
 if(all){
  const result=await env.DB.prepare("SELECT id,name,sources_json,enabled FROM channels").all();
  rows=result.results||[];
 }else{
  if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>500||body.ids.some(x=>typeof x!=="string"||x.length>80))return json({error:"invalid_channel_ids"},400);
  const requested=[...new Set(body.ids)];
  for(let offset=0;offset<requested.length;offset+=80){
   const batch=requested.slice(offset,offset+80);
   const result=await env.DB.prepare("SELECT id,name,sources_json,enabled FROM channels WHERE id IN ("+batch.map(()=>"?").join(",")+")").bind(...batch).all();
   rows.push(...(result.results||[]));
  }
 }
 let changed=0,skipped=0,unchanged=0,skippedNoSource=0,skippedUnverified=0,skippedNoEvidence=0;
 const updates=[];
 for(const row of rows){
  if(!!row.enabled===body.enabled){unchanged++;continue;}
  if(body.enabled){
   let sources=[];try{sources=JSON.parse(row.sources_json||"[]");}catch{}
   if(!Array.isArray(sources))sources=[];
   const officialExternal=sources.some(item=>item&&item.type==="official_page"&&item.authorizationStatus==="approved"&&item.authorizationScope==="external_link_only"&&!!publicHttpsUrl(String(item.website||"")));
   const hasDirectSource=sources.some(item=>item&&typeof item.url==="string"&&item.url.trim());
   if(!hasDirectSource&&!officialExternal){skipped++;skippedNoSource++;continue;}
   const eligible=officialExternal||sources.some(item=>{
    if(!item||typeof item.url!=="string"||!item.url.trim()||item.verification?.ok!==true||item.authorizationStatus!=="approved")return false;
    const evidence=publicHttpsUrl(String(item.evidence||sources.find(x=>x&&x.evidence)?.evidence||""));
    const source=publicHttpsUrl(String(item.url));
    return !!evidence&&!!source;
   });
   if(!eligible){
    skipped++;
    const anyVerified=sources.some(item=>item?.verification?.ok===true&&publicHttpsUrl(String(item.url||"")));
    if(!anyVerified)skippedUnverified++;
    else skippedNoEvidence++;
    continue;
   }
  }
  updates.push(row.id);
 }
 try{
  for(let offset=0;offset<updates.length;offset+=20){
   const batch=updates.slice(offset,offset+20),statements=[];
   for(const channelId of batch){
    statements.push(env.DB.prepare("UPDATE channels SET enabled=?,updated_at=? WHERE id=?").bind(body.enabled?1:0,now,channelId));
    statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,body.enabled?"channels_bulk_enable":"channels_bulk_disable","channel",channelId,now));
   }
   await env.DB.batch(statements);
   changed+=batch.length;
  }
 }catch(error){
  const detail=String(error?.message||"database_error").replace(/[\\r\\n]+/g," ").slice(0,180);
  return json({error:"channel_bulk_status_failed",detail,changed,skipped,unchanged},500);
 }
 return json({ok:true,enabled:body.enabled,requested:rows.length,changed,skipped,unchanged,skippedNoSource,skippedUnverified,skippedNoEvidence,all});
}
if(resource==="channels"&&id==="bulk-delete"&&request.method==="POST"){
 const all=body.all===true;
 let ids=[];
 if(all){
  if(body.confirmAll!=="BORRAR TODOS LOS CANALES")return json({error:"confirmation_required"},400);
  const result=await env.DB.prepare("SELECT id FROM channels").all();
  ids=(result.results||[]).map(row=>row.id);
 }else{
  if(!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>500||body.ids.some(x=>typeof x!=="string"||x.length>80))return json({error:"invalid_channel_ids"},400);
  const requested=[...new Set(body.ids)];
  const existing=[];
  for(let offset=0;offset<requested.length;offset+=80){
   const batch=requested.slice(offset,offset+80);
   const result=await env.DB.prepare("SELECT id FROM channels WHERE id IN ("+batch.map(()=>"?").join(",")+")").bind(...batch).all();
   existing.push(...(result.results||[]).map(row=>row.id));
  }
  ids=existing;
 }
 if(!ids.length)return json({ok:true,deleted:0,all});
 let deleted=0;
 try{
  for(let offset=0;offset<ids.length;offset+=20){
   const batch=ids.slice(offset,offset+20);
   const placeholders=batch.map(()=>"?").join(",");
   const statements=[
    env.DB.prepare("DELETE FROM user_channel_permissions WHERE channel_id IN ("+placeholders+")").bind(...batch),
    env.DB.prepare("DELETE FROM channels WHERE id IN ("+placeholders+")").bind(...batch)
   ];
   for(const channelId of batch){
    statements.push(env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,all?"channels_bulk_delete_all":"channel_bulk_delete","channel",channelId,now));
   }
   await env.DB.batch(statements);
   deleted+=batch.length;
  }
 }catch(error){
  const detail=String(error?.message||"database_error").replace(/[\\r\\n]+/g," ").slice(0,180);
  return json({error:"channel_bulk_delete_failed",detail,deleted},500);
 }
 return json({ok:true,deleted,all});
}
if(resource==="channels"&&request.method==="POST"){const name=String(body.name||"").trim(),country=String(body.country||"").trim().toUpperCase(),category=String(body.category||"general"),source=String(body.source||"").trim(),language=String(body.language||"").trim().slice(0,40),logo=String(body.logo||"").trim(),description=String(body.description||"").trim().slice(0,500),evidence=String(body.evidence||"").trim();if(!name||name.length>100||!COUNTRIES.includes(country)||!CATEGORIES.includes(category)||!evidence||evidence.length>500)return json({error:"invalid_channel"},400);let ev,lg;try{ev=new URL(evidence);if(logo)lg=new URL(logo);}catch{return json({error:"invalid_channel"},400);}if(ev.protocol!=="https:"||ev.username||ev.password||(logo&&(lg.protocol!=="https:"||lg.username||lg.password)))return json({error:"invalid_channel"},400);const pending=body.pending===true;const duplicate=await env.DB.prepare("SELECT id FROM channels WHERE country=? AND name=? COLLATE NOCASE LIMIT 1").bind(country,name).first();if(duplicate)return json({error:"channel_exists"},409);let stream="";if(!pending){let u;try{u=new URL(source);}catch{return json({error:"invalid_source"},400);}if(!isVideoSource(u.href))return json({error:"invalid_source"},400);stream=u.href;}let verification=null;if(!pending){verification=await probeVideoSource(stream);if(!verification.ok)return json({error:"source_not_verified",probe:verification},422);}const channelId=crypto.randomUUID(),metadata={url:stream,language,logo:logo||"",description,evidence:ev.href,verification};await env.DB.prepare("INSERT INTO channels(id,name,country,category,sources_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(channelId,name,country,category,JSON.stringify([metadata]),pending?0:1,now,now).run();await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,pending?"channel_pending":"channel_create","channel",channelId,now).run();return json({ok:true,id:channelId,pending},201);}
if(resource==="channels"&&id&&request.method==="PATCH"){
 const name=String(body.name||"").trim(),country=String(body.country||"").toUpperCase(),category=String(body.category||"general"),source=String(body.source||"").trim(),evidence=String(body.evidence||"").trim(),enabled=body.enabled===true;
 if(!name||name.length>100||!COUNTRIES.includes(country)||!CATEGORIES.includes(category))return json({error:"invalid_channel"},400);
 const old=await env.DB.prepare("SELECT sources_json FROM channels WHERE id=?").bind(id).first();
 if(!old)return json({error:"not_found"},404);
 let oldSources=[];try{oldSources=JSON.parse(old.sources_json||"[]").filter(x=>x&&typeof x==="object")}catch{}
 const requested=Array.isArray(body.sources)?body.sources:[source];
 const urls=[...new Set(requested.map(x=>String(x||"").trim()).filter(Boolean))].slice(0,MAX_CHANNEL_SOURCES);
 const officialSources=oldSources.filter(item=>item.type==="official_page"&&item.authorizationStatus==="approved"&&item.authorizationScope==="external_link_only"&&publicHttpsUrl(String(item.website||"")));
 if(!urls.length){
  if(enabled&&!officialSources.length)return json({error:"source_not_verified",message:"No hay una fuente de vídeo verificada ni una página oficial externa."},422);
  const kept=officialSources.length?officialSources:oldSources;
  await env.DB.batch([
   env.DB.prepare("UPDATE channels SET name=?,country=?,category=?,sources_json=?,enabled=?,updated_at=? WHERE id=?").bind(name,country,category,JSON.stringify(kept),enabled?1:0,now,id),
   env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,enabled?"channel_enable_external":"channel_disable","channel",id,now)
  ]);
  return json({ok:true,enabled,externalOnly:officialSources.length>0,sourceCount:0,failedSources:0});
 }
 const evidenceUrl=publicHttpsUrl(evidence);
 if(!evidenceUrl)return json({error:"invalid_channel_evidence"},400);
 const safeUrls=[];
 for(const value of urls){
  const safeSource=publicHttpsUrl(value);
  if(!safeSource||!isVideoSource(safeSource.href))return json({error:"invalid_source"},400);
  if(!safeUrls.includes(safeSource.href))safeUrls.push(safeSource.href);
 }
 const checked=[];let failedSources=0;
 for(let offset=0;offset<safeUrls.length;offset+=8){
  const batch=safeUrls.slice(offset,offset+8);
  const validations=await Promise.all(batch.map(async url=>({url,verification:enabled?await probeVideoSource(url,1800):null})));
  for(const item of validations){
   if(enabled&&!item.verification?.ok){failedSources++;continue;}
   const previous=oldSources.find(sourceItem=>sourceItem.url===item.url)||{};
   checked.push({...previous,url:item.url,evidence:evidenceUrl.href,authorizationStatus:enabled?"approved":(previous.authorizationStatus||"pending"),authorizationScope:previous.authorizationScope||"direct_feed",authorizationConfirmedAt:enabled?now:(previous.authorizationConfirmedAt||null),verification:item.verification||previous.verification||null});
  }
 }
 if(enabled&&!checked.some(item=>item.authorizationStatus==="approved"&&item.verification?.ok===true))return json({error:"source_not_verified",failedSources},422);
 const nextSources=[...checked,...officialSources].slice(0,MAX_CHANNEL_SOURCES);
 const meta={...(nextSources[0]||{}),evidence:evidenceUrl.href};
 for(const key of ["language","logo","description"])if(body[key]!==undefined)meta[key]=String(body[key]).slice(0,500);
 if(nextSources.length)nextSources[0]=meta;
 await env.DB.batch([
  env.DB.prepare("UPDATE channels SET name=?,country=?,category=?,sources_json=?,enabled=?,updated_at=? WHERE id=?").bind(name,country,category,JSON.stringify(nextSources),enabled?1:0,now,id),
  env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_update","channel",id,now)
 ]);
 return json({ok:true,enabled,sourceCount:checked.length,externalSourceCount:officialSources.length,failedSources});
}
if(resource==="channels"&&id&&request.method==="DELETE"){const statements=[env.DB.prepare("DELETE FROM user_channel_permissions WHERE channel_id=?").bind(id),env.DB.prepare("DELETE FROM channels WHERE id=?").bind(id),env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_delete","channel",id,now)];try{await env.DB.batch(statements);}catch(error){return json({error:"channel_delete_failed",detail:String(error?.message||"database_error").replace(/[\\r\\n]+/g," ").slice(0,180)},500);}return json({ok:true});}
return json({error:"not_found"},404);}
