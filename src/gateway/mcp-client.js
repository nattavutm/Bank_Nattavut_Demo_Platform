// Bounded Streamable HTTP client. All destinations are supplied by trusted code.
export async function mcpRpc(binding,url,key,method,params,id,session={}) {
 const response=await binding.fetch(url,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(session.id?{'MCP-Session-Id':session.id}:{}),...(session.version?{'MCP-Protocol-Version':session.version}:{})},body:JSON.stringify({jsonrpc:'2.0',...(id===undefined?{}:{id}),method,...(params===undefined?{}:{params})}),redirect:'manual',signal:AbortSignal.timeout(20000)});
 const result={status:response.status,requestId:response.headers.get('x-request-id'),message:null};
 if(response.headers.get('mcp-session-id'))session.id=response.headers.get('mcp-session-id');
 if(id===undefined){await response.body?.cancel();return result;}
 const reader=response.body?.getReader();if(!reader)return result;
 let text='',size=0;const decoder=new TextDecoder();
 try {
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw new Error('MCP response too large');text+=decoder.decode(value,{stream:true});
   if(response.headers.get('content-type')?.includes('text/event-stream')){
    for(const event of text.split(/\r?\n\r?\n/).slice(0,-1)){
     const data=event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
     if(!data)continue;const parsed=JSON.parse(data);if(parsed.id===id){result.message=parsed;return result;}
    }
   }
  }
  text+=decoder.decode();
  try{result.message=JSON.parse(text);}catch{result.message=null;}
  return result;
 }finally{await reader.cancel().catch(()=>{});}
}
