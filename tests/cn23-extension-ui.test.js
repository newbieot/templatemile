'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const Q=require('../extensions/mile-cn23/queue.js');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('icon toggles upload/start inside the existing tab, imports real workbook and announces completion',async()=>{
  const dom=new JSDOM('<body><main>Transaksi CN23</main></body>',{url:Q.FORM_URL,runScripts:'outside-only'}),w=dom.window;
  try{
    let root,state={rows:[]};const messages=[];let listener;
    const attach=w.Element.prototype.attachShadow;w.Element.prototype.attachShadow=function(options){root=attach.call(this,options);return root;};
    Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
    w.MileCN23=Q;w.eval(fs.readFileSync('extensions/mile-cn23/vendor/xlsx.full.min.js','utf8'));
    w.chrome={runtime:{onMessage:{addListener:fn=>listener=fn},sendMessage:async m=>{
      messages.push(m);
      if(m.type==='IMPORT')state={fileName:m.fileName,rows:Q.validateRows(m.rows)};
      if(m.type==='RUN')state.running=true;
      if(m.type==='RESET')state={rows:[]};
      return{ok:true,data:state};
    }}};
    w.eval(fs.readFileSync('extensions/mile-cn23/ui.js','utf8'));
    listener({type:'CN23_PANEL_TOGGLE',tabId:7},null,()=>{});await sleep(20);
    assert.equal(w.document.querySelectorAll('#mile-cn23-menu').length,1);assert.equal(root.querySelectorAll('button').length,3);
    assert.equal(root.querySelector('h3').textContent,`Mile CN23 · ${Q.VERSION}`);assert.equal(root.getElementById('results'),null);
    assert.equal(root.getElementById('upload').textContent,'Upload Excel');assert.equal(root.getElementById('start').disabled,true);
    const row={...Q.defaults,queue_id:'TEST',customer_mode:'RITEL',payment_method:'CASH',service_code:'PKH',sender_name:'PENGIRIM',sender_address:'BATAM',recipient_name:'PENERIMA',recipient_address:'KATEMAN INHIL RIAU',recipient_postcode:'29255',recipient_district:'KATEMAN',recipient_city:'INDRAGIRI HILIR',recipient_province:'RIAU',recipient_village:'',recipient_region_scope:'DISTRICT_POSTCODE'};
    const book=w.XLSX.utils.book_new();w.XLSX.utils.book_append_sheet(book,w.XLSX.utils.json_to_sheet([row]),'CN23_ANTREAN');
    const buffer=w.XLSX.write(book,{type:'array',bookType:'xlsx'});
    Object.defineProperty(root.getElementById('file'),'files',{configurable:true,value:[{name:'antrean.xlsx',size:buffer.byteLength,arrayBuffer:async()=>buffer}]});
    root.getElementById('file').dispatchEvent(new w.Event('change'));await sleep(120);
    assert.equal(state.rows.length,1);assert.equal(root.getElementById('start').disabled,false);root.getElementById('start').click();await sleep(20);
    assert.equal(messages.find(m=>m.type==='RUN').tabId,7);assert.equal(messages.some(m=>m.type==='OPEN_MILE'),false);
    listener({type:'CN23_BATCH_DONE',total:1},null,()=>{});assert.match(w.document.getElementById('mile-cn23-complete').textContent,/Selesai: seluruh 1 kiriman/);
    root.getElementById('reset').click();await sleep(30);
    assert.equal(messages.some(m=>m.type==='RESET'),true);assert.equal(root.getElementById('fileName').textContent,'');assert.equal(state.rows.length,0);
    Object.defineProperty(root.getElementById('file'),'files',{configurable:true,value:[{name:'data-baru.xlsx',size:buffer.byteLength,arrayBuffer:async()=>buffer}]});
    root.getElementById('file').dispatchEvent(new w.Event('change'));await sleep(100);
    assert.equal(state.fileName,'data-baru.xlsx');assert.equal(root.getElementById('fileName').textContent,'data-baru.xlsx');
    listener({type:'CN23_PANEL_TOGGLE',tabId:7},null,()=>{});assert.equal(w.document.getElementById('mile-cn23-menu'),null);
  }finally{w.close();}
});
test('running panel restores after full reload and survives a SPA replacing its body',async()=>{
  const dom=new JSDOM('<body><main>Daftar Transaksi</main></body>',{url:'https://expos.mile.app/transaction-list',runScripts:'outside-only'}),w=dom.window;
  try{
    let root;
    const attach=w.Element.prototype.attachShadow;w.Element.prototype.attachShadow=function(options){root=attach.call(this,options);return root;};
    const state={rows:[{id:'ACTIVE',data:{recipient_name:'PENERIMA'},status:'awaiting_navigation'}],active:{id:'ACTIVE',submittedAt:1},running:true,panelOpen:true,};
    const messages=[];w.MileCN23=Q;
    w.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async m=>{messages.push(m);return {ok:true,data:m.type==='PAGE_READY'?{openPanel:true,tabId:7}:state};}}};
    w.eval(fs.readFileSync('extensions/mile-cn23/ui.js','utf8'));await sleep(60);
    assert.equal(w.document.querySelectorAll('#mile-cn23-menu').length,1,'No icon click on new document');
    assert.match(root.getElementById('status').textContent,/Menunggu Mile membuka daftar transaksi/);assert.doesNotMatch(root.textContent,/kepastian|resi/i);
    assert.equal(root.getElementById('start').textContent,'Jeda');
    w.document.body.replaceChildren();await sleep(1100);
    assert.equal(w.document.querySelectorAll('#mile-cn23-menu').length,1,'Vue body replacement must not lose the panel');
    assert.equal(messages.some(m=>m.type==='RUN'),false,'Restoring panel must not create another submission');
  }finally{w.close();}
});
