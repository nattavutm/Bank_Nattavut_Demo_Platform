// Explanatory flows only. These definitions never submit a live request.
export const cases = {
 invoice: {title:'Invoice payment access control',source:'AI Agent',sourceIcon:'agent',sourceNote:'via Tool Dispatcher',target:'MCP tools',targetIcon:'tools',ledger:'Invoice ledger',ledgerIcon:'invoice',normal:'read_invoice',attack:'pay_invoice',normalLabel:'Review invoice',attackLabel:'Attempt payment',initial:'Unpaid · THB 1,000,000',changed:'Paid · THB 520,000',blocked:'Payment denied. The invoice ledger stays unchanged.',unprotected:'The payment tool records THB 480,000 in the demo ledger.',allowed:'Invoice details return to the agent. No payment is made.'},
 database: {title:'Database tool access control',source:'AI Agent',sourceIcon:'agent',sourceNote:'via Tool Dispatcher',target:'MCP tools',targetIcon:'tools',ledger:'Rebel ledger',ledgerIcon:'database',normal:'get_status',attack:'delete_volume',normalLabel:'Check status',attackLabel:'Attempt deletion',initial:'Online',changed:'Offline',blocked:'Deletion denied. The demo database stays Online.',unprotected:'The deletion tool changes the demo database to Offline.',allowed:'Database status returns to the agent. The database stays Online.'},
 fallback: {title:'Model fallback routing',source:'AI Application',sourceIcon:'app',sourceNote:'Requests r5r5-continuity',normalLabel:'Normal request',attackLabel:'Primary failure',initial:'Primary ready',blocked:'Primary returns 503. Gateway routes to Backup and returns its answer.',unprotected:'Primary returns 503. The application receives an error.',allowed:'Primary answers. The response returns to the application.'},
};
export function flowPlan(kind,mode,scenario){
 if(!cases[kind]||!['with','without'].includes(mode)||!['normal','attack'].includes(scenario))throw new Error('Unknown illustration flow');
 const withGateway=mode==='with',failure=scenario==='attack',plan=[];
 const move=(route,reverse=false)=>plan.push({route,reverse});
 const hold=(effect)=>plan.push({effect});
 if(withGateway)move('source-gateway');
 if(kind==='fallback'){
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
