const form=document.getElementById('login-form');
const password=document.getElementById('password');
const error=document.getElementById('login-error');
const toggle=document.getElementById('toggle-password');
const submit=form.querySelector('[type=submit]');
let pending=false;
toggle.addEventListener('click',()=>{const visible=password.type==='password';password.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',visible?'Hide password':'Show password');});
password.addEventListener('input',()=>{error.textContent='';password.removeAttribute('aria-invalid');});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(pending||!password.value)return;
  pending=true;error.textContent='';submit.disabled=true;password.disabled=true;toggle.disabled=true;form.setAttribute('aria-busy','true');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password.value}),signal:controller.signal});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Unable to sign in. Please try again.');
    if(!data.authenticated)throw new Error('Unable to sign in. Please try again.');
    password.value='';location.replace('/'+(location.hash||'#chat'));
  }catch(failure){error.textContent=failure.name==='AbortError'?'Sign-in timed out. Please try again.':failure.message;password.setAttribute('aria-invalid','true');password.value='';}
  finally{clearTimeout(timer);pending=false;submit.disabled=false;password.disabled=false;toggle.disabled=false;form.removeAttribute('aria-busy');password.focus();}
});
