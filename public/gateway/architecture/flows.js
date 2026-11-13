// Product-level logical flows, independent of the demonstration's deployment.
// Configuration and Events are management/telemetry relationships, not console
// lookups on every request. This illustration makes no claim about sync transport.
export const catalog=[
 {id:'overview',name:'Overview'}, {id:'access',name:'Access Control'},
 {id:'guardrails',name:'Guardrails'}, {id:'routing',name:'Routing Rules'},
];
export const topology={
 'application-gateway':['application','gateway'],
 'gateway-model':['gateway','model'], 'gateway-tools':['gateway','tools'],
 'gateway-primary':['gateway','primary'], 'gateway-backup':['gateway','backup'],
 'direct-model':['application','model'], 'direct-tools':['application','tools'],
 'direct-primary':['application','primary'],
 'vision-config':['vision','gateway'], 'gateway-events':['gateway','vision'],
};
const f=(...ids)=>ids.map(id=>({id})), r=(...ids)=>ids.map(id=>({id,reverse:true}));
const beat=(title,nodes=[],edges=[],extra={})=>({title,nodes,edges,phase:'Request',...extra});
const response=(title,nodes,edges,extra={})=>beat(title,nodes,edges,{phase:'Response',...extra});
const group=(title,beats,phase)=>({title,phase:phase??beats[0].phase,beats});
const config=title=>group(title,[beat('Policies configured in Vision One',['vision','gateway'],f('vision-config'),{phase:'Configuration · Logical management flow'})]);
const events=()=>group('View Gateway events',[beat('Gateway events → Vision One',['gateway','vision'],f('gateway-events'),{phase:'Telemetry · Out of band'})]);
const evaluate=()=>beat('Evaluate applicable controls',['gateway'],[],{tag:'Evaluate',controls:'Access → Routing → Guardrails'});
export const unpackFlow=steps=>steps.flatMap(s=>s.beats??[s]);
export function buildFlow(kind='overview',mode='with'){
 if(!catalog.some(c=>c.id===kind)||!['with','without'].includes(mode))throw new Error('Unknown architecture walkthrough');
 const withGateway=mode==='with',via='application-gateway';
 if(kind==='overview')return withGateway?[
  config('Configure policies'),
  group('Send a model request',[
   beat('Application / AI Agent → Gateway',['application','gateway'],f(via)),evaluate(),
   beat('Gateway → LLM Provider',['gateway','model'],f('gateway-model')),
  ]),
  group('Return the model response',[
   response('LLM Provider → Gateway → Application / AI Agent',['model','gateway','application'],r('gateway-model',via)),
  ]),
  group('Send an MCP tool call',[
   beat('Application / AI Agent → Gateway',['application','gateway'],f(via)),
   beat('Check identity, action and resource',['gateway'],[],{tag:'Allow',controls:'Access Control · MCP tool'}),
   beat('Gateway → MCP Server',['gateway','tools'],f('gateway-tools')),
  ]),
  group('Return the tool result',[
   response('MCP Server → Gateway → Application / AI Agent',['tools','gateway','application'],r('gateway-tools',via)),
  ]),events(),
 ]:[
  group('Send directly to the LLM Provider',[beat('Application / AI Agent → LLM Provider',['application','model'],f('direct-model'))]),
  group('Return the model response',[response('LLM Provider → Application / AI Agent',['model','application'],r('direct-model'))]),
  group('Call the MCP Server directly',[beat('Application / AI Agent → MCP Server',['application','tools'],f('direct-tools'))]),
  group('Return the tool result',[response('MCP Server → Application / AI Agent',['tools','application'],r('direct-tools'))]),
 ];
 if(kind==='access')return withGateway?[
  config('Configure access rules'),
  group('Allow an approved tool call',[
   beat('Submit an approved tool call',['application','gateway'],f(via),{badge:'get_status · Approved tool'}),
   beat('Identity may call this tool',['gateway'],[],{tag:'Allow',controls:'Identity + action + resource'}),
   beat('Forward the allowed call',['gateway','tools'],f('gateway-tools')),
   response('Return the tool result',['tools','gateway','application'],r('gateway-tools',via)),
  ],'Request / response'),
  group('Submit a restricted tool call',[
   beat('Submit a restricted tool call',['application','gateway'],f(via),{badge:'delete_volume · Restricted tool'}),
  ]),
  group('Gateway denies the restricted tool',[
   beat('Access policy denies this call',['gateway','tools'],[],{tag:'Deny',stopped:'tools',controls:'MCP tool not invoked'}),
  ]),
  group('Return the denial to the caller',[
   response('Gateway → Application / AI Agent',['gateway','application'],r(via),{tag:'Deny'}),
  ]),events(),
 ]:[
  group('Call the approved tool directly',[beat('Send the read-only call',['application','tools'],f('direct-tools'))]),
  group('Return the tool result',[response('Return to the caller',['tools','application'],r('direct-tools'))]),
  group('Call a restricted tool without Gateway',[
   beat('Send the restricted call',['application','tools'],f('direct-tools')),
   beat('The server applies its own controls',['tools'],[],{tag:'No Gateway check',controls:'Server authorization still applies'}),
  ]),
  group('Return the server result',[response('Return to the caller',['tools','application'],r('direct-tools'),{badge:'Outcome depends on the MCP server’s own authorization'})]),
 ];
 if(kind==='guardrails')return withGateway?[
  config('Configure guardrail policies'),
  group('Inspect and redact before inference',[
   beat('Submit content',['application','gateway'],f(via)),evaluate(),
   beat('Redact matching sensitive data',['gateway'],[],{tag:'Redact',badge:'Sensitive value → [REDACTED]',controls:'Request inspection · Assigned policy'}),
   beat('Forward the redacted prompt',['gateway','model'],f('gateway-model')),
  ]),
  group('Inspect and return the response',[
   response('LLM Provider → Gateway',['model','gateway'],r('gateway-model')),
   response('Check against the response policy',['gateway'],[],{tag:'Allow',controls:'Response inspection · Assigned policy'}),
   response('Return allowed content',['gateway','application'],r(via),{tag:'Answer'}),
  ],'Response'),
  group('Submit a prompt attack',[
   beat('Application / AI Agent → Gateway',['application','gateway'],f(via)),
  ]),
  group('Block the prompt and return the denial',[
   beat('Assigned policy denies the prompt',['gateway','model'],[],{tag:'Deny',stopped:'model',controls:'LLM not invoked'}),
   response('Return the denial',['gateway','application'],r(via),{tag:'Deny'}),
  ],'Request / response'),events(),
 ]:[
  group('Send the original content',[beat('Send directly to the LLM Provider',['application','model'],f('direct-model'),{badge:'No Gateway request inspection'})]),
  group('Return the model response',[response('Return directly to the caller',['model','application'],r('direct-model'))]),
  group('Send untrusted content directly',[beat('Application / AI Agent → LLM Provider',['application','model'],f('direct-model'))]),
  group('Return the provider response',[response('Return to the caller',['model','application'],r('direct-model'),{badge:'The provider or application may still refuse'})]),
 ];
 return withGateway?[
  config('Configure routing rules'),
  group('Send the request to Primary',[
   beat('Application / AI Agent → Gateway',['application','gateway'],f(via)),evaluate(),
   beat('Route to the primary provider',['gateway','primary'],f('gateway-primary')),
  ]),
  group('Primary returns an eligible error',[
   response('Primary → Gateway',['primary','gateway'],r('gateway-primary'),{tag:'503',badge:'Illustrative failure · Must match fallback conditions'}),
  ],'Response'),
  group('Gateway routes to Backup',[
   beat('Select the configured fallback alias',['gateway'],[],{tag:'Fallback',controls:'Configured fallback condition matched'}),
   beat('Gateway → Backup',['gateway','backup'],f('gateway-backup')),
  ]),
  group('Return the backup response',[
   response('Backup → Gateway → Application / AI Agent',['backup','gateway','application'],r('gateway-backup',via),{tag:'Answer'}),
  ],'Response'),events(),
 ]:[
  group('Send directly to Primary',[beat('Application / AI Agent → Primary',['application','primary'],f('direct-primary'))]),
  group('Primary fails',[beat('Primary returns an error',['primary'],[],{tag:'503'})]),
  group('Return the error',[response('Primary → Application / AI Agent',['primary','application'],r('direct-primary'))]),
  group('The application handles the error',[response('No Gateway-managed fallback',['application'],[],{tag:'503',badge:'Any application retry or fallback is outside this flow'})]),
 ];
}
export function visibleEdges(kind,mode){return new Set(unpackFlow(buildFlow(kind,mode)).flatMap(b=>b.edges.map(e=>e.id)));}
