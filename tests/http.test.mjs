import {test} from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {CatalogHttp} from '../src/lib/http.ts'
import {service,options,search,profileUrl,profile} from './fixtures.mjs'

function app(){const a=express();a.use(express.json({limit:'64kb'}));const h=new CatalogHttp(service());a.locals.ucp=h;
 for(const [path,kind] of Object.entries({'/ucp/catalog/search':'search_catalog','/ucp/catalog/lookup':'lookup_catalog','/ucp/catalog/product':'get_product','/ucp/profile':'profile','/ucp/mcp/server-card':'server-card','/ucp/mcp':'mcp'}))a.all(path,(req,res)=>h.handle(req,res,kind));return a}
const headers={'UCP-Agent':`profile="${profileUrl}"`,'Request-Id':'f078fba8-49e0-4f91-bd20-431c92494bbf'}
test('REST requires standard headers, serves only read operations and has safe error envelopes',async()=>{
 const a=app();assert.equal((await request(a).get('/ucp/profile')).body.ucp.payment_handlers.constructor,Object)
 let r=await request(a).post('/ucp/catalog/search').set(headers).send(search);assert.equal(r.status,200);assert.equal(r.body.products.length,2)
 r=await request(a).post('/ucp/catalog/search').set(headers).set('Accept-Language','*').send(search);assert.equal(r.status,200)
 r=await request(a).options('/ucp/catalog/search').set('Origin','https://shop.example');assert.equal(r.status,204);assert.equal(r.headers['access-control-allow-origin'],'https://shop.example')
 r=await request(a).post('/ucp/catalog/search').send(search);assert.equal(r.status,400);assert.equal(r.body.ucp.status,'error')
 r=await request(a).post('/ucp/catalog/search').set(headers).set('Origin','https://evil.example').send(search);assert.equal(r.status,403)
 r=await request(a).post('/ucp/catalog/product').set(headers).send({id:'draft'});assert.equal(r.status,404);assert.equal(r.body.messages[0].code,'not_found')
 assert.equal((await request(a).post('/ucp/checkout-sessions').send({})).status,404)
})
test('official MCP client initializes, lists exactly three read-only tools and performs catalogue calls',async()=>{
 const a=app();const server=await new Promise(resolve=>{const s=a.listen(0,'127.0.0.1',()=>resolve(s))});const port=server.address().port
 a.locals.ucp.service.options.apiUrl=`http://127.0.0.1:${port}`
 a.locals.ucp.service.options.allowJsonOnlyMcp=true
 const transport=new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/ucp/mcp`))
 const client=new Client({name:'fixture-agent',version:'1.0.0'})
 try{
  await client.connect(transport)
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),['get_product','lookup_catalog','search_catalog'])
  assert(tools.tools.every(t=>t.annotations.readOnlyHint));assert(!tools.tools.some(t=>/pay|checkout|cart/.test(t.name)))
  const result=await client.callTool({name:'search_catalog',arguments:{meta:{'ucp-agent':{profile:profileUrl}},catalog:search}})
  assert.equal(result.isError,undefined);assert.equal(result.structuredContent.products.length,2)
  const bad=await client.callTool({name:'search_catalog',arguments:{catalog:search}});assert.equal(bad.isError,true)
  const missing=await client.callTool({name:'get_product',arguments:{meta:{'ucp-agent':{profile:profileUrl}},catalog:{id:'private'}}});assert.equal(missing.structuredContent.ucp.status,'error')
 }finally{await client.close();await transport.close();await new Promise(resolve=>server.close(resolve))}
})

test('opt-in JSON-only compatibility returns JSON, coalesces warnings and preserves validation',async t=>{
 const a=app(),warnings=t.mock.method(console,'warn',()=>{})
 const body={jsonrpc:'2.0',id:1,method:'tools/list'}
 const send=accept=>request(a).post('/ucp/mcp').set('Host','shop.example').set('Accept',accept).send(body)
 assert.equal((await send('application/json')).status,406)
 assert.equal(warnings.mock.callCount(),0)
 a.locals.ucp.service.options.allowJsonOnlyMcp=true
 let r=await send('application/json');assert.equal(r.status,200);assert.match(r.headers['content-type'],/^application\/json/)
 assert.equal(r.body.id,1);assert.deepEqual(r.body.result.tools.map(t=>t.name).sort(),['get_product','lookup_catalog','search_catalog'])
 assert.equal(warnings.mock.callCount(),1)
 const warning=JSON.parse(warnings.mock.calls[0].arguments[0]);assert.equal(warning.code,'UCP_MCP_JSON_ONLY_ACCEPT');assert.equal(warning.suppressed_requests,0)
 assert(!JSON.stringify(warning).includes('shop.example'))
 assert.equal((await send('application/json; q=0.8')).status,200);assert.equal(warnings.mock.callCount(),1)
 for(const accept of ['application/json;q=0','application/json;q=0.000','*/*','text/html','application/json, text/html'])assert.equal((await send(accept)).status,406,accept)
 r=await request(a).post('/ucp/mcp').set('Host','evil.example').set('Accept','application/json').send(body);assert.equal(r.status,403)
 r=await request(a).post('/ucp/mcp').set('Host','shop.example').set('Origin','https://evil.example').set('Accept','application/json').send(body);assert.equal(r.status,403)
 r=await request(a).post('/ucp/mcp').set('Host','shop.example').set('Accept','application/json').send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'search_catalog',arguments:{catalog:search}}});assert.equal(r.status,200);assert(r.body.result.isError)
 r=await request(a).post('/ucp/mcp').set('Host','shop.example').set('Accept','application/json').send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'search_catalog',arguments:{meta:{'ucp-agent':{profile:profileUrl}},catalog:search}}});assert.equal(r.status,200);assert.equal(r.body.result.structuredContent.products.length,2)
})
