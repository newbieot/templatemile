'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {fixture}=require('./helpers/cn23-form-fixture.cjs');
const Q=require('../extensions/mile-cn23/queue.js');
const crypto=require('node:crypto').webcrypto;
const printUrl=id=>`https://apiexpos.mile.app/api/v2/print-data?data_source=connote&parameter_fields=connote_id&parameter_id=${id}`;
const field=(document,id)=>[...document.querySelectorAll('#'+id)].find(el=>!el.closest('[hidden]'));
const base={...Q.defaults,sender_name:'PENGIRIM',sender_phone:'0',sender_address:'BATAM',recipient_phone:'0',recipient_address:'PENGALIHAN KERITANG',recipient_postcode:'29274',recipient_city:'INDRAGIRI HILIR',recipient_district:'KERITANG',recipient_village:'PENGALIHAN',recipient_province:'RIAU',service_code:'PKH'};

async function until(fn,description) {
  const started=Date.now();while(Date.now()-started<30000){if(fn())return;await new Promise(resolve=>setTimeout(resolve,25));}
  throw new Error('Batch timeout: '+description);
}

for(const scenario of [{spa:false,dropReady:false},{spa:true,dropReady:true}])test(`one Start completes three shipments with ${scenario.spa?'same-document Mile navigation and lost readiness messages':'full navigations'}`,async()=>{
  let stored={},listener,onUpdated,onCreated,mainPage,documentNumber=0,submissionNumber=0,failure;
  const pages=[],receipts=[],events=[],forms=[],paymentOpens=[],dropped=new Set(),pending=new Set(),tabs=new Map([[7,{id:7,url:Q.FORM_URL}]]);
  const rows=[
    {...base,queue_id:'BATCH-1',ref_no:'REF-1',recipient_name:'PENERIMA SATU',customer_mode:'RITEL',payment_method:'CASH'},
    {...base,queue_id:'BATCH-2',ref_no:'REF-2',recipient_name:'PENERIMA DUA',customer_mode:'KORPORAT',customer_code:'ACME',payment_method:'INVOICE'},
    {...base,queue_id:'BATCH-3',ref_no:'REF-3',recipient_name:'PENERIMA TIGA',customer_mode:'KORPORAT',customer_code:'ACME',payment_method:'CREDIT'}
  ];
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
      mainPage.remount({corporate,lateReference:true});return;
    }
    if(mainPage)mainPage.close();
    mainPage=fixture({corporate,transitionPayment:true,lateReference:number>1,
      runtimeSend:message=>{
        events.push({type:message.type,document:number});
        if(scenario.dropReady&&message.type==='FORM_READY'&&!dropped.has(message.formId)){dropped.add(message.formId);return Promise.resolve({ok:true,data:{ignored:true}});}
        return send(message,{id:'fixture',url:Q.FORM_URL,documentId:'form-'+number,tab:{id:7,url:Q.FORM_URL}});
      },
      onSubmit:document=>{
        try {
        submissionNumber++;
        const index=submissionNumber-1,expected=rows[index];
        assert.equal(stored.mileCn23Queue.rows[index].status,'awaiting_receipt','Durable intent precedes actual Selesai');
        assert.equal(field(document,'ref_no').value,expected.ref_no);
        assert.equal(document.querySelector('#namapenerima').value,expected.recipient_name);
        assert.equal(document.querySelector('.select-payment input').value,index===0?'Cash':index===1?'Invoice':'CREDIT');
        if(index>0)assert.equal(document.querySelector('#namapengirim').value,'PELANGGAN RESMI');
        events.push({type:'actual-submit',index,document:number});
        paymentOpens.push(mainPage.paymentOpens);
        const receiptText=[document.querySelector('#namapengirim').value,document.querySelector('#namapenerima').value,
          document.querySelector('#alamatPenerima').value,'INDRAGIRI HILIR','29274',field(document,'ref_no').value,
          `P261001000000${index+1}`,`Kode Transaksi: 294002026100100000${index+1}`].join(' ');
        const receipt=()=>openReceipt(index,receiptText);
        const list=()=>{
          tabs.set(7,{id:7,url:'https://expos.mile.app/transaction-list'});
          if(scenario.spa){mainPage.w.history.replaceState({},'','https://expos.mile.app/transaction-list');mainPage.d.body.replaceChildren();}
          onUpdated(7,{url:'https://expos.mile.app/transaction-list'},tabs.get(7));
        };
        // First receipt precedes redirect; second empty form precedes receipt.
        if(index===0){defer(receipt);defer(list,70);}else{defer(list);defer(receipt,900);}
        } catch(error) {failure=error;}
      }
    });pages.push(mainPage);
  }
  function openReceipt(index,text) {
    const id=20+index,url=printUrl('fresh-'+index),tab={id,url,openerTabId:7};
    tabs.set(id,tab);onCreated(tab);
    const dom=new JSDOM('<body><section id="section-to-print"></section></body>',{url,runScripts:'outside-only'});
    dom.window.document.querySelector('#section-to-print').textContent=text;
    dom.window.MileCN23=Q;
    dom.window.chrome={runtime:{sendMessage:message=>send(message,{id:'fixture',url,tab})}};
    receipts.push(dom);dom.window.eval(fs.readFileSync('extensions/mile-cn23/receipt.js','utf8'));
  }
  const noop={addListener(){}};
  const chrome={
    runtime:{id:'fixture',getURL:path=>'chrome-extension://fixture/'+path,onMessage:{addListener:fn=>listener=fn},onInstalled:noop,onStartup:noop},
    storage:{local:{get:async key=>({[key]:stored[key]}),set:async value=>{stored=structuredClone(value);},setAccessLevel:async()=>{}}},
    tabs:{query:async opts=>[...tabs.values()].filter(tab=>opts.url.includes('apiexpos')?tab.url.includes('apiexpos'):tab.url.includes('https://expos')),
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
      },onUpdated:{addListener:fn=>onUpdated=fn},onCreated:{addListener:fn=>onCreated=fn}},
    action:{setBadgeText:async()=>{},onClicked:noop,setTitle:async()=>{}},alarms:{onAlarm:noop,create:async()=>{}}
  };
  const context={chrome,URL,Date,crypto,console,importScripts:()=>{},MileCN23:Q};
  vm.createContext(context);vm.runInContext(fs.readFileSync('extensions/mile-cn23/background.js','utf8'),context);
  try {
    openForm();
    let imported=rows;
    if(scenario.spa){
      const old={...base,queue_id:'OLD-UNRESOLVED',recipient_name:'PREVIOUS SHIPMENT',customer_mode:'RITEL',payment_method:'CASH'};
      stored.mileCn23Queue={rows:[],running:false,active:null,seenReceipts:[],completedQueueIds:[],pendingSubmissions:[{row:Q.validateRows([old])[0],active:{baseline:[],submittedAt:1},tabId:7}]};
      imported=[old,...rows];
    }
    assert.equal((await send({type:'IMPORT',rows:imported,batchId:'three-labels',fileName:'three.xlsx'})).ok,true);
    if(scenario.spa)assert.equal(stored.mileCn23Queue.skippedPending.length,1);
    assert.equal((await send({type:'RUN',tabId:7})).ok,true);
    await until(()=>failure||stored.mileCn23Queue?.completedAt||stored.mileCn23Queue?.error,'all three shipments');
    if(failure)throw failure;
    const state=stored.mileCn23Queue;
    assert.equal(state.error,'');assert.equal(state.rows.every(row=>row.status==='done'),true);
    assert.equal(submissionNumber,3);assert.equal(state.running,false);assert.equal(state.active,null);
    assert.equal(new Set(state.rows.map(row=>row.receipt.id)).size,3);
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
    pending.forEach(clearTimeout);pages.forEach(page=>page.close());receipts.forEach(dom=>dom.window.close());
  }
});
