import {test} from 'node:test'
import assert from 'node:assert/strict'
import {StoreCatalogAdapter} from '../src/lib/store-adapter.ts'
import {options,product} from './fixtures.mjs'

test('anonymous Store API adapter applies region, market, locale and publishable key without user credentials',async()=>{
 const calls=[];const fetcher=async(u,init)=>{calls.push({url:new URL(u),init});return Response.json(u.pathname==='/store/regions'?{regions:[{id:'reg_nl',currency_code:'eur',countries:[{iso_2:'nl'}]}]}:{products:[product('a')],count:1})}
 const rows=await new StoreCatalogAdapter(options,fetcher).load({address_country:'NL',currency:'EUR',language:'en'})
 assert.equal(rows.length,1);assert.equal(calls[1].url.searchParams.get('region_id'),'reg_nl');assert.equal(calls[1].url.searchParams.get('country_code'),'nl');assert.equal(calls[1].init.headers['x-medusa-locale'],'en');assert.equal(calls[1].init.headers.Authorization,undefined);assert.equal(calls[1].init.headers.Cookie,undefined);assert.equal(calls[1].init.redirect,'error')
})
test('adapter rejects unsupported markets, upstream failures and oversized catalogues without partial results',async()=>{
 const unavailable=async()=>new Response('unavailable',{status:503})
 await assert.rejects(()=>new StoreCatalogAdapter(options,unavailable).load({currency:'USD'}),e=>e.status===400)
 await assert.rejects(()=>new StoreCatalogAdapter(options,unavailable).load({}),e=>e.status===503)
 const fetcher=async u=>Response.json(u.pathname==='/store/regions'?{regions:[{id:'reg',currency_code:'eur',countries:[{iso_2:'nl'}]}]}:{products:[product('a')],count:1001})
 await assert.rejects(()=>new StoreCatalogAdapter(options,fetcher).load({}),e=>e.status===503)
})
