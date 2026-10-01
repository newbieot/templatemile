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
      return{ok:true,data:state};
    }}};
    w.eval(fs.readFileSync('extensions/mile-cn23/ui.js','utf8'));
    listener({type:'CN23_PANEL_TOGGLE',tabId:7},null,()=>{});await sleep(20);
    assert.equal(w.document.querySelectorAll('#mile-cn23-menu').length,1);assert.equal(root.querySelectorAll('button').length,2);
    assert.equal(root.getElementById('upload').textContent,'Upload Excel');assert.equal(root.getElementById('start').disabled,true);
    const row={...Q.defaults,queue_id:'TEST',customer_mode:'RITEL',payment_method:'CASH',service_code:'PKH',sender_name:'PENGIRIM',sender_address:'BATAM',recipient_name:'PENERIMA',recipient_address:'KATEMAN INHIL RIAU',recipient_postcode:'29255',recipient_district:'KATEMAN',recipient_city:'INDRAGIRI HILIR',recipient_province:'RIAU',recipient_village:'',recipient_region_scope:'DISTRICT_POSTCODE'};
    const book=w.XLSX.utils.book_new();w.XLSX.utils.book_append_sheet(book,w.XLSX.utils.json_to_sheet([row]),'CN23_ANTREAN');
    const buffer=w.XLSX.write(book,{type:'array',bookType:'xlsx'});
    Object.defineProperty(root.getElementById('file'),'files',{value:[{name:'antrean.xlsx',size:buffer.byteLength,arrayBuffer:async()=>buffer}]});
    root.getElementById('file').dispatchEvent(new w.Event('change'));await sleep(120);
    assert.equal(state.rows.length,1);assert.equal(root.getElementById('start').disabled,false);root.getElementById('start').click();await sleep(20);
    assert.equal(messages.find(m=>m.type==='RUN').tabId,7);assert.equal(messages.some(m=>m.type==='OPEN_MILE'),false);
    listener({type:'CN23_BATCH_DONE',total:1},null,()=>{});assert.match(w.document.getElementById('mile-cn23-complete').textContent,/Selesai: seluruh 1 kiriman/);
    listener({type:'CN23_PANEL_TOGGLE',tabId:7},null,()=>{});assert.equal(w.document.getElementById('mile-cn23-menu'),null);
  }finally{w.close();}
});
test('receipt reader retries an ignored acknowledgement and accepts one freshly rendered receipt',async()=>{
  const dom=new JSDOM('<body><div>Kode Transaksi: 2940020261001000001</div><div id="section-to-print">P2610010000001 PENGIRIM PENERIMA KATEMAN INDRAGIRI HILIR 29255</div></body>',{url:'https://apiexpos.mile.app/api/v2/print-data?data_source=connote&parameter_fields=connote_id&parameter_id=fresh',runScripts:'outside-only'}),w=dom.window;
  try{
    const messages=[];w.MileCN23=Q;w.chrome={runtime:{sendMessage:async m=>{messages.push(m);return{ok:true,data:messages.length===1?{ignored:true}:{receiptAccepted:true}};}}};
    w.eval(fs.readFileSync('extensions/mile-cn23/receipt.js','utf8'));await sleep(1150);
    assert.equal(messages.length,2);assert.equal(messages[1].evidence.code,'P2610010000001');assert.equal(messages[1].evidence.transactionCode,'2940020261001000001');
    assert.match(messages[1].evidence.text,/KATEMAN/);await sleep(600);assert.equal(messages.length,2);
  }finally{w.close();}
});
