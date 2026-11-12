// Read-only logical storyboards. Configuration and telemetry are separate from request traffic.
// The configuration arrow is a management relationship, not a claim about a per-request
// console lookup, push/poll protocol, cache, or the location of the guardrail detection engine.
export const catalog = [
 {id:'overview',name:'Overview'},
 {id:'access',name:'Access Control'},
 {id:'guardrails',name:'Guardrails'},
 {id:'routing',name:'Routing Rules'},
];
export const topology = {
 'browser-compute':['browser','compute'], 'agent-compute':['agent','compute'],
 'agent-model':['agent','model'], 'compute-gateway':['compute','gateway'],
 'gateway-model':['gateway','model'], 'gateway-tools':['gateway','tools'],
 'gateway-primary':['gateway','primary'], 'gateway-backup':['gateway','backup'],
 'direct-model':['compute','model'], 'direct-tools':['compute','tools'],
 'direct-primary':['compute','primary'],
 'vision-config':['vision','gateway'], 'gateway-events':['gateway','vision'],
};
const forward=(...ids)=>ids.map(id=>({id}));
const reverse=(...ids)=>ids.map(id=>({id,reverse:true}));
const step=(title,nodes=[],edges=[],extra={})=>({title,nodes,edges,phase:'Request',...extra});
const config=()=>step('Policies configured in Vision One',['vision','gateway'],forward('vision-config'),{phase:'Configuration · Logical management flow'});
const events=()=>step('Gateway events → Vision One',['gateway','vision'],forward('gateway-events'),{phase:'Telemetry · Out of band'});
const checks=()=>step('Access Control → Routing Rules → Guardrails',['gateway'],[],{tag:'Evaluate',controls:'Applicable request controls'});
const reply=(title,nodes,edges,extra={})=>step(title,nodes,edges,{phase:'Response',...extra});
function detailedFlow(kind='overview',mode='with',agent='guided') {
 if(!catalog.some(c=>c.id===kind)||!['with','without'].includes(mode)||!['guided','agent'].includes(agent))throw new Error('Unknown architecture walkthrough');
 const guarded=mode==='with', via=guarded?'compute-gateway':null;
 const start=guarded?[config()]:[];
 if(kind==='overview') {
  if(guarded)return [...start,
   step('Browser → App → Gateway',['browser','compute','gateway'],forward('browser-compute',via)),
   checks(),
   step('Gateway → Model',['gateway','model'],forward('gateway-model')),
   reply('Model → Gateway → App → Browser',['model','gateway','compute','browser'],reverse('gateway-model',via,'browser-compute')),
   step('AI Agent → App → Gateway',['agent','compute','gateway'],forward('agent-compute',via)),
   step('Gateway checks MCP tool access',['gateway'],[],{tag:'Allow',controls:'Access Control · MCP tool'}),
   step('Gateway → Tools / Data',['gateway','tools'],forward('gateway-tools')),
   reply('Tool result → Gateway → App → AI Agent',['tools','gateway','compute','agent'],reverse('gateway-tools',via,'agent-compute')),
   events(),
  ];
  return [
   step('Browser → App → Model',['browser','compute','model'],forward('browser-compute','direct-model')),
   reply('Model → App → Browser',['model','compute','browser'],reverse('direct-model','browser-compute')),
   step('AI Agent → App → Tools / Data',['agent','compute','tools'],forward('agent-compute','direct-tools')),
   reply('Tool result → App → AI Agent',['tools','compute','agent'],reverse('direct-tools','agent-compute')),
  ];
 }
 if(kind==='access') {
  const live=agent==='agent', source=live?'agent':'browser', sourceEdge=live?'agent-compute':'browser-compute';
  const begin=live?[
   step('Browser → App → AI Agent',['browser','compute','agent'],[...forward('browser-compute'),...reverse('agent-compute')]),
   step('AI Agent → Workers AI',['agent','model'],forward('agent-model')),
   reply('Workers AI → Tool proposal',['model','agent'],reverse('agent-model'),{tag:'Propose'}),
  ]:[];
  const route=guarded?['compute-gateway','gateway-tools']:['direct-tools'];
  return [...start,...begin,
   step(live?'Agent → App validates → '+(guarded?'Gateway':'Tools'):'Browser → App → '+(guarded?'Gateway':'Tools'),[source,'compute',...(guarded?['gateway']:['tools'])],forward(sourceEdge,...(guarded?[via]:['direct-tools'])),{badge:'get_status · Read-only tool',controls:live?'App validates the proposal':undefined}),
   ...(guarded?[
    step('Gateway allows the read-only tool',['gateway'],[],{tag:'Allow',controls:'Access Control · get_status'}),
    step('Gateway → MCP tool',['gateway','tools'],forward('gateway-tools')),
   ]:[]),
   reply('Tool result → '+(guarded?'Gateway → ':'')+'App → '+(live?'AI Agent':'Browser'),['tools',...(guarded?['gateway']:[]),'compute',source],reverse(...route.toReversed(),sourceEdge)),
   ...(live?[
    reply('AI Agent → App → Browser',['agent','compute','browser'],[...forward('agent-compute'),...reverse('browser-compute')]),
    step('Next task → App → AI Agent',['browser','compute','agent'],[...forward('browser-compute'),...reverse('agent-compute')]),
    step('AI Agent → Workers AI',['agent','model'],forward('agent-model')),
    reply('Workers AI → Restricted tool proposal',['model','agent'],reverse('agent-model'),{tag:'Propose'}),
   ]:[]),
   step('Restricted tool request → '+(guarded?'Gateway':'Tools'),[source,'compute',guarded?'gateway':'tools'],forward(sourceEdge,...(guarded?[via]:['direct-tools'])),{badge:'pay_invoice / delete_volume · Restricted tools'}),
   ...(guarded?[
    step('Gateway denies the restricted tool',['gateway','tools'],[],{tag:'Deny',stopped:'tools',controls:'Access Control · Tool not invoked'}),
    reply('Deny → App → '+(live?'AI Agent':'Browser'),['gateway','compute',source],reverse(via,sourceEdge),{tag:'Deny'}),
   ]:[
    step('Tool executes in the demo sandbox',['tools'],[],{tag:'Demo action'}),
    reply('Tool result → App → '+(live?'AI Agent':'Browser'),['tools','compute',source],reverse('direct-tools',sourceEdge)),
   ]),
   ...(live?[reply('AI Agent → App → Browser',['agent','compute','browser'],[...forward('agent-compute'),...reverse('browser-compute')])]:[]),
   ...(guarded?[events()]:[]),
  ];
 }
 if(kind==='guardrails') {
  if(!guarded)return [
   step('Browser → App → Model',['browser','compute','model'],forward('browser-compute','direct-model'),{badge:'Original prompt · Synthetic sensitive data'}),
   reply('Model → App → Browser',['model','compute','browser'],reverse('direct-model','browser-compute'),{tag:'Answer'}),
   step('Untrusted content → App → Model',['browser','compute','model'],forward('browser-compute','direct-model')),
   reply('Model response → App → Browser',['model','compute','browser'],reverse('direct-model','browser-compute'),{badge:'The model may still refuse'}),
  ];
  return [...start,
   step('Browser → App → Gateway',['browser','compute','gateway'],forward('browser-compute',via)),checks(),
   step('Sensitive data redacted by policy',['gateway'],[],{tag:'Redact',badge:'4111 … 1111 → [REDACTED]',controls:'Request inspection'}),
   step('Redacted prompt → Model',['gateway','model'],forward('gateway-model')),
   reply('Model response → Gateway',['model','gateway'],reverse('gateway-model')),
   reply('Response checked against assigned policy',['gateway'],[],{tag:'Allow',controls:'Response inspection'}),
   reply('Gateway → App → Browser',['gateway','compute','browser'],reverse(via,'browser-compute'),{tag:'Answer'}),
   step('Untrusted content → App → Gateway',['browser','compute','gateway'],forward('browser-compute',via)),
   step('Prompt attack denied by policy',['gateway','model'],[],{tag:'Deny',stopped:'model',controls:'Model not invoked'}),
   reply('Deny → App → Browser',['gateway','compute','browser'],reverse(via,'browser-compute'),{tag:'Deny'}),events(),
  ];
 }
 // Routing Rules: controlled primary failure, then the actual Gateway fallback path.
 return [...start,
  step('Browser → App → '+(guarded?'Gateway':'Primary'),['browser','compute',guarded?'gateway':'primary'],forward('browser-compute',guarded?via:'direct-primary')),
  ...(guarded?[checks(),step('Gateway → Primary',['gateway','primary'],forward('gateway-primary'))]:[]),
  reply('Primary → HTTP 503',[guarded?'gateway':'compute','primary'],reverse(guarded?'gateway-primary':'direct-primary'),{tag:'503'}),
  ...(guarded?[
   step('Routing rule selects Backup',['gateway'],[],{tag:'Fallback',controls:'Configured fallback condition matched'}),
   step('Gateway → Backup',['gateway','backup'],forward('gateway-backup')),
   reply('Backup → Gateway → App → Browser',['backup','gateway','compute','browser'],reverse('gateway-backup',via,'browser-compute'),{tag:'Answer'}),events(),
  ]:[reply('Error → App → Browser',['compute','browser'],reverse('browser-compute'),{tag:'503'})]),
 ];
}
// One presenter click can contain several ordered animation beats. No flow edges
// are dropped or reordered when shortening the presentation.
export const unpackFlow=steps=>steps.flatMap(s=>s.beats??[s]);
export function buildFlow(kind='overview',mode='with',agent='guided') {
 const detail=detailedFlow(kind,mode,agent);
 const group=(title,beats,phase)=>({title,phase:phase??beats[0].phase,beats});
 if(kind==='overview')return mode==='with'?[
  group('Configure policies',detail.slice(0,1)),
  group('Browser request → Gateway → Model',detail.slice(1,4)),
  group('Model response → Browser',detail.slice(4,5)),
  group('Agent request → Gateway → Tools',detail.slice(5,8)),
  group('Tool result → AI Agent',detail.slice(8,9)),
  group('View Gateway events',detail.slice(9)),
 ]:detail.map(s=>group(s.title,[s]));
 if(kind==='access') {
  const configured=mode==='with'?1:0;
  const restricted=detail.findIndex(s=>s.title.startsWith('Restricted tool request'));
  const nextTask=detail.findIndex(s=>s.title.startsWith('Next task'));
  const firstReturn=agent==='agent'?nextTask:restricted;
  if(mode==='with') {
   const deny=detail.findIndex(s=>s.stopped==='tools');
   return [
    group('Configure access rules',detail.slice(0,configured)),
    group('Read-only tool allowed · Result returned',detail.slice(configured,firstReturn),'Request / response'),
    group('Submit a restricted tool request',detail.slice(firstReturn,deny)),
    group('Gateway denies the restricted tool',detail.slice(deny,deny+1)),
    group('Return the denial to the caller',detail.slice(deny+1,-1),'Response'),
    group('View Gateway events',detail.slice(-1)),
   ];
  }
  const readReturn=detail.findIndex(s=>s.phase==='Response'&&s.edges.some(e=>e.id==='direct-tools'));
  const action=detail.findIndex(s=>s.tag==='Demo action');
  return [
   group('Submit the read-only request',detail.slice(0,readReturn)),
   group('Return the tool result',detail.slice(readReturn,firstReturn),'Response'),
   group('Restricted tool executes without Gateway',detail.slice(firstReturn,action+1)),
   group('Return the sandbox result',detail.slice(action+1),'Response'),
  ];
 }
 if(kind==='guardrails')return mode==='with'?[
  group('Configure guardrail policies',detail.slice(0,1)),
  group('Inspect and redact before inference',detail.slice(1,5)),
  group('Inspect response · Return to Browser',detail.slice(5,8),'Response'),
  group('Submit untrusted content',detail.slice(8,9)),
  group('Block the prompt · Return the denial',detail.slice(9,11),'Request / response'),
  group('View Gateway events',detail.slice(11)),
 ]:detail.map(s=>group(s.title,[s]));
 if(mode==='with')return [
  group('Configure routing rules',detail.slice(0,1)),
  group('Send the request to Primary',detail.slice(1,4)),
  group('Primary returns HTTP 503',detail.slice(4,5),'Response'),
  group('Gateway routes to Backup',detail.slice(5,7)),
  group('Backup answer → Browser',detail.slice(7,8),'Response'),
  group('View Gateway events',detail.slice(8)),
 ];
 const request=detail[0];
 return [
  group('Browser → App',[{...request,nodes:['browser','compute'],edges:forward('browser-compute')}]),
  group('App → Primary',[{...request,nodes:['compute','primary'],edges:forward('direct-primary')}]),
  group('Primary returns HTTP 503',detail.slice(1,2),'Response'),
  group('Return the error to Browser',detail.slice(2),'Response'),
 ];
}
export function visibleEdges(kind,mode,agent) {return new Set(unpackFlow(buildFlow(kind,mode,agent)).flatMap(s=>s.edges.map(e=>e.id)));}
