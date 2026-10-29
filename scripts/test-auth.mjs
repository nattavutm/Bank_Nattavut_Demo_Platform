import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
const password='unit-test-password-not-real';
const config={password,sessionKey:'test-signing-key-long-enough-not-production'};
const env={APP_AUTH_SECRET:JSON.stringify(config),ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname)}};
const origin='https://demo.test';
const login=(value=password,extra={})=>new Request(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'CF-Connecting-IP':crypto.randomUUID(),...extra},body:JSON.stringify({password:value})});
const cookieOf=response=>response.headers.get('Set-Cookie').split(';')[0];
test('anonymous app and API requests cannot bypass the gate',async()=>{
 for(const path of ['/','/app.js','/brand/missing','/fonts/missing','/api/chat','/api/health','/api/chat/protected']){
  const response=await worker.fetch(new Request(origin+path),env);
  assert.equal(response.status,path.startsWith('/api/')?401:303);assert.equal(response.headers.get('Cache-Control'),'no-store');
 }
});
test('missing or malformed auth configuration fails closed',async()=>{
 for(const APP_AUTH_SECRET of [undefined,'{}','not json']){
  assert.equal((await worker.fetch(new Request(origin+'/api/chat'),{...env,APP_AUTH_SECRET})).status,401);
  assert.equal((await worker.fetch(login(),{...env,APP_AUTH_SECRET})).status,503);
 }
});
test('login page is public but has no private app content',async()=>{
 const response=await worker.fetch(new Request(origin+'/login'),env);assert.equal(await response.text(),'/login');assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('incorrect password does not issue a session or echo the password',async()=>{
 const response=await worker.fetch(login('incorrect'),env);assert.equal(response.status,401);assert.equal(response.headers.has('Set-Cookie'),false);assert.equal((await response.text()).includes('incorrect'),false);
});
test('successful login sets a host-only secure HttpOnly cookie and opens the application',async()=>{
 const response=await worker.fetch(login(),env);assert.equal(response.status,200);
 const cookie=response.headers.get('Set-Cookie');for(const flag of ['__Host-trendai_session=','HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=28800'])assert.ok(cookie.includes(flag));assert.equal(cookie.includes(password),false);assert.equal(/Domain=/i.test(cookie),false);
 const page=await worker.fetch(new Request(origin+'/',{headers:{Cookie:cookieOf(response)}}),env);assert.equal(page.status,200);assert.equal(await page.text(),'/');
 const health=await worker.fetch(new Request(origin+'/api/health',{headers:{Cookie:cookieOf(response)}}),env);assert.equal(health.status,200);
});
test('tampered, expired, cross-host and rotated-secret sessions are rejected',async()=>{
 const issued=await worker.fetch(login(),env);const cookie=cookieOf(issued);
 const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)-1,aud:'demo.test'})).toString('base64url');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.sessionKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');
 for(const bad of [cookie+'x','__Host-trendai_session='+payload+'.'+sig,'__Host-trendai_session=garbage'])assert.equal((await worker.fetch(new Request(origin+'/api/health',{headers:{Cookie:bad}}),env)).status,401);
 assert.equal((await worker.fetch(new Request('https://other.test/api/health',{headers:{Cookie:cookie}}),env)).status,401);
 const changed={...env,APP_AUTH_SECRET:JSON.stringify({...config,sessionKey:'rotated-signing-key-long-enough-for-test'})};assert.equal((await worker.fetch(new Request(origin+'/api/health',{headers:{Cookie:cookie}}),changed)).status,401);
});
test('auth endpoints enforce method and exact origin',async()=>{
 assert.equal((await worker.fetch(new Request(origin+'/api/login'),env)).status,405);
 assert.equal((await worker.fetch(login(password,{Origin:'https://evil.test'}),env)).status,403);
 assert.equal((await worker.fetch(new Request(origin+'/api/logout',{method:'POST',headers:{Origin:'https://evil.test'}}),env)).status,403);
});
test('oversized or invalid login requests never issue cookies',async()=>{
 for(const body of ['{','x'.repeat(3000),JSON.stringify({password:12})]){
  const response=await worker.fetch(new Request(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body}),env);assert.equal(response.status,400);assert.equal(response.headers.has('Set-Cookie'),false);
 }
});
test('repeated invalid passwords are throttled',async()=>{
 const ip=crypto.randomUUID();for(let i=0;i<10;i++)assert.equal((await worker.fetch(login('wrong',{'CF-Connecting-IP':ip}),env)).status,401);
 const response=await worker.fetch(login(password,{'CF-Connecting-IP':ip}),env);assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
});
test('logout expires the session cookie',async()=>{
 const response=await worker.fetch(new Request(origin+'/api/logout',{method:'POST',headers:{Origin:origin}}),env);assert.equal(response.status,200);assert.ok(response.headers.get('Set-Cookie').includes('Max-Age=0'));
});
