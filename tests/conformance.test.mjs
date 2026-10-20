import {test} from 'node:test'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import formats from 'ajv-formats'
import {service,search,profileUrl,options} from './fixtures.mjs'
import {discovery,serverCard,apiCatalog,openapi} from '../src/lib/discovery.ts'
import {VERSION,errorResponse} from '../src/lib/types.ts'
const ajv=new Ajv2020({strict:false,allErrors:true});formats(ajv)
function walk(dir){for(const n of readdirSync(dir,{withFileTypes:true})){const p=join(dir,n.name);if(n.isDirectory())walk(p);else if(n.name.endsWith('.json'))ajv.addSchema(JSON.parse(readFileSync(p,'utf8')))}}walk('spec/schemas')
function valid(ref,data){const v=ajv.compile({$ref:ref});assert(v(data),JSON.stringify(v.errors))}
test('catalogue search/lookup/detail and business discovery match pinned official UCP schemas',async()=>{
 const base=`https://ucp.dev/${VERSION}/schemas/`
 valid(base+'ucp.json#/$defs/business_schema',discovery(options).ucp)
 valid(base+'shopping/catalog_search.json#/$defs/search_response',await service().execute('search_catalog',search,profileUrl))
 valid(base+'shopping/catalog_lookup.json#/$defs/lookup_response',await service().execute('lookup_catalog',{ids:['a','v_b']},profileUrl))
 valid(base+'shopping/catalog_lookup.json#/$defs/get_product_response',await service().execute('get_product',{id:'a'},profileUrl))
 valid(base+'common/types/error_response.json',errorResponse(404,'Product not found'))
})
test('MCP server card schema, advertised operations and zero payment capabilities',()=>{
 const schema=JSON.parse(readFileSync('spec/server-card.schema.json'));const validate=ajv.compile({...schema,$ref:'#/$defs/ServerCard'});assert(validate(serverCard(options)),JSON.stringify(validate.errors))
 const p=discovery(options);assert.deepEqual(p.ucp.payment_handlers,{});assert.equal(Object.keys(p.ucp.capabilities).length,2);assert(!JSON.stringify(p).includes('checkout'))
 assert.deepEqual(Object.keys(openapi(options).paths),['/catalog/search','/catalog/lookup','/catalog/product']);assert(apiCatalog(options).linkset[0]['service-desc'][0].href.endsWith('/ucp/openapi.json'))
})

test('vendored upstream schema fixtures match their recorded SHA256 values',()=>{
 const manifest=JSON.parse(readFileSync('spec/manifest.json'));for(const [file,record] of Object.entries(manifest.files)){assert.equal(createHash('sha256').update(readFileSync('spec/'+file)).digest('hex'),record.sha256,file)}
})
