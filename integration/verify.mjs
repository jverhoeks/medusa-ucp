import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
const base=`http://localhost:${Number(process.env.UCP_FIXTURE_PORT || 9003)}`
const state=JSON.parse(readFileSync(new URL('./app/.fixture-state.json',import.meta.url)))
let ready=false
for(let attempt=0;attempt<30;attempt++){
 try{const health=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});if(health.ok){ready=true;break}}catch{}
 await new Promise(resolve=>setTimeout(resolve,1000))
}
assert(ready,'Fixture backend did not become ready')
const profile='https://agent.example/.well-known/ucp'
const headers={'Content-Type':'application/json','Request-Id':randomUUID(),'UCP-Agent':`profile="${profile}"`}
const input={query:'flowers',context:{address_country:'NL',currency:'EUR',intent:'Birthday present around EUR50'},filters:{price:{max:5000}},pagination:{limit:2}}
async function get(path){const r=await fetch(base+path,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,path);return r.json()}
const discovery=await get('/.well-known/ucp');assert.equal(discovery.ucp.version,'2026-08-25');assert.deepEqual(discovery.ucp.payment_handlers,{})
assert.equal((await get('/.well-known/ai-catalog.json')).entries.length,1)
assert((await get('/.well-known/api-catalog')).linkset[0]['service-desc'][0].href.endsWith('/ucp/openapi.json'))
assert.equal(Object.keys((await get('/ucp/openapi.json')).paths).length,3)
const response=await fetch(base+'/ucp/catalog/search',{method:'POST',headers,body:JSON.stringify(input),signal:AbortSignal.timeout(30000)})
assert.equal(response.status,200,await response.clone().text());const results=await response.json();assert.equal(results.products.length,2);assert.deepEqual(results.products.map(p=>p.variants[0].price.amount).sort((a,b)=>a-b),[3500,4500]);assert(!JSON.stringify(results).includes('supplier_cost'));assert(results.products.every(p=>p.variants[0].availability.available))
const detail=await fetch(base+'/ucp/catalog/product',{method:'POST',headers,body:JSON.stringify({id:state.ids[0],selected:[{name:'Size',label:'Small'}]}),signal:AbortSignal.timeout(30000)});assert.equal(detail.status,200,await detail.clone().text())
const variant=results.products[0].variants[0].id
const lookup=await fetch(base+'/ucp/catalog/lookup',{method:'POST',headers,body:JSON.stringify({ids:[variant,'does-not-exist']}),signal:AbortSignal.timeout(30000)});assert.equal(lookup.status,200);const batch=await lookup.json();assert.equal(batch.products.length,1);assert.equal(batch.products[0].variants[0].inputs[0].id,variant)
const legacy=await fetch(base+'/ucp/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:71,method:'tools/list'}),signal:AbortSignal.timeout(10000)})
assert.equal(legacy.status,200);assert.equal((await legacy.json()).result.tools.length,3)
const client=new Client({name:'medusa-real-fixture-agent',version:'1.0.0'});const transport=new StreamableHTTPClientTransport(new URL(base+'/ucp/mcp'))
try{
 await client.connect(transport);const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),['get_product','lookup_catalog','search_catalog'])
 const result=await client.callTool({name:'search_catalog',arguments:{meta:{'ucp-agent':{profile}},catalog:input}});assert.equal(result.structuredContent.products.length,2);assert(!result.isError)
}finally{await client.close();await transport.close()}
console.log('Real Medusa fixture passed: root discovery, REST search/lookup/details, Store API regional prices, privacy and official MCP client; no orders or payments')
