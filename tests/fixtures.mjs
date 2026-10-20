import { CatalogService } from '../src/lib/catalog.ts'
import { ProfileResolver } from '../src/lib/profiles.ts'
import { VERSION, SEARCH, LOOKUP } from '../src/lib/types.ts'
export const profileUrl = 'https://agent.example/.well-known/ucp'
export const profile = { ucp: { version: VERSION, services: {}, payment_handlers: {}, capabilities: { [SEARCH]: [{version:VERSION}], [LOOKUP]: [{version:VERSION}] } } }
export const options = { enabled: true, apiUrl: 'https://shop.example', storefrontUrl: 'https://shop.example', backendUrl: 'http://localhost:9000', publishableKey: 'pk_fixture', country: 'NL', currency: 'EUR', platformProfiles: { [profileUrl]: profile } }
export function product(id, amount=35, overrides={}) {
 return { id, handle:id, status:'published', title:'Flowers birthday gift '+id, description:'Notebook, bookmark and floral candle.', metadata:{ ucp_enabled:true, supplier_cost:1, secret:'never expose' }, categories:[{name:'Gifts'}], tags:[{value:'birthday'}], options:[{id:'o_size',title:'Size'}], thumbnail:'https://shop.example/image.jpg', variants:[{id:'v_'+id,title:'Small',metadata:{wholesale:1}, manage_inventory:true,inventory_quantity:2,options:[{id:'opt_small',option_id:'o_size',value:'Small'}], calculated_price:{calculated_amount:amount,currency_code:'eur',is_calculated_price_tax_inclusive:true}}], ...overrides }
}
export const inventory = () => [product('a',35), product('b',45), product('expensive',70), product('draft',10,{status:'draft'}),product('private',5,{metadata:{}}),product('hidden',5,{metadata:{ucp_enabled:true,ucp_exclude:true}})]
export function service(rows=inventory(), overrides={}) {
 return new CatalogService({...options,...overrides},{async load(){return structuredClone(rows)}},new ProfileResolver({[profileUrl]:profile}))
}
export const search = {query:'flowers',context:{address_country:'NL',currency:'EUR'},filters:{price:{max:5000}},pagination:{limit:2}}
