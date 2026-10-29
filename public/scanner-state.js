/* Shared scan lifecycle semantics. Connection failures never mean a scan failed. */
const ScannerState=Object.freeze({
  isActive(job){return !!job&&['starting','queued','running','finishing'].includes(job.status);},
  label(status){return ({starting:'Starting scan',queued:'Queued',running:'In progress',finishing:'Finalizing results',completed:'Completed',partial:'Partially completed',failed:'Scan failed'})[status]||'Checking status';},
  hint(status){return ({starting:'Sending your request to GitHub Actions…',queued:'Waiting for a GitHub Actions runner.',running:'The scan is running in GitHub Actions.',finishing:'Scan finished. Receiving the report…',completed:'Your report is ready.',partial:'Review the report for completed phases and remaining coverage.',failed:'Open GitHub Actions for details.'})[status]||'Checking GitHub Actions…';},
  merge(previous,incoming){if(previous?.id!==incoming.id)return incoming;if(['completed','partial','failed'].includes(previous.status))return previous;const order={queued:0,running:1,finishing:2,completed:3,partial:3,failed:3};if((order[incoming.status]??-1)<(order[previous.status]??-1))return {...incoming,status:previous.status};return incoming;}
});
