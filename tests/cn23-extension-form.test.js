'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const Q=require('../extensions/mile-cn23/queue.js');
function fixture({filled=false,postal='29274',corporate=false,autoSubmit=false,maxCost=50000}={}) {
  const dom=new JSDOM('<body></body>',{url:Q.FORM_URL,runScripts:'outside-only'});const w=dom.window,d=w.document;
  Object.defineProperty(w.HTMLElement.prototype,'getClientRects',{value:function(){return this.closest('[hidden]')?[]:[{width:100,height:30}];}});
  let listener,submits=0;const messages=[];
  const add=html=>{const template=d.createElement('template');template.innerHTML=html;d.body.append(template.content);};
  const ids=['namapengirim','phonePengirim','namapenerima','phonePenerima','ref_no','instruksi_pengiriman','koli_description','koli_length','koli_width','koli_height','koli_weight','harga_barang'];
  for(const id of ids)add(`<input id="${id}">`);
  for(const id of ['alamatPengirim','alamatPenerima'])add(`<textarea id="${id}"></textarea>`);
  add('<input name="pelanggan"><input id="addressDetail"><input placeholder="KODE POS" disabled><input placeholder="KODE ZONA" disabled><input id="service">');
  for(const placeholder of ['NPWP','Pilih HSCODE','Nama Barang','Jumlah Barang','Rupiah','Berat','Negara Asal','Imei 1','Imei 2'])add(`<input placeholder="${placeholder}">`);
  d.querySelector('[placeholder="Negara Asal"]').value='ID';
  function select(id,options,parent=d.body,multi=false) {
    const el=d.createElement('div');el.className='el-select';el.innerHTML=`<input ${id?`id="${id}"`:''} readonly placeholder="Select"><ul class="el-select-dropdown" hidden></ul>`;parent.append(el);
    const input=el.querySelector('input'),list=el.querySelector('ul');input.addEventListener('click',()=>{list.hidden=false;});
    for(const text of options){const item=d.createElement('li');item.className='el-select-dropdown__item';item.textContent=text;list.append(item);item.addEventListener('click',()=>{input.value=text;list.hidden=true;if(multi){const tag=d.createElement('span');tag.className='el-tag';tag.textContent=text;el.append(tag);}});}
    return input;
  }
  select('COD',['NON-COD','COD']);select('Jenis_Barang',['Paket','Dokumen']);select('', ['Insurance','Total PDRI'],d.body,true);
  select('', ['Dokumen / Documents','Hadiah / Gift']);select('', ['Ecommerce/Biasa','IKM Batam']);select('', ['BX - Box','EN - Envelope']);
  const suggestions=d.createElement('div');suggestions.className='el-autocomplete-suggestion';suggestions.hidden=true;d.body.append(suggestions);
  function suggest(input,text,run){input.addEventListener('input',()=>{suggestions.hidden=false;suggestions.replaceChildren();const item=d.createElement('li');item.textContent=text;suggestions.append(item);item.addEventListener('click',()=>{input.value=text;suggestions.hidden=true;run?.();});});}
  suggest(d.querySelector('#addressDetail'),'KAB. INDRAGIRI HILIR, KERITANG, PENGALIHAN',()=>{d.querySelector('[placeholder="KODE POS"]').value=postal;d.querySelector('[placeholder="KODE ZONA"]').value='29274';});
  suggest(d.querySelector('#service'),'PKH');suggest(d.querySelector('[placeholder="Pilih HSCODE"]'),'49011000 BROSUR BAHAN IKLAN DAGANG');
  d.querySelector('[placeholder="Berat"]').addEventListener('input',e=>{d.querySelector('#koli_weight').value=e.target.value;});
  d.querySelector('[placeholder="Rupiah"]').addEventListener('input',e=>{d.querySelector('#harga_barang').value=e.target.value;});
  add('<button id="calculate">Proses Hitung PDRI</button><button id="pay" disabled>Pembayaran</button>');
  d.querySelector('#calculate').addEventListener('click',()=>{d.querySelector('#calculate').textContent='Ubah Data';d.querySelector('#pay').disabled=false;});
  d.querySelector('#pay').addEventListener('click',()=>{
    const dialog=d.createElement('div');dialog.className='el-dialog';d.body.append(dialog);
    select('',corporate?['Invoice','CREDIT']:['Cash'],dialog);
    const amount=d.createElement('div');amount.className='el-form-item';amount.innerHTML='<label>Total Tagihan</label><input value="25.000">';dialog.append(amount);
    const button=d.createElement('button');button.textContent='Selesai';button.addEventListener('click',()=>{submits++;});dialog.append(button);
  });
  if(filled)d.querySelector('#namapenerima').value='EXISTING DRAFT';
  w.chrome={runtime:{onMessage:{addListener:fn=>listener=fn},sendMessage:async m=>{messages.push(m);return{ok:true,data:{}};}}};
  w.MileCN23=Q;w.eval(fs.readFileSync('extensions/mile-cn23/form.js','utf8'));
  const row={...Q.defaults,queue_id:'TEST-1',sender_name:'PENGIRIM',sender_phone:'0',sender_address:'BATAM',recipient_name:'PENERIMA',recipient_phone:'0',recipient_address:'PENGALIHAN KERITANG',recipient_postcode:'29274',recipient_city:'INDRAGIRI HILIR',recipient_district:'KERITANG',recipient_village:'PENGALIHAN',service_code:'PKH',customer_mode:corporate?'KORPORAT':'RITEL',customer_code:'ACME',payment_method:corporate?'CREDIT':'CASH',ref_no:'TEST-1',description:'Dokumen',shipping_instruction:'Tolong diantar dengan baik'};
  return{w,d,messages,start(){listener({type:'CN23_FILL',token:'TOKEN',row,options:{autoSubmit,maxCost}},null,()=>{});},pause(){listener({type:'CN23_PAUSE',token:'TOKEN'},null,()=>{});},get submits(){return submits;},close(){w.close();}};
}
async function until(fn){const start=Date.now();while(Date.now()-start<8000){if(fn())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Fixture timeout');}
test('retail fills preset, locks destination, waits for operator, records intent before one click',async()=>{
  const f=fixture();try{f.start();await until(()=>f.messages.some(m=>m.type==='FILLED'));
    assert.equal(f.d.querySelector('[placeholder="Pilih HSCODE"]').value.startsWith('49011000'),true);
    assert.equal(f.d.querySelector('#koli_weight').value,'0.2');assert.equal(f.d.querySelector('[placeholder="Rupiah"]').value,'20000');assert.equal(f.submits,0);
    const button=[...f.d.querySelectorAll('button')].find(el=>el.textContent==='Selesai');button.click();button.click();
    await until(()=>f.submits===1);assert.equal(f.messages.filter(m=>m.type==='SUBMIT_INTENT').length,1);
  }finally{f.close();}
});
test('nonempty user draft and postcode conflict stop before payment',async()=>{
  for(const options of [{filled:true},{postal:'29276'}]){const f=fixture(options);try{f.start();await until(()=>f.messages.some(m=>m.type==='FORM_ERROR'));assert.equal(f.submits,0);assert.equal(f.messages.some(m=>m.type==='FILLED'),false);if(options.filled)assert.equal(f.d.querySelector('#namapenerima').value,'EXISTING DRAFT');}finally{f.close();}}
});
test('corporate lookup comes first and waits for explicit customer verification',async()=>{
  const f=fixture({corporate:true});try{f.start();await until(()=>f.messages.some(m=>m.phase==='customer_review'));assert.equal(f.d.querySelector('input[name="pelanggan"]').value,'ACME');assert.equal(f.d.querySelector('#namapenerima').value,'');
    [...f.d.querySelectorAll('button')].find(el=>el.textContent==='Pelanggan benar, lanjutkan').click();await until(()=>f.messages.some(m=>m.type==='FILLED'));assert.equal(f.submits,0);
  }finally{f.close();}
});
test('automatic submit observes cost cap; pausing a review releases unsubmitted row',async()=>{
  for(const limit of [20000,50000]){const f=fixture({autoSubmit:true,maxCost:limit});try{f.start();await until(()=>f.messages.some(m=>m.type==='FILLED'));if(limit>25000){await until(()=>f.submits===1);}else{assert.equal(f.submits,0);f.pause();await until(()=>f.messages.some(m=>m.type==='FORM_ERROR'));}}finally{f.close();}}
});
