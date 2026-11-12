// Explanatory flows only. These definitions never submit a live request.
export const cases = {
 email:{type:'llm',title:'Email prompt injection inspection',source:'Email Summary App',sourceIcon:'app',sourceNote:'Untrusted email content',normalLabel:'Normal email',attackLabel:'Hidden instructions',policy:'Request inspection',normalTarget:'LLM',attackTarget:'LLM',normalModel:'Summarize the email',attackModel:'Hidden instruction attempt',blocked:'Gateway rejects the hidden-instruction request before model invocation.',unprotected:'The model receives the email. Its actual response may comply or refuse.',allowed:'The normal email reaches the model and a summary returns to the app.'},
 models:{type:'llm',title:'Model access by application identity',source:'Rebel Helpdesk',sourceIcon:'app',sourceNote:'Application identity',authorizedSource:'Jedi Operations',normalLabel:'Approved model',attackLabel:'Restricted model',authorizedLabel:'Authorized app',policy:'Model access control',normalTarget:'Standard model',attackTarget:'Restricted model',normalModel:'r5r5-standard',attackModel:'r5r5-restricted',blocked:'Helpdesk access to the Restricted model is denied before inference.',unprotected:'The direct route reaches the requested model without Gateway access control.',allowed:'Helpdesk can invoke the Standard model.',authorizedAllowed:'Operations can invoke the same Restricted model.'},
 invoice: {title:'Invoice payment access control',source:'AI Agent',sourceIcon:'agent',sourceNote:'via Tool Dispatcher',target:'MCP tools',targetIcon:'tools',ledger:'Invoice ledger',ledgerIcon:'invoice',normal:'read_invoice',attack:'pay_invoice',normalLabel:'Review invoice',attackLabel:'Attempt payment',initial:'Unpaid · THB 1,000,000',changed:'Paid · THB 520,000',blocked:'Payment denied. The invoice ledger stays unchanged.',unprotected:'The payment tool records THB 480,000 in the demo ledger.',allowed:'Invoice details return to the agent. No payment is made.'},
 database: {title:'Database tool access control',source:'AI Agent',sourceIcon:'agent',sourceNote:'via Tool Dispatcher',target:'MCP tools',targetIcon:'tools',ledger:'Rebel ledger',ledgerIcon:'database',normal:'get_status',attack:'delete_volume',normalLabel:'Check status',attackLabel:'Attempt deletion',initial:'Online',changed:'Offline',blocked:'Deletion denied. The demo database stays Online.',unprotected:'The deletion tool changes the demo database to Offline.',allowed:'Database status returns to the agent. The database stays Online.'},
 fallback: {title:'Model fallback routing',source:'AI Application',sourceIcon:'app',sourceNote:'Requests r5r5-continuity',normalLabel:'Normal request',attackLabel:'Primary failure',initial:'Primary ready',blocked:'Primary returns 503. Gateway routes to Backup and returns its answer.',unprotected:'Primary returns 503. The application receives an error.',allowed:'Primary answers. The response returns to the application.'},
};
export function flowPlan(kind,mode,scenario){
 if(!cases[kind]||!['with','without'].includes(mode)||!['normal','attack',...(kind==='models'?['authorized']:[])].includes(scenario))throw new Error('Unknown illustration flow');
 const withGateway=mode==='with',failure=scenario==='attack',plan=[];
 const move=(route,reverse=false)=>plan.push({route,reverse});
 const hold=(effect)=>plan.push({effect});
 if(withGateway)move('source-gateway');
 if(cases[kind].type==='llm'){
  if(withGateway&&failure){hold('deny');move('source-gateway',true);}
  else{if(withGateway)hold('allow');const path=withGateway?'gateway-model':'source-model';move(path);hold('answer');move(path,true);if(withGateway)move('source-gateway',true);}
 }else if(kind==='fallback'){
  const primary=withGateway?'gateway-primary':'source-primary';
  move(primary);hold(failure?'primary-error':'primary-answer');move(primary,true);
  if(failure&&withGateway){hold('fallback');move('gateway-backup');hold('backup-answer');move('gateway-backup',true);}
  if(withGateway)move('source-gateway',true);
 }else if(withGateway&&failure){hold('deny');move('source-gateway',true);}
 else{
  if(withGateway)hold('allow');
  const tool=withGateway?'gateway-tool':'source-tool';move(tool);move('tool-ledger');hold(failure?'commit':'read');move('tool-ledger',true);move(tool,true);
  if(withGateway)move('source-gateway',true);
 }
 hold('done');return plan;
}
