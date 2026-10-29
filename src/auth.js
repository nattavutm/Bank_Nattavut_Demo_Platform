const encoder=new TextEncoder();
const COOKIE='__Host-trendai_session';
const TTL=8*60*60;
const failures=new Map();
const PUBLIC_ASSETS=new Set(['/login.js','/styles.css','/design-preview.css','/brand/trendai-logo.png','/brand/trendai-symbol.svg','/brand/trendmicro-favicon.ico','/fonts/Inter-400.ttf','/fonts/Inter-500.ttf','/fonts/Inter-600.ttf','/fonts/Inter-700.ttf','/fonts/OFL.txt']);
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function unb64(value){if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid encoding');return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
async function keyFor(config){return crypto.subtle.importKey('raw',encoder.encode(config.sessionKey),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function configFor(env){try{const config=JSON.parse(env.APP_AUTH_SECRET);return typeof config.password==='string'&&config.password.length>=16&&typeof config.sessionKey==='string'&&config.sessionKey.length>=32?config:null;}catch{return null;}}
async function authenticated(request,config){
  if(!config)return false;
  const token=request.headers.get('Cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!token||token.length>1024)return false;
  try{
    const parts=token.split('.');if(parts.length!==2)return false;
    if(!await crypto.subtle.verify('HMAC',await keyFor(config),unb64(parts[1]),encoder.encode(parts[0])))return false;
    const claims=JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    const now=Math.floor(Date.now()/1000);
    return Number.isInteger(claims.exp)&&claims.exp>now&&claims.exp<=now+TTL&&claims.aud===new URL(request.url).host;
  }catch{return false;}
}
async function boundedJson(request){
  if(!request.headers.get('Content-Type')?.includes('application/json'))throw new Error('JSON required');
  const reader=request.body?.getReader();let size=0,parts=[];
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw new Error('Too large');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
function failed(ip,now){
  for(const [key,value] of failures)if(value.until<=now)failures.delete(key);
  return failures.get(ip);
}
export async function authorize(request,env){
  const url=new URL(request.url),path=url.pathname;
  const config=configFor(env);
  if(path==='/api/login'){
    if(request.method!=='POST')return json({error:'Use POST.'},405);
    if(request.headers.get('Origin')!==url.origin)return json({error:'Invalid request origin.'},403);
    if(!config)return json({error:'Sign-in is not configured. Please contact the demo owner.'},503);
    const ip=request.headers.get('CF-Connecting-IP')||'local',now=Date.now(),attempt=failed(ip,now);
    if(attempt?.count>=10)return json({error:'Too many attempts. Please try again in one minute.'},429,{'Retry-After':'60'});
    let body;try{body=await boundedJson(request);}catch{return json({error:'Invalid sign-in request.'},400);}
    if(typeof body.password!=='string'||body.password.length>256)return json({error:'Invalid sign-in request.'},400);
    const key=await keyFor(config);
    const expected=await crypto.subtle.sign('HMAC',key,encoder.encode(config.password));
    if(!await crypto.subtle.verify('HMAC',key,expected,encoder.encode(body.password))){
      if(failures.size>=2048)failures.delete(failures.keys().next().value);
      failures.set(ip,{count:(attempt?.count||0)+1,until:attempt?.until||now+60000});
      return json({error:'Incorrect password.'},401);
    }
    failures.delete(ip);
    const payload=b64(encoder.encode(JSON.stringify({exp:Math.floor(now/1000)+TTL,aud:url.host,nonce:crypto.randomUUID()})));
    const signature=b64(await crypto.subtle.sign('HMAC',key,encoder.encode(payload)));
    return json({authenticated:true},200,{'Set-Cookie':COOKIE+'='+payload+'.'+signature+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+TTL});
  }
  if(path==='/api/logout'){
    if(request.method!=='POST')return json({error:'Use POST.'},405);
    if(request.headers.get('Origin')!==url.origin)return json({error:'Invalid request origin.'},403);
    return json({authenticated:false},200,{'Set-Cookie':COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
  }
  // Only the login screen and its non-sensitive visual assets are public.
  if(path==='/login'||path==='/login.html'){
    if(await authenticated(request,config))return Response.redirect(url.origin+'/',303);
    const response=await env.ASSETS.fetch(new Request(url.origin+'/login',request));
    const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Frame-Options','DENY');
    return new Response(response.body,{status:response.status,headers});
  }
  if(PUBLIC_ASSETS.has(path))return env.ASSETS.fetch(request);
  if(await authenticated(request,config))return null;
  if(path.startsWith('/api/'))return json({error:'Please sign in to continue.'},401);
  return new Response(null,{status:303,headers:{Location:'/login','Cache-Control':'no-store'}});
}
