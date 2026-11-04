async function sha(value){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
async function requireAdmin(request,env){const m=(request.headers.get("Cookie")||"").match(/(?:^|;\s*)minios_tv_session=([^;]+)/);if(!m)return null;let token;try{token=decodeURIComponent(m[1]);}catch{return null;}if(token.length!==64)return null;const now=Math.floor(Date.now()/1000);const row=await env.DB.prepare("SELECT u.id,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active' LIMIT 1").bind(await sha(token),now).first();return row&&row.role==="admin"?row:null;}
function validOrigin(request){try{return request.url.startsWith("https://")&&request.headers.get("Origin")===new URL(request.url).origin;}catch{return false;}}
const CATEGORIES=["general","sports","news","entertainment","education","culture","music","religion"];
const COUNTRIES=["AR","BR","CL","UY","PY","BO","PE","EC","CO","VE","MX","CR","CU","DO","SV","GT","HN","NI","PA","PR"];
export async function onRequest(context){const {request,env}=context;if(!env.DB)return json({error:"service_unavailable"},503);const actor=await requireAdmin(request,env);if(!actor)return json({error:"forbidden"},403);const url=new URL(request.url),parts=url.pathname.split("/").filter(Boolean),resource=parts[2],id=parts[3];const now=Math.floor(Date.now()/1000);
if(request.method==="GET"&&resource==="users"){const r=await env.DB.prepare("SELECT id,email,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 500").all();const rows=r.results||[];const permissions=await env.DB.prepare("SELECT user_id,category FROM user_category_permissions").all();const channelPermissions=await env.DB.prepare("SELECT user_id,channel_id FROM user_channel_permissions").all();const channelConfigured=await env.DB.prepare("SELECT user_id FROM user_channel_settings").all();const configured=await env.DB.prepare("SELECT user_id FROM user_category_settings").all();const byUser={};for(const p of permissions.results||[])(byUser[p.user_id]??=[]).push(p.category);const configuredIds=new Set((configured.results||[]).map(x=>x.user_id));const byChannel={};for(const p of channelPermissions.results||[])(byChannel[p.user_id]??=[]).push(p.channel_id);const channelConfiguredIds=new Set((channelConfigured.results||[]).map(x=>x.user_id));return json({users:rows.map(u=>({...u,categories:configuredIds.has(u.id)?(byUser[u.id]||[]):CATEGORIES,channelIds:channelConfiguredIds.has(u.id)?(byChannel[u.id]||[]):null}))});}
if(request.method==="GET"&&resource==="channels"){const r=await env.DB.prepare("SELECT id,name,country,category,enabled,created_at FROM channels ORDER BY name LIMIT 500").all();return json({channels:r.results||[]});}
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
let body={};if(request.method!=="DELETE"){try{const raw=await request.text();if(new TextEncoder().encode(raw).length>32768)return json({error:"payload_too_large"},413);body=JSON.parse(raw);if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"invalid_request"},400);}catch{return json({error:"invalid_request"},400);}}
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
if(resource==="channels"&&request.method==="POST"){const name=String(body.name||"").trim(),country=String(body.country||"").trim().toUpperCase(),category=String(body.category||"general"),source=String(body.source||"").trim(),language=String(body.language||"").trim().slice(0,40),logo=String(body.logo||"").trim(),description=String(body.description||"").trim().slice(0,500),evidence=String(body.evidence||"").trim();if(!name||name.length>100||!COUNTRIES.includes(country)||!CATEGORIES.includes(category)||!evidence||evidence.length>500)return json({error:"invalid_channel"},400);let ev,lg;try{ev=new URL(evidence);if(logo)lg=new URL(logo);}catch{return json({error:"invalid_channel"},400);}if(ev.protocol!=="https:"||ev.username||ev.password||(logo&&(lg.protocol!=="https:"||lg.username||lg.password)))return json({error:"invalid_channel"},400);const pending=body.pending===true;const duplicate=await env.DB.prepare("SELECT id FROM channels WHERE country=? AND name=? COLLATE NOCASE LIMIT 1").bind(country,name).first();if(duplicate)return json({error:"channel_exists"},409);let stream="";if(!pending){let u;try{u=new URL(source);}catch{return json({error:"invalid_source"},400);}if(u.protocol!=="https:"||u.username||u.password)return json({error:"invalid_channel"},400);stream=u.href;}const channelId=crypto.randomUUID(),metadata={url:stream,language,logo:logo||"",description,evidence:ev.href};await env.DB.prepare("INSERT INTO channels(id,name,country,category,sources_json,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(channelId,name,country,category,JSON.stringify([metadata]),pending?0:1,now,now).run();await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,pending?"channel_pending":"channel_create","channel",channelId,now).run();return json({ok:true,id:channelId,pending},201);}
if(resource==="channels"&&id&&request.method==="PATCH"){const name=String(body.name||"").trim(),country=String(body.country||"").toUpperCase(),category=String(body.category||"general"),source=String(body.source||"").trim(),evidence=String(body.evidence||"").trim(),enabled=body.enabled===true;if(!name||name.length>100||!COUNTRIES.includes(country)||!CATEGORIES.includes(category)||!evidence)return json({error:"invalid_channel"},400);let ev;try{ev=new URL(evidence)}catch{return json({error:"invalid_channel"},400)}if(ev.protocol!=="https:"||ev.username||ev.password)return json({error:"invalid_channel"},400);let stream="";if(enabled){let u;try{u=new URL(source)}catch{return json({error:"invalid_source"},400)}if(u.protocol!=="https:"||u.username||u.password)return json({error:"invalid_source"},400);stream=u.href;}const old=await env.DB.prepare("SELECT sources_json FROM channels WHERE id=?").bind(id).first();if(!old)return json({error:"not_found"},404);let meta={};try{meta=JSON.parse(old.sources_json)[0]||{}}catch{}meta.url=stream;meta.evidence=ev.href;for(const k of ["language","logo","description"])if(body[k]!==undefined)meta[k]=String(body[k]).slice(0,500);await env.DB.prepare("UPDATE channels SET name=?,country=?,category=?,sources_json=?,enabled=?,updated_at=? WHERE id=?").bind(name,country,category,JSON.stringify([meta]),enabled?1:0,now,id).run();await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_update","channel",id,now).run();return json({ok:true,enabled});}
if(resource==="channels"&&id&&request.method==="DELETE"){await env.DB.prepare("DELETE FROM channels WHERE id=?").bind(id).run();await env.DB.prepare("INSERT INTO audit_log(id,actor_user_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,"channel_delete","channel",id,now).run();return json({ok:true});}
return json({error:"not_found"},404);}
