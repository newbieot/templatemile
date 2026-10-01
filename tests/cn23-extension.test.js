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
  let stored={},listener;const order=[];const tabs=new Map([[7,{id:7,url:Q.FORM_URL}],[8,{id:8,url:url('t-old'),openerTabId:7}]]);
  const noop={addListener(){}};
  const chrome={runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,onMessage:{addListener:fn=>listener=fn},onInstalled:noop,onStartup:noop},storage:{local:{get:async key=>({[key]:stored[key]}),set:async value=>{stored=structuredClone(value);order.push({event:'save',status:stored.mileCn23Queue?.rows[0]?.status});},setAccessLevel:async()=>{}}},tabs:{query:async opts=>[...tabs.values()].filter(tab=>opts.url.includes('apiexpos')?tab.url.includes('apiexpos'):tab.url.includes('https://expos')),get:async id=>tabs.get(id),sendMessage:async(_id,message)=>{order.push({event:'message',type:message.type});return{accepted:true};},update:async(id,patch)=>{tabs.set(id,{...tabs.get(id),...patch});order.push({event:'navigate',waiting:stored.mileCn23Queue.waitingNewForm});},create:async()=>({id:7})},action:{onClicked:noop},alarms:{onAlarm:noop,create:async()=>{}}};
  const context={chrome,URL,crypto:require('node:crypto').webcrypto,Date,console,importScripts:()=>{},MileCN23:Q};
  vm.createContext(context);vm.runInContext(fs.readFileSync('extensions/mile-cn23/background.js','utf8'),context);
  const panel={id:'fixture',url:'chrome-extension://fixture/panel.html'};
  const content={id:'fixture',tab:{id:7,url:Q.FORM_URL}};
  const send=(m,sender=panel)=>new Promise(resolve=>listener(m,sender,resolve));
  return {send,content,order,tabs,get state(){return stored.mileCn23Queue;}};
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
  assert.equal(h.order.find(item=>item.event==='navigate').waiting,true,'Navigation cannot beat saved waitingNewForm');
  await h.send({type:'FORM_READY'},h.content);assert.equal(h.state.running,false);assert.equal(h.state.active,null);
  await h.send({type:'CLEAR'});
  assert.equal((await h.send({type:'IMPORT',rows:[sample()]})).ok,false,'Completed IDs survive clearing and prevent replay of an exported queue');
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
  for(const script of [manifest.background.service_worker,...manifest.content_scripts.flatMap(item=>item.js),'panel.html','panel.js','vendor/xlsx.full.min.js','vendor/LICENSE','CARA-INSTALL.txt']) assert.ok(fs.existsSync('extensions/mile-cn23/'+script),script);
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
