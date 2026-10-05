'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {fixture}=require('./helpers/cn23-form-fixture.cjs');
const {loadWorker,callbackOnly}=require('./helpers/cn23-chrome-compat.cjs');
const Q=require('../extensions/mile-cn23/queue.js');
const crypto=require('node:crypto').webcrypto;
const field=(document,id)=>[...document.querySelectorAll('#'+id)].find(el=>!el.closest('[hidden]'));
const base={...Q.defaults,sender_name:'PENGIRIM',sender_phone:'0',sender_address:'BATAM',recipient_phone:'0',recipient_address:'PENGALIHAN KERITANG',recipient_postcode:'29274',recipient_city:'INDRAGIRI HILIR',recipient_district:'KERITANG',recipient_village:'PENGALIHAN',recipient_province:'RIAU',service_code:'PKH'};

async function until(fn,description) {
  const started=Date.now();while(Date.now()-started<30000){if(fn())return;await new Promise(resolve=>setTimeout(resolve,25));}
  throw new Error('Batch timeout: '+description);
}

for(const scenario of [{spa:false,dropReady:false},{spa:true,dropReady:true},{spa:true,dropReady:true,missList:true},{spa:false,dropReady:false,serviceCode:'PE'},{spa:false,dropReady:false,serviceCode:'PE',legacyChrome:109},{spa:false,dropReady:false,serviceCode:'PE',legacyChrome:88}])test(`NO PRINT TAB: one Start completes three ${scenario.serviceCode||'PKH'} shipments ${scenario.legacyChrome?'with callback-only Chrome '+scenario.legacyChrome+' APIs ':''}${scenario.missList?'with form two already loaded and the list event missing ':''}with ${scenario.spa?'same-document Mile navigation and lost readiness messages':'full navigations'}`,async()=>{
  let stored={},listener,onUpdated,mainPage,documentNumber=0,submissionNumber=0,failure;
  const pages=[],events=[],forms=[],paymentOpens=[],dropped=new Set(),pending=new Set(),tabs=new Map([[7,{id:7,url:Q.FORM_URL}]]);
  const rows=[
    {...base,queue_id:'BATCH-1',ref_no:'REF-1',recipient_name:'PENERIMA SATU',customer_mode:'RITEL',payment_method:'CASH'},
    {...base,queue_id:'BATCH-2',ref_no:'REF-2',recipient_name:'PENERIMA DUA',destination_code:'29275',customer_mode:'KORPORAT',customer_code:'ACME',payment_method:'INVOICE'},
    {...base,queue_id:'BATCH-3',ref_no:'REF-3',recipient_name:'PENERIMA TIGA',customer_mode:'KORPORAT',customer_code:'ACME',payment_method:'CREDIT'}
  ].map(row=>({...row,service_code:scenario.serviceCode||'PKH'}));
  const panel={id:'fixture',url:Q.FORM_URL,tab:{id:7,url:Q.FORM_URL}};
  const send=(message,sender=panel)=>new Promise(resolve=>listener(message,sender,resolve));
  const defer=(action,ms=0)=>{
    const timer=setTimeout(()=>{pending.delete(timer);action();},ms);pending.add(timer);
  };
  function openForm() {
    documentNumber++;const number=documentNumber;
    tabs.set(7,{id:7,url:Q.FORM_URL});
    const corporate=submissionNumber>0;
    if(mainPage&&scenario.spa){
      mainPage.w.history.replaceState({},'',Q.FORM_URL);
      mainPage.remount({corporate,lateReference:true,postal:submissionNumber===1?'29276':'29274'});return;
    }
    if(mainPage)mainPage.close();
    mainPage=fixture({corporate,postal:submissionNumber===1?'29276':'29274',transitionPayment:true,lateReference:number>1,legacyChrome:scenario.legacyChrome,
      runtimeSend:message=>{
        events.push({type:message.type,document:number});
        if(scenario.dropReady&&message.type==='FORM_READY'&&!dropped.has(message.formId)){dropped.add(message.formId);return Promise.resolve({ok:true,data:{ignored:true}});}
        return send(message,{id:'fixture',url:Q.FORM_URL,documentId:'form-'+number,tab:{id:7,url:Q.FORM_URL}});
      },
      onSubmit:document=>{
        try {
        submissionNumber++;
        const index=submissionNumber-1,expected=rows[index];
        assert.equal(stored.mileCn23Queue.rows[index].status,'awaiting_navigation','Durable intent precedes actual Selesai');
        assert.equal(field(document,'ref_no').value,expected.ref_no);
        assert.equal(document.querySelector('#namapenerima').value,expected.recipient_name);
        assert.equal(document.querySelector('#service').value,expected.service_code==='PE'?'PE - Pos Express':'PKH','Select the requested service, excluding another code beginning with PE');
        assert.equal(document.querySelector('.select-payment input').value,index===0?'Cash':index===1?'Invoice':'CREDIT');
        assert.equal(document.querySelector('[placeholder="KODE POS"]').value,index===1?'29276':'29274','Mile postcode is retained even when Excel differs');
        assert.equal(document.querySelector('[placeholder="KODE ZONA"]').value,'29274','Mile zone is retained even when Excel differs');
        if(index>0)assert.equal(document.querySelector('#namapengirim').value,'PELANGGAN RESMI');
        events.push({type:'actual-submit',index,document:number});
        paymentOpens.push(mainPage.paymentOpens);
        const list=()=>{
          tabs.set(7,{id:7,url:'https://expos.mile.app/transaction-list'});
          if(scenario.spa){mainPage.w.history.replaceState({},'','https://expos.mile.app/transaction-list');mainPage.d.body.replaceChildren();}
          if(scenario.missList)defer(()=>openForm(),20);
          else {onUpdated(7,{url:'https://expos.mile.app/transaction-list'},tabs.get(7));onUpdated(7,{status:'complete'},tabs.get(7));}
        };
        defer(list);
        } catch(error) {failure=error;}
      }
    });pages.push(mainPage);
  }
  const noop={addListener(){}};
  const chrome={
    runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,onMessage:{addListener:fn=>listener=fn},onInstalled:noop,onStartup:noop},
    storage:{local:{get:async key=>({[key]:stored[key]}),set:async value=>{stored=structuredClone(value);},setAccessLevel:async()=>{}}},
    tabs:{query:async()=>{throw new Error('MUST NOT query print tabs');},
      get:async id=>tabs.get(id),sendMessage:async(id,message)=>{
        events.push({type:message.type,document:documentNumber});
        if(message.type==='CN23_FILL'){const ack=mainPage.receive(message);forms.push(ack.formId);return ack;}
        if(message.type==='CN23_PROBE')return mainPage.receive(message);
        if(message.type==='CN23_FINISHED')mainPage.receive(message);
        return {accepted:true};
      },
      update:async(id,patch)=>{
        tabs.set(id,{...tabs.get(id),...patch});
        // Full navigations asynchronously replace the document as in Chrome.
        defer(()=>openForm(),20);return tabs.get(id);
      },onUpdated:{addListener:fn=>onUpdated=fn}},
    action:{setBadgeText:async()=>{},onClicked:noop,setTitle:async()=>{}},alarms:{onAlarm:noop,create:async()=>{}}
  };
  if(scenario.legacyChrome)callbackOnly(chrome,{omitAccessLevel:scenario.legacyChrome===88});
  const context={chrome,URL,Date,crypto:scenario.legacyChrome===88?{getRandomValues:array=>crypto.getRandomValues(array)}:crypto,console};
  loadWorker(context);
  try {
    openForm();
    assert.equal((await send({type:'IMPORT',rows,batchId:'three-labels',fileName:'three.xlsx'})).ok,true);
    assert.equal((await send({type:'RUN',tabId:7})).ok,true);
    await until(()=>failure||stored.mileCn23Queue?.completedAt||stored.mileCn23Queue?.error,'all three shipments');
    if(failure)throw failure;
    const state=stored.mileCn23Queue;
    assert.equal(state.error,'');assert.equal(state.rows.every(row=>row.status==='done'),true);
    assert.equal(submissionNumber,3);assert.equal(state.running,false);assert.equal(state.active,null);
    assert.ok(state.rows.every(row=>row.confirmation.via==='MILE_TRANSACTION_LIST'||row.confirmation.via==='NEW_CN23_FORM'));
    assert.equal(tabs.size,1,'No receipt tab exists, yet all three rows complete');
    assert.equal(events.filter(event=>event.type==='CN23_FILL').length,3);
    assert.equal(events.filter(event=>event.type==='SUBMIT_INTENT').length,3);
    assert.equal(events.filter(event=>event.type==='CN23_BATCH_DONE').length,1);
    assert.equal(pages.reduce((count,page)=>count+page.enters,0),2);
    assert.deepEqual(paymentOpens,[2,2,2]);
    const submissions=events.filter(event=>event.type==='actual-submit');
    if(!scenario.spa)assert.equal(new Set(submissions.map(event=>event.document)).size,3);
    assert.equal(new Set(forms).size,3,'Each shipment uses a different fresh form generation');
    if(scenario.dropReady)assert.ok(dropped.size>=1,'Readiness acknowledgements were intentionally lost');
    assert.equal(events.some(event=>event.type==='FORM_ERROR'),false);
  } finally {
    pending.forEach(clearTimeout);pages.forEach(page=>page.close());
  }
});
