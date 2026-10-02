'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Q=require('../extensions/mile-cn23/queue.js');
const sample=(id='ROW-1')=>({...Q.defaults,queue_id:id,customer_mode:'RITEL',payment_method:'CASH',service_code:'PKH',sender_name:'PENGIRIM',sender_address:'BATAM',recipient_name:id,recipient_address:'PENGALIHAN KERITANG',recipient_postcode:'29274',recipient_city:'INDRAGIRI HILIR',recipient_district:'KERITANG',recipient_village:'PENGALIHAN',recipient_province:'RIAU',ref_no:'REF-'+id});
function harness(initial){
  let stored=initial?{mileCn23Queue:structuredClone(initial)}:{},listener,updated,installed;
  const tabs=new Map([[7,{id:7,url:Q.FORM_URL}]]),events=[];
  let probe={version:Q.VERSION,ready:true,blank:true,busy:false,path:'/new-transaction-custom',formId:'form-1',pageId:'page-1'};
  const noop={addListener(){}};
  const chrome={runtime:{id:'fixture',onMessage:{addListener:fn=>listener=fn},onInstalled:{addListener:fn=>installed=fn},onStartup:noop},
    storage:{local:{get:async key=>({[key]:structuredClone(stored[key])}),set:async value=>{stored=structuredClone(value);events.push({type:'SAVE',status:stored.mileCn23Queue.rows[0]?.status});},setAccessLevel:async()=>{}}},
    tabs:{query:async()=>{throw new Error('Queue must NEVER inspect print tabs');},get:async id=>tabs.get(id),sendMessage:async(id,m)=>{events.push({type:m.type,id});if(m.type==='CN23_PROBE')return structuredClone(probe);if(m.type==='CN23_FILL'){const ack={accepted:true,formId:probe.formId,pageId:probe.pageId};probe={...probe,busy:true,blank:false};return ack;}return {accepted:true};},update:async(id,patch)=>{events.push({type:'NAVIGATE',...patch});tabs.set(id,{...tabs.get(id),...patch});probe={...probe,ready:false,blank:false,busy:false};return tabs.get(id);},onUpdated:{addListener:fn=>updated=fn}},
    action:{onClicked:noop,setBadgeText:async()=>{},setTitle:async()=>{}},alarms:{onAlarm:noop,create:async()=>{}}};
  const context={chrome,URL,Date,crypto:require('node:crypto').webcrypto,importScripts(){},MileCN23:Q};vm.createContext(context);vm.runInContext(fs.readFileSync('extensions/mile-cn23/background.js','utf8'),context);
  const sender={id:'fixture',url:Q.FORM_URL,tab:{id:7,url:Q.FORM_URL}};
  const send=(m,who=sender)=>new Promise(resolve=>listener(m,who,resolve));
  return {send,events,tabs,installed,mount(id='form-2',patch={}){probe={version:Q.VERSION,ready:true,blank:true,busy:false,path:'/new-transaction-custom',formId:id,pageId:'page-'+id,...patch};},async list(){tabs.set(7,{id:7,url:'https://expos.mile.app/transaction-list'});updated(7,{url:tabs.get(7).url},tabs.get(7));await send({type:'GET'});},get state(){return stored.mileCn23Queue;},get ready(){return structuredClone(probe);}};
}
async function submit(h){const token=h.state.active.token;assert.equal((await h.send({type:'FILLED',token})).ok,true);assert.equal((await h.send({type:'SUBMIT_INTENT',token})).ok,true);return token;}
async function begin(h,rows=[sample(),sample('ROW-2')]){assert.equal((await h.send({type:'IMPORT',rows,fileName:'queue.xlsx'})).ok,true);assert.equal((await h.send({type:'RUN'})).ok,true);}

test('validates outside-document workbook, payments and district-postcode scope',()=>{
  assert.equal(Q.validateRows([sample()])[0].status,'ready');
  for(const patch of [{recipient_city:'BATAM'},{recipient_postcode:'PERLU DICEK'},{customer_mode:'KORPORAT',customer_code:''},{payment_method:'INVOICE'},{hs_code:'12345678'},{weight_kg:1},{insurance:'INVALID'}])assert.throws(()=>Q.validateRows([{...sample(),...patch}]));
  assert.throws(()=>Q.validateRows([sample(),sample()]));
  assert.equal(Q.validateRows([{...sample(),recipient_village:'',recipient_region_scope:'DISTRICT_POSTCODE'}])[0].status,'ready');
});
test('list redirect completes row one and loads form for row two WITHOUT any print tab',async()=>{
  const h=harness();await begin(h);const token=await submit(h);
  assert.equal(h.state.rows[0].status,'awaiting_navigation');
  assert.equal((await h.send({type:'SUBMIT_INTENT',token})).ok,false);
  await h.list();assert.equal(h.state.rows[0].status,'done');assert.equal(h.state.rows[1].status,'ready');
  assert.equal(h.state.waitingNewForm,true);assert.equal(h.tabs.get(7).url,Q.FORM_URL);
  h.mount();await h.send({type:'FORM_READY',...h.ready});
  assert.equal(h.state.active.id,'ROW-2');assert.equal(h.state.rows[1].status,'filling');
  assert.equal(h.events.filter(e=>e.type==='CN23_FILL').length,2);
});
test('form two ALREADY LOADED completes prior cursor and fills second row even if list event was missed',async()=>{
  const h=harness();await begin(h);await submit(h);
  h.mount('form-2');await h.send({type:'FORM_READY',...h.ready});
  assert.equal(h.state.rows[0].status,'done');assert.equal(h.state.active.id,'ROW-2');
  assert.equal(h.state.rows[1].status,'filling');assert.equal(h.events.some(e=>e.type==='NAVIGATE'),false);
});
test('GET probe recovers a missed ready message on already loaded second form',async()=>{
  const h=harness();await begin(h);await submit(h);h.mount('form-2');
  await h.send({type:'GET'});assert.equal(h.state.active.id,'ROW-2');assert.equal(h.state.rows[0].status,'done');
});
test('second form waits for all mounted fields then starts exactly once',async()=>{
  const h=harness();await begin(h);await submit(h);await h.list();
  h.mount('form-2',{ready:false,blank:false,missing:['#ref_no']});await h.send({type:'GET'});
  assert.equal(h.state.active,null);assert.match(h.state.formWait,/#ref_no/);
  h.mount('form-2');await h.send({type:'GET'});await h.send({type:'FORM_READY',...h.ready});
  assert.equal(h.state.active.id,'ROW-2');assert.equal(h.events.filter(e=>e.type==='CN23_FILL').length,2);
});
test('late first-form ready signal cannot advance a submitted row',async()=>{
  const h=harness(),first=h.ready;await begin(h);await submit(h);
  await h.send({type:'FORM_READY',...first});assert.equal(h.state.rows[0].status,'awaiting_navigation');
  assert.equal(h.state.active.id,'ROW-1');
});
test('list viewing before Selesai and a foreign tab do not advance or navigate',async()=>{
  const h=harness();await begin(h);await h.list();assert.equal(h.state.rows[0].status,'filling');
  assert.equal(h.events.some(e=>e.type==='NAVIGATE'),false);
  await submit(h);await h.send({type:'FORM_READY',...h.ready},{id:'fixture',url:Q.FORM_URL,tab:{id:99,url:Q.FORM_URL}});
  assert.equal(h.state.active.id,'ROW-1');
});
test('Reset clears entire Excel and old records; revokes old token; same IDs can be uploaded again',async()=>{
  const h=harness();await begin(h);const token=await submit(h);await h.send({type:'RESET'});
  assert.equal(h.state.rows.length,0);assert.equal(h.state.active,null);assert.equal(h.state.fileName,undefined);
  assert.equal(h.state.pendingSubmissions,undefined);assert.equal(h.state.history,undefined);
  assert.equal((await h.send({type:'SUBMIT_INTENT',token})).ok,false);
  assert.equal((await h.send({type:'IMPORT',rows:[sample()],fileName:'new.xlsx'})).ok,true);
  assert.equal(h.state.rows.length,1);assert.equal(h.state.fileName,'new.xlsx');
});
test('upgrade automatically removes legacy Excel cache, pending records and completion IDs',async()=>{
  const h=harness({version:3,rows:Q.validateRows([sample()]),fileName:'old.xlsx',active:{id:'ROW-1',submittedAt:1},running:true,tabId:7,pendingSubmissions:[{row:{id:'OLD'}}],history:[{}],seenReceipts:['OLD'],completedQueueIds:['ROW-1']});
  await h.send({type:'GET'});assert.equal(h.state.version,5);assert.equal(h.state.rows.length,0);assert.equal(h.state.active,null);
  for(const key of ['pendingSubmissions','history','seenReceipts','completedQueueIds','fileName'])assert.equal(h.state[key],undefined,key);
});

test('current helper preserves 0.2.5 progress and retries the failed third row without repeating completed rows',async()=>{
  const rows=Q.validateRows([sample('ROW-1'),sample('ROW-2'),sample('ROW-3')]);
  rows[0].status='done';rows[1].status='done';rows[2].status='error';rows[2].error='Old postcode mismatch';
  const h=harness({version:5,helperVersion:'0.2.5',rows,fileName:'twelve.xlsx',tabId:7,active:null,running:false,error:'Old postcode mismatch'});
  await h.send({type:'GET'});assert.equal(h.state.rows.length,3);assert.equal(h.state.fileName,'twelve.xlsx');
  h.mount('old-draft',{blank:false});await h.send({type:'RUN'});
  assert.equal(h.state.rows[2].status,'ready');assert.equal(h.state.waitingNewForm,true);
  h.mount('new-resume-form');await h.send({type:'FORM_READY',...h.ready});
  assert.equal(h.state.active.id,'ROW-3');assert.equal(h.state.rows[2].status,'filling');
  assert.equal(h.state.rows.slice(0,2).every(row=>row.status==='done'),true);
  assert.equal(h.events.filter(event=>event.type==='CN23_FILL').length,1);
});
test('old print-script messages are ignored and cannot affect queue',async()=>{
  const h=harness();await begin(h);await submit(h);
  const before=structuredClone(h.state);await h.send({type:'RECEIPT',evidence:{}});await h.send({type:'RECEIPT_STATUS',reason:'old'});
  assert.deepEqual(h.state,before);
});
test('last list redirect completes batch once and PAGE_READY restores panel',async()=>{
  const h=harness();await begin(h,[sample()]);await submit(h);await h.list();await h.send({type:'GET'});
  assert.equal(h.state.rows[0].status,'done');assert.equal(h.state.running,false);assert.ok(h.state.completedAt);
  assert.equal(h.events.filter(e=>e.type==='CN23_BATCH_DONE').length,1);
  const result=await h.send({type:'PAGE_READY'});assert.equal(result.data.openPanel,true);assert.equal(result.data.done,1);
});

test('dismiss completion persists across reloads, rejects stale or foreign dismissals and preserves the completed queue',async()=>{
  const h=harness();await begin(h,[sample()]);await submit(h);await h.list();
  const completedAt=h.state.completedAt,rows=structuredClone(h.state.rows);
  assert.equal((await h.send({type:'DISMISS_COMPLETION',completedAt:completedAt-1})).data.ignored,true);
  assert.equal((await h.send({type:'DISMISS_COMPLETION',completedAt},{id:'fixture',url:Q.FORM_URL,tab:{id:99,url:Q.FORM_URL}})).data.ignored,true);
  assert.equal(h.state.completionDismissedAt,undefined);
  assert.equal((await h.send({type:'DISMISS_COMPLETION',completedAt})).ok,true);
  const reloaded=harness(h.state),ready=await reloaded.send({type:'PAGE_READY'});
  assert.ok(ready.data.completionDismissedAt);assert.equal(ready.data.completedAt,completedAt);
  assert.deepEqual(reloaded.state.rows,rows);assert.equal(ready.data.done,1);
});
test('interrupted submission reports missing Mile transition; unsubmitted work can retry',()=>{
  for(const submitted of [false,true]){const s={rows:Q.validateRows([sample()]),active:{id:'ROW-1',startedAt:0,submittedAt:submitted?1:undefined},running:true};assert.equal(Q.recoverInterrupted(s,200000),true);assert.equal(s.rows[0].status,submitted?'unknown':'error');assert.doesNotMatch(s.error,/resi/i);}
});
test('package uses ONLY Expos, no print reader, no receipt permissions or user-facing strings',()=>{
  const m=JSON.parse(fs.readFileSync('extensions/mile-cn23/manifest.json','utf8'));
  assert.equal(m.version,Q.VERSION);assert.deepEqual(m.permissions,['storage','alarms']);assert.deepEqual(m.host_permissions,['https://expos.mile.app/*']);
  assert.equal(m.content_scripts.length,1);assert.equal(fs.existsSync('extensions/mile-cn23/receipt.js'),false);
  for(const name of [m.background.service_worker,...m.content_scripts[0].js,'vendor/LICENSE','CARA-INSTALL.txt'])assert.ok(fs.existsSync('extensions/mile-cn23/'+name),name);
  assert.doesNotMatch(fs.readFileSync('extensions/mile-cn23/ui.js','utf8'),/resi|pendingSubmissions|skippedPending/i);
});
