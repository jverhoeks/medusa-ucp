import {test} from 'node:test'
import assert from 'node:assert/strict'
import {service,product,profile,profileUrl,search} from './fixtures.mjs'
import {minorUnits} from '../src/lib/catalog.ts'
import {publicAddress,profileUrl as validateUrl,downloadProfile,negotiate} from '../src/lib/profiles.ts'
import {RateLimiter} from '../src/lib/rate-limit.ts'
import {parseOptions} from '../src/lib/options.ts'
import {SEARCH,VERSION} from '../src/lib/types.ts'
import {options} from './fixtures.mjs'

test('birthday gift request returns two current priced public options under EUR50, never private fields',async()=>{
 const result=await service().execute('search_catalog',search,profileUrl)
 assert.deepEqual(result.products.map(p=>p.id),['a','b']);assert.deepEqual(result.products.map(p=>p.variants[0].price.amount),[3500,4500]);assert.equal(result.products[0].variants[0].availability.available,true)
 assert(!JSON.stringify(result).includes('supplier'));assert(!JSON.stringify(result).includes('wholesale'));assert(!JSON.stringify(result).includes('secret'));assert(!('metadata' in result.products[0]));assert(result.messages[0].content.includes('not included'))
})
test('currency minor units and missing tax-inclusive prices fail closed',async()=>{
 assert.equal(minorUnits(5.95,'EUR'),595);assert.equal(minorUnits(150,'JPY'),150);assert.equal(minorUnits(1.234,'KWD'),1234);assert.equal(minorUnits(NaN,'EUR'),undefined)
 const raw=product('unknown');raw.variants[0].calculated_price.is_calculated_price_tax_inclusive=false
 assert.equal((await service([raw]).execute('search_catalog',{query:'flowers'},profileUrl)).products.length,0)
 raw.variants[0].calculated_price.calculated_amount_with_tax=42.35
 assert.equal((await service([raw]).execute('search_catalog',{query:'flowers'},profileUrl)).products[0].price_range.min.amount,4235)
})
test('filters retain correctly priced variants, categories and honest stock state',async()=>{
 const a=product('a',35);a.variants.push({...a.variants[0],id:'v_large',title:'Large',inventory_quantity:0,options:[{id:'opt_large',option_id:'o_size',value:'Large'}],calculated_price:{...a.variants[0].calculated_price,calculated_amount:60}})
 const result=await service([a]).execute('search_catalog',search,profileUrl);assert.equal(result.products[0].variants.length,1)
 const out=await service([a]).execute('get_product',{id:'v_large'},profileUrl);assert.equal(out.product.variants[0].availability.status,'out_of_stock');assert.equal(out.product.variants[0].price.amount,6000)
})
test('opaque pagination has no duplicates and rejects query/currency/stock changes',async()=>{
 const s=service([product('a'),product('b'),product('c')]);const input={query:'flowers',pagination:{limit:1}}
 const one=await s.execute('search_catalog',input,profileUrl);const two=await s.execute('search_catalog',{...input,pagination:{limit:1,cursor:one.pagination.cursor}},profileUrl)
 assert.notEqual(one.products[0].id,two.products[0].id)
 await assert.rejects(()=>s.execute('search_catalog',{query:'candle',pagination:{cursor:one.pagination.cursor}},profileUrl),e=>e.status===409)
 await assert.rejects(()=>s.execute('search_catalog',{...input,pagination:{cursor:'malformed'}},profileUrl),e=>e.status===409)
})
test('lookup correlates product and variant IDs; drafts and missing identifiers stay absent',async()=>{
 const r=await service().execute('lookup_catalog',{ids:['a','v_b','draft','absent']},profileUrl)
 assert.deepEqual(r.products.map(p=>p.id),['a','b']);assert.deepEqual(r.products[0].variants[0].inputs,[{id:'a',match:'featured'}]);assert.deepEqual(r.products[1].variants[0].inputs,[{id:'v_b',match:'exact'}]);assert(r.messages.some(m=>m.content.includes('not found')))
 await assert.rejects(()=>service().execute('get_product',{id:'draft'},profileUrl),e=>e.status===404)
})
test('exact option selection, unavailable choices and no silent preference relaxation',async()=>{
 const r=await service().execute('get_product',{id:'a',selected:[{name:'Size',label:'Small'}]},profileUrl)
 assert.equal(r.product.selected[0].label,'Small');assert.equal(r.product.options[0].values[0].available,true)
 await assert.rejects(()=>service().execute('get_product',{id:'a',selected:[{name:'Size',label:'Large'}]},profileUrl),e=>e.status===404)
 await assert.rejects(()=>service().execute('get_product',{id:'a',preferences:['Size']},profileUrl),e=>e.status===400)
})
test('missing/invalid inputs, unsupported filters and ambiguous budget denomination are rejected',async()=>{
 for(const input of [{},{query:''},{filters:{price:{max:5000}}},{query:'x',pagination:{limit:51}},{query:'x',fields:'*'},{filters:{price:{min:9000,max:1000}},context:{currency:'EUR'}}])await assert.rejects(()=>service().execute('search_catalog',input,profileUrl),e=>e.status===400)
})
test('SSRF protections reject private/loopback/mapped/mixed DNS and unsafe URLs before connecting',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false,ip)
 assert.equal(publicAddress('1.1.1.1'),true)
 for(const u of ['http://example.com','https://localhost/.well-known/ucp','https://127.0.0.1/x','https://user:pass@example.com/x','https://example.com:8443/x','https://example.com/x?token=secret'])assert.throws(()=>validateUrl(u))
 await assert.rejects(()=>downloadProfile(new URL('https://agent.example/x'),async()=>[{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}]),e=>e.status===400)
})
test('capability negotiation refuses incompatible versions or missing capabilities',()=>{
 assert.equal(negotiate(profile,SEARCH).version,VERSION)
 assert.throws(()=>negotiate({ucp:{version:'2026-01-11'}},SEARCH))
 assert.throws(()=>negotiate({ucp:{version:VERSION,capabilities:{}}},SEARCH))
})
test('bounded limiter does not evict active clients to bypass limits and expires keys',()=>{
 let now=0;const l=new RateLimiter(1,1,()=>now);l.take('a');assert.throws(()=>l.take('a'));assert.throws(()=>l.take('b'));now=60001;l.take('b')
})
test('future payments cannot be activated through catalogue options or request input',async()=>{
 assert.throws(()=>parseOptions({...options,apiUrl:'http://public.example'}));assert.throws(()=>parseOptions({...options,maxProducts:10001}))
 await assert.rejects(()=>service().execute('search_catalog',{query:'flowers',payment:{method:'stripe'}},profileUrl),e=>e.status===400)
})
