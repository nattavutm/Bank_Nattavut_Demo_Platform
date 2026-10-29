import {createHmac} from 'node:crypto';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {buildScanPlan,mergeReports,policy,toYaml} from './scanner-plan.mjs';
import {spawn} from 'node:child_process';
const origin='https://demo.nattavut.online', id=process.env.SCAN_JOB_ID;
if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid job ID');
const token=scope=>createHmac('sha256',process.env.SCANNER_SERVICE_KEY).update(scope).digest('hex');
console.log('::add-mask::'+token('target'));
console.log('::add-mask::'+token('job:'+id));
const endpoint=origin+'/api/scanner/jobs/'+id+'/runner';
const headers={Authorization:'Bearer '+token('job:'+id),'Content-Type':'application/json'};
async function request(method,data){const response=await fetch(endpoint,{method,headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Scanner callback HTTP '+response.status);return response.json();}
async function update(data){for(let i=0;i<4;i++)try{return await request('POST',{...data,runId:Number(process.env.GITHUB_RUN_ID)});}catch(error){if(i===3)throw error;await new Promise(r=>setTimeout(r,3000*(i+1)));}}
await mkdir('scan-output',{recursive:true});
let status='failed',error,report;
try {
 const job=await request('GET');
 const url=new URL(job.target);
 const builtIn=url.origin===origin&&['/api/scanner/target','/api/scanner/target/guard'].includes(url.pathname);
 const approved=(process.env.SCANNER_ALLOWED_ENDPOINTS||'').split(',').map(v=>v.trim()).includes(job.target);
 if((!builtIn&&!approved)||url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Target is not approved for this runner');
 await update({status:'running'});
 if(builtIn)process.env.TARGET_API_KEY=token('target');
 process.env.TREND_AI_KEY=process.env.TMAS_API_KEY;
 const phases=buildScanPlan(job),reports=[];
 const began=Date.now();
 for(let index=0;index<phases.length;index++){
  const phase=phases[index],dir='scan-output/phase-'+(index+1);
  const remaining=Math.floor(policy.budgetMinutes-(Date.now()-began)/60000);
  if(remaining<1){error='Scan time budget exhausted before every phase completed.';break;}
  await mkdir(dir,{recursive:true});
  for(const [name,data] of Object.entries(phase.files))await writeFile(dir+'/'+name,toYaml(data));
  phase.config.settings.max_scan_duration_minutes=remaining;
  phase.config.output=[{visionone:{enabled:true}},{local:{format:'json',filename:dir+'/report.json',chat_history:true}},{local:{format:'html',filename:dir+'/report.html',chat_history:true}}];
  await writeFile(dir+'/config.yaml',toYaml(phase.config));
  await update({status:'running',progress:{phase:index+1,phaseCount:phases.length,name:phase.name,completedTests:reports.reduce((n,r)=>n+(r.results?.length||0),0)}});
  console.log('TMAS phase '+(index+1)+'/'+phases.length+': '+phase.name);
  const code=await new Promise((resolve,reject)=>{const child=spawn('./tmas',['aiscan','llm','-c',dir+'/config.yaml','-r','us-east-1','-y'],{stdio:'inherit',env:process.env});child.on('error',reject);child.on('exit',resolve);});
  let phaseReport;try{phaseReport=JSON.parse(await readFile(dir+'/report.json','utf8'));reports.push(phaseReport);}catch{}
  if(code!==0||!phaseReport){error='TMAS phase '+(index+1)+' did not complete (exit '+code+'). See GitHub Actions.';break;}
  if(phaseReport.lifecycle?.status&&phaseReport.lifecycle.status!=='completed'){error='TMAS returned a partial phase. See the report for coverage.';break;}
 }
 report=mergeReports(reports,phases);
 if(error||reports.length<phases.length){status=reports.length?'partial':'failed';}else status='completed';
 report.lifecycle={status};
 await writeFile('scan-output/report.json',JSON.stringify(report,null,2));

}catch(e){error=e.message;console.error(error);}
await writeFile('scan-output/status.json',JSON.stringify({status,error}));
// Limit callback size; full reports are retained in the authenticated GitHub artifact.
if(report&&Buffer.byteLength(JSON.stringify(report))>1300000){report={...report,notice:'Showing the first 50 results. Download the Actions artifact for the complete report.',results:report.results.slice(0,50)};if(Buffer.byteLength(JSON.stringify(report))>1300000)report={summary:report.summary,notice:'Report exceeds the web display limit. Download the complete Actions artifact.',results:[]};}
await update({status,error,report});
if(status!=='completed')process.exitCode=1;
