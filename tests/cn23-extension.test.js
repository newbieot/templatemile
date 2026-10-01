'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Q=require('../extensions/mile-cn23/queue.js');
const sample=()=>({...Q.defaults,queue_id:'CN23-TEST-1',customer_mode:'RITEL',payment_method:'CASH',service_code:'PKH',sender_name:'PENGIRIM TEST',sender_address:'BATAM',recipient_name:'PENERIMA TEST',recipient_address:'PENGALIHAN KERITANG',recipient_postcode:'29274',recipient_city:'INDRAGIRI HILIR',recipient_district:'KERITANG',recipient_village:'PENGALIHAN',recipient_province:'RIAU',ref_no:'TEST-REF'});
const url=id=>`https://apiexpos.mile.app/api/v2/print-data?data_source=connote&parameter_fields=connote_id&parameter_id=${id}`;
const evidence=()=>({code:'P2610010000001',transactionCode:'2940020261001000001',text:'PENGIRIM TEST PENERIMA TEST PENGALIHAN KERITANG INDRAGIRI HILIR 29274 TEST-REF'});
test('queue rejects local, duplicate, uncertain destination, incorrect preset and payment',()=>{
  assert.equal(Q.validateRows([sample()])[0].status,'ready');
  for(const patch of [{recipient_city:'KOTA BATAM'},{recipient_postcode:'PERLU DICEK'},{customer_mode:'KORPORAT',customer_code:''},{payment_method:'INVOICE'},{hs_code:'12345678'},{item_value_idr:0},{weight_kg:1},{insurance:'INVALID'},{workflow:'LOCAL'}]) assert.throws(()=>Q.validateRows([{...sample(),...patch}]));
  assert.throws(()=>Q.validateRows([sample(),sample()]));
  assert.equal(Q.validateRows([{...sample(),customer_mode:'KORPORAT',customer_code:'ACME',payment_method:'CREDIT'}])[0].data.customer_code,'ACME');
});
test('new receipt identity and all destination fields must match',()=>{
  assert.equal(Q.receiptMatches(sample(),evidence()),true);
  for(const text of ['wrong person',evidence().text.replace('29274','29276'),evidence().text.replace('TEST-REF','DIFFERENT')]) assert.equal(Boolean(Q.receiptMatches(sample(),{...evidence(),text})),false);
  assert.equal(Q.receiptId(url('t-123')),'t-123');
  assert.equal(Q.receiptId(url('t-123').replace('apiexpos.mile.app','example.com')),'');
  assert.equal(Q.receiptId(url('t-123').replace('t-123','t-123,t-456')),'');
});
test('interrupted fill can retry; interrupted submission stays unknown; manual review does not expire',()=>{
  for(const submitted of [false,true]) {
    const s={rows:Q.validateRows([sample()]),active:{id:sample().queue_id,phase:'filling',startedAt:0,submittedAt:submitted?1:undefined},running:true};
    assert.equal(Q.recoverInterrupted(s,200000),true);assert.equal(s.rows[0].status,submitted?'unknown':'error');assert.equal(Boolean(s.active),submitted);assert.equal(s.running,false);
  }
  const s={rows:Q.validateRows([sample()]),active:{id:sample().queue_id,phase:'payment_ready',startedAt:0},running:true};
  assert.equal(Q.recoverInterrupted(s,200000),false);
});
function workerHarness() {
  let stored={},listener,created,updated,clicked;const order=[];const tabs=new Map([[7,{id:7,url:Q.FORM_URL}],[8,{id:8,url:url('t-old'),openerTabId:7}]]);
  const noop={addListener(){}};
  const chrome={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,onMessage:{addListener:fn=>listener=fn},onInstalled:noop,onStartup:noop},storage:{local:{get:async key=>({[key]:stored[key]}),set:async value=>{stored=structuredClone(value);order.push({event:'save',status:stored.mileCn23Queue?.rows[0]?.status});},setAccessLevel:async()=>{}}},tabs:{query:async opts=>[...tabs.values()].filter(tab=>opts.url.includes('apiexpos')?tab.url.includes('apiexpos'):tab.url.includes('https://expos')),get:async id=>tabs.get(id),sendMessage:async(_id,message)=>{order.push({event:'message',type:message.type});return{accepted:true};},update:async(id,patch)=>{tabs.set(id,{...tabs.get(id),...patch});order.push({event:'navigate',waiting:stored.mileCn23Queue.waitingNewForm});},create:async()=>{order.push({event:'new-tab'});return{id:7};},onCreated:{addListener:fn=>created=fn},onUpdated:{addListener:fn=>updated=fn}},action:{onClicked:{addListener:fn=>clicked=fn},setBadgeText:async()=>{},setTitle:async()=>{}},alarms:{onAlarm:noop,create:async()=>{}}};
  const context={chrome,URL,crypto:require('node:crypto').webcrypto,Date,console,importScripts:()=>{},MileCN23:Q};
  vm.createContext(context);vm.runInContext(fs.readFileSync('extensions/mile-cn23/background.js','utf8'),context);
  const panel={id:'fixture',url:Q.FORM_URL,tab:{id:7,url:Q.FORM_URL}};
  const content={id:'fixture',tab:{id:7,url:Q.FORM_URL}};
  const send=(m,sender=panel)=>new Promise(resolve=>listener(m,sender,resolve));
  return {send,content,order,tabs,created,updated,clicked,get state(){return stored.mileCn23Queue;}};
}
test('durable submit, old/foreign receipt rejection, no double submit, receipt-gated advance',async()=>{
  const h=workerHarness();assert.equal((await h.send({type:'IMPORT',rows:[sample()],batchId:'hash',fileName:'test.xlsx'})).ok,true);
  assert.equal((await h.send({type:'RUN',tabId:7,options:{autoAdvance:true}})).ok,true);
  const token=h.state.active.token;
  assert.equal(h.order.find(item=>item.event==='save'&&item.status==='filling')?.status,'filling');
  await h.send({type:'FILLED',token},h.content);
  await h.send({type:'SUBMIT_INTENT',token},h.content);
  assert.equal(h.state.rows[0].status,'awaiting_receipt');assert.ok(h.state.active.submittedAt);
  assert.equal((await h.send({type:'SUBMIT_INTENT',token},h.content)).ok,false);
  await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:8,url:url('t-old'),openerTabId:7}});
  assert.equal(h.state.rows[0].status,'awaiting_receipt');
  await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:9,url:url('t-new'),openerTabId:99}});
  assert.equal(h.state.rows[0].status,'awaiting_receipt');
  await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:10,url:url('t-new'),openerTabId:7}});
  assert.equal(h.state.rows[0].status,'done');assert.equal(h.state.rows[0].receipt.code,evidence().code);
  assert.equal(h.state.running,false);assert.ok(h.state.completedAt);assert.ok(h.order.some(item=>item.type==='CN23_BATCH_DONE'));
  await h.send({type:'FORM_READY'},h.content);assert.equal(h.state.running,false);assert.equal(h.state.active,null);
  await h.send({type:'CLEAR'});
  assert.equal((await h.send({type:'IMPORT',rows:[sample()]})).ok,true);assert.equal(h.state.rows.length,0,'Completed IDs survive clearing and prevent replay of an exported queue');
});
test('mismatched receipt pauses; uncertain submission cannot be retried or cleared',async()=>{
  const h=workerHarness();await h.send({type:'IMPORT',rows:[sample()]});await h.send({type:'RUN',tabId:7});const token=h.state.active.token;
  await h.send({type:'FILLED',token},h.content);await h.send({type:'SUBMIT_INTENT',token},h.content);
  await h.send({type:'RECEIPT',evidence:{...evidence(),text:'OTHER SHIPMENT'}},{tab:{id:10,url:url('t-bad'),openerTabId:7}});
  assert.equal(h.state.rows[0].status,'unknown');assert.equal(h.state.running,false);
  for(const command of [{type:'RUN',tabId:7},{type:'CLEAR'},{type:'RETRY',id:sample().queue_id},{type:'IMPORT',rows:[sample()]}]) assert.equal((await h.send(command)).ok,false);
  assert.equal((await h.send({type:'MANUAL_RECEIPT',id:sample().queue_id,code:evidence().code,url:url('t-confirmed')})).ok,true);assert.equal(h.state.rows[0].status,'done');
});
test('manifest packages every declared script, local SheetJS, no remote executable code',()=>{
  const manifest=JSON.parse(fs.readFileSync('extensions/mile-cn23/manifest.json','utf8'));
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.version,Q.VERSION);
  for(const script of [manifest.background.service_worker,...manifest.content_scripts.flatMap(item=>item.js),'vendor/xlsx.full.min.js','vendor/LICENSE','CARA-INSTALL.txt']) assert.ok(fs.existsSync('extensions/mile-cn23/'+script),script);
  assert.deepEqual(manifest.permissions,['storage','alarms']);
});
test('refresh during manual review releases fill; refresh after submit holds uncertain result',async()=>{
  for(const submit of [false,true]){
    const h=workerHarness();await h.send({type:'IMPORT',rows:[sample()]});await h.send({type:'RUN',tabId:7});const token=h.state.active.token;
    await h.send({type:'FILLED',token},{...h.content,documentId:'old-document'});
    if(submit)await h.send({type:'SUBMIT_INTENT',token},h.content);
    await h.send({type:'FORM_READY'},{...h.content,documentId:'new-document'});
    assert.equal(h.state.rows[0].status,submit?'unknown':'error');assert.equal(h.state.running,false);assert.equal(Boolean(h.state.active),submit);
  }
});

test('two-row queue returns from transaction-list, accepts fresh receipt tab and continues without another Start',async()=>{
  const h=workerHarness(), second={...sample(),queue_id:'CN23-TEST-2',recipient_name:'PENERIMA KEDUA',ref_no:'TEST-REF-2'};
  await h.send({type:'IMPORT',rows:[sample(),second]});
  h.clicked({id:7,url:Q.FORM_URL});await h.send({type:'GET'});
  assert.ok(h.order.some(item=>item.type==='CN23_PANEL_TOGGLE'));assert.equal(h.order.some(item=>item.event==='new-tab'),false);
  await h.send({type:'RUN',tabId:7});let token=h.state.active.token;
  await h.send({type:'FILLED',token},{...h.content,documentId:'first'});await h.send({type:'SUBMIT_INTENT',token},h.content);
  h.created({id:11});h.updated(7,{url:'https://expos.mile.app/transaction-list'},{id:7});await h.send({type:'GET'});
  assert.equal(h.tabs.get(7).url,Q.FORM_URL);assert.equal(h.state.formReturnExpected,true);
  await h.send({type:'FORM_READY'},{...h.content,documentId:'next'});assert.equal(h.state.rows[0].status,'awaiting_receipt');
  const ack=await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:11,url:url('first-fresh')}});
  assert.equal(ack.data.receiptAccepted,true);assert.equal(h.state.rows[0].status,'done');assert.equal(h.state.rows[1].status,'filling');
  assert.equal(h.order.filter(item=>item.type==='CN23_FILL').length,2);
  token=h.state.active.token;await h.send({type:'FILLED',token},{...h.content,documentId:'next'});await h.send({type:'SUBMIT_INTENT',token},h.content);
  const receipt={...evidence(),code:'P2610010000002',text:evidence().text.replace('PENERIMA TEST','PENERIMA KEDUA').replace('TEST-REF','TEST-REF-2')};
  await h.send({type:'RECEIPT',evidence:receipt},{tab:{id:12,url:url('second-fresh'),openerTabId:7}});
  assert.equal(h.state.rows.every(row=>row.status==='done'),true);assert.equal(h.state.running,false);assert.ok(h.order.some(item=>item.type==='CN23_BATCH_DONE'));
  assert.equal(h.order.some(item=>item.event==='new-tab'),false);
});
test('same postcode district scope validates and verifies receipt without inventing a village',()=>{
  const row={...sample(),recipient_district:'KATEMAN',recipient_village:'',recipient_postcode:'29255',recipient_region_scope:'DISTRICT_POSTCODE'};
  assert.equal(Q.validateRows([row])[0].status,'ready');assert.equal(Q.receiptMatches(row,{...evidence(),text:'PENGIRIM TEST PENERIMA TEST SUNGAI GUNTUNG KATEMAN INDRAGIRI HILIR 29255 TEST-REF'}),true);
  assert.throws(()=>Q.validateRows([{...row,recipient_region_scope:''}]));
});
test('receipt arriving before list redirect still resumes the next form',async()=>{
  const h=workerHarness(),second={...sample(),queue_id:'SECOND'};
  await h.send({type:'IMPORT',rows:[sample(),second]});await h.send({type:'RUN',tabId:7});const token=h.state.active.token;
  await h.send({type:'FILLED',token},h.content);await h.send({type:'SUBMIT_INTENT',token},h.content);
  await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:15,url:url('receipt-first'),openerTabId:7}});
  assert.equal(h.state.waitingNewForm,true);
  h.updated(7,{url:'https://expos.mile.app/transaction-list'},{id:7});await h.send({type:'GET'});
  assert.equal(h.tabs.get(7).url,Q.FORM_URL);await h.send({type:'FORM_READY'},h.content);
  assert.equal(h.state.rows[1].status,'filling');assert.equal(h.order.filter(item=>item.type==='CN23_FILL').length,2);
});

test('late readiness of the first form cannot be reused for the next shipment',async()=>{
  const h=workerHarness(),second={...sample(),queue_id:'SECOND'};
  await h.send({type:'IMPORT',rows:[sample(),second]});await h.send({type:'RUN',tabId:7});
  const original={...h.content,documentId:'original'},token=h.state.active.token;
  await h.send({type:'FORM_READY'},original);
  assert.equal(h.state.formReady,false);
  await h.send({type:'FILLED',token},original);await h.send({type:'SUBMIT_INTENT',token},original);
  await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:15,url:url('receipt-first'),openerTabId:7}});
  assert.equal(h.state.rows[1].status,'ready');assert.equal(h.state.waitingNewForm,true);
  assert.equal(h.order.filter(item=>item.type==='CN23_FILL').length,1);
  await h.send({type:'FORM_READY'},{...h.content,documentId:'fresh-empty'});
  assert.equal(h.state.rows[1].status,'filling');assert.equal(h.order.filter(item=>item.type==='CN23_FILL').length,2);
});

test('old document readiness during list redirect cannot unlock a second transaction',async()=>{
  const h=workerHarness();await h.send({type:'IMPORT',rows:[sample()]});await h.send({type:'RUN',tabId:7});
  const original={...h.content,documentId:'original'},token=h.state.active.token;
  await h.send({type:'FILLED',token},original);await h.send({type:'SUBMIT_INTENT',token},original);
  h.updated(7,{url:'https://expos.mile.app/transaction-list'},{id:7});await h.send({type:'GET'});
  await h.send({type:'FORM_READY'},original);assert.equal(h.state.formReady,false);
  await h.send({type:'FORM_READY'},{...h.content,documentId:'fresh-empty'});assert.equal(h.state.formReady,true);
});

test('Reset archives a partially completed queue, revokes old token and imports fresh remaining data',async()=>{
  const h=workerHarness(),second={...sample(),queue_id:'SECOND'},fresh={...sample(),queue_id:'FRESH'};
  await h.send({type:'IMPORT',rows:[sample(),second],fileName:'old.xlsx'});await h.send({type:'RUN',tabId:7});
  let token=h.state.active.token;
  await h.send({type:'FILLED',token},h.content);await h.send({type:'SUBMIT_INTENT',token},h.content);
  await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:15,url:url('reset-receipt'),openerTabId:7}});
  await h.send({type:'FORM_READY'},h.content);token=h.state.active.token;
  assert.equal((await h.send({type:'RESET'})).ok,true);
  assert.equal(h.state.rows.length,0);assert.equal(h.state.active,null);assert.equal(h.state.running,false);
  assert.ok(h.state.completedQueueIds.includes(sample().queue_id));assert.ok(h.state.seenReceipts.includes('reset-receipt'));
  assert.equal((await h.send({type:'SUBMIT_INTENT',token},h.content)).ok,false);
  assert.equal((await h.send({type:'IMPORT',rows:[sample(),second,fresh],fileName:'new.xlsx'})).ok,true);
  assert.equal(h.state.fileName,'new.xlsx');assert.equal(h.state.skippedCompleted,1);
  assert.deepEqual(h.state.rows.map(row=>row.id),['SECOND','FRESH']);
});

test('Reset after Selesai permits a new queue, preserves unresolved identity, and accepts its late receipt',async()=>{
  const h=workerHarness(),fresh={...sample(),queue_id:'NEW'};
  await h.send({type:'IMPORT',rows:[sample()]});await h.send({type:'RUN',tabId:7});const token=h.state.active.token;
  await h.send({type:'FILLED',token},h.content);await h.send({type:'SUBMIT_INTENT',token},h.content);
  await h.send({type:'RESET'});assert.equal(h.state.rows.length,0);assert.equal(h.state.pendingSubmissions.length,1);
  assert.equal((await h.send({type:'IMPORT',rows:[sample()]})).ok,true);assert.equal(h.state.rows.length,0);assert.equal(h.state.skippedPending.length,1);
  assert.equal((await h.send({type:'IMPORT',rows:[fresh]})).ok,true);
  const reply=await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:16,url:url('late-after-reset'),openerTabId:7}});
  assert.equal(reply.data.receiptAccepted,true);assert.equal(h.state.pendingSubmissions.length,0);
  assert.equal(h.state.rows[0].status,'ready');assert.ok(h.state.completedQueueIds.includes(sample().queue_id));
});

test('verified blank new form survives a missed transaction-list event while still waiting for receipt',async()=>{
  const h=workerHarness(),second={...sample(),queue_id:'SECOND'};
  await h.send({type:'IMPORT',rows:[sample(),second]});await h.send({type:'RUN',tabId:7});const token=h.state.active.token;
  await h.send({type:'FILLED',token},{...h.content,documentId:'original'});await h.send({type:'SUBMIT_INTENT',token},h.content);
  await h.send({type:'FORM_READY',version:Q.VERSION,path:'/new-transaction-custom',ready:true,blank:true,busy:false,formId:'fresh-form'},{...h.content,documentId:'fresh-document'});
  assert.equal(h.state.formReady,true);assert.equal(h.state.rows[0].status,'awaiting_receipt');assert.equal(h.state.running,true);
  assert.equal(h.state.rows[1].status,'ready');
  await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:17,url:url('missed-navigation'),openerTabId:7}});
  assert.equal(h.state.rows[0].status,'done');assert.equal(h.state.rows[1].status,'filling');
});


test('Reset and reimport the SAME four-row Excel skips the unresolved submission and starts remaining rows',async()=>{
  const h=workerHarness();
  const rows=[sample(),...Array.from({length:3},(_,i)=>({...sample(),queue_id:'REMAIN-'+i,recipient_name:'REMAIN '+i,ref_no:'REF-'+i}))];
  await h.send({type:'IMPORT',rows,fileName:'same.xlsx'});await h.send({type:'RUN'});
  const token=h.state.active.token;await h.send({type:'FILLED',token},h.content);await h.send({type:'SUBMIT_INTENT',token},h.content);
  await h.send({type:'RESET'});
  const reply=await h.send({type:'IMPORT',rows,fileName:'same.xlsx'});
  assert.equal(reply.ok,true);assert.equal(h.state.rows.length,3);assert.equal(h.state.skippedCompleted,0);
  assert.deepEqual(h.state.skippedPending,[{id:sample().queue_id,name:sample().recipient_name,sourceRow:1}]);
  assert.equal((await h.send({type:'RUN'})).ok,true);assert.equal(h.state.active.id,'REMAIN-0');
  const activeToken=h.state.active.token;
  const late=await h.send({type:'RECEIPT',evidence:evidence()},{tab:{id:16,url:url('late-original'),openerTabId:7}});
  assert.equal(late.data.archived,true);assert.equal(h.state.active.token,activeToken);
  assert.equal(h.state.skippedPending.length,0);assert.equal(h.state.skippedCompleted,1);
});
