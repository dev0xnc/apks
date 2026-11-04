async function hash(v){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");}
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
function parseSources(value){try{const parsed=JSON.parse(value||"[]");return Array.isArray(parsed)?parsed.filter(x=>x&&typeof x==="object"):[];}catch{return [];}}
function safeHttps(value){try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password?u.href:"";}catch{return "";}}
export async function onRequest({request,env}){
 if(request.method!=="GET")return json({error:"method_not_allowed"},405);
 if(!env.DB)return json({error:"service_unavailable"},503);
 const m=(request.headers.get("Cookie")||"").match(/(?:^|;\\s*)minios_tv_session=([^;]+)/);
 if(!m)return json({error:"unauthorized"},401);
 let token;try{token=decodeURIComponent(m[1]);}catch{return json({error:"unauthorized"},401);}
 if(token.length!==64)return json({error:"unauthorized"},401);
 const now=Math.floor(Date.now()/1000);
 const user=await env.DB.prepare("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active' LIMIT 1").bind(await hash(token),now).first();
 if(!user)return json({error:"unauthorized"},401);
 const [categoryRows,categorySetting,channelRows,channelSetting,channelResult]=await Promise.all([
  env.DB.prepare("SELECT category FROM user_category_permissions WHERE user_id=?").bind(user.id).all(),
  env.DB.prepare("SELECT user_id FROM user_category_settings WHERE user_id=?").bind(user.id).first(),
  env.DB.prepare("SELECT channel_id FROM user_channel_permissions WHERE user_id=?").bind(user.id).all(),
  env.DB.prepare("SELECT user_id FROM user_channel_settings WHERE user_id=?").bind(user.id).first(),
  env.DB.prepare("SELECT id,name,country,category,enabled,sources_json FROM channels ORDER BY name LIMIT 2000").all()
 ]);
 const allowedCategories=new Set((categoryRows.results||[]).map(x=>x.category));
 const allowedChannelIds=new Set((channelRows.results||[]).map(x=>x.channel_id));
 const customCategories=!!categorySetting,customChannels=!!channelSetting;
 const visible=(channel)=>(
  (!customCategories||allowedCategories.has(channel.category))&&
  (!customChannels||allowedChannelIds.has(channel.id))
 );
 const catalog=[],channels=[];
 for(const row of channelResult.results||[]){
  if(!visible(row))continue;
  const sources=parseSources(row.sources_json);
  const safeSources=sources.filter(item=>safeHttps(item.url));
  const available=Number(row.enabled)===1&&safeSources.length>0;
  const first=safeSources[0]||{};
  catalog.push({
   id:row.id,name:row.name,country:row.country||"",category:row.category,
   enabled:available,logo:safeHttps(first.logo)||"",website:safeHttps(first.website)||"",
   status:available?"available":"pending"
  });
  if(available){
   for(let index=0;index<safeSources.length;index++){
    const source=safeSources[index];
    channels.push({
     id:row.id+"-"+index,channelId:row.id,name:row.name,url:safeHttps(source.url),
     group:row.category,country:row.country||"",category:row.category,categories:[row.category],
     logo:safeHttps(source.logo)||"",description:String(source.description||"").slice(0,500),
     language:String(source.language||"").slice(0,40),source:"admin"
    });
   }
  }
 }
 return json({channels,catalog,activeCount:channels.length,pendingCount:catalog.filter(x=>!x.enabled).length});
}
