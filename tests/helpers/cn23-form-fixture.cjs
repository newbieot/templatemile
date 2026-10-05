'use strict';
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const assert=require('node:assert/strict');
const Q=require('../../extensions/mile-cn23/queue.js');
const {callbackOnly}=require('./cn23-chrome-compat.cjs');
function fixture({filled=false,postal='29274',zone='29274',regionOptions=null,serviceOptions=['PKH','PEK - Produk lain','PE - Pos Express'],corporate=false,payment='CREDIT',autoSubmit=true,maxCost=0,lateReference=false,transitionPayment=false,runtimeSend=null,onSubmit=null,legacyChrome=0}={}) {
  const dom=new JSDOM('<body></body>',{url:Q.FORM_URL,runScripts:'outside-only'});const w=dom.window,d=w.document;
  const webcrypto=require('node:crypto').webcrypto;
  Object.defineProperty(w,'crypto',{value:legacyChrome===88?{getRandomValues:array=>webcrypto.getRandomValues(array)}:webcrypto});
  Object.defineProperty(w.HTMLElement.prototype,'getClientRects',{value:function(){return this.closest('[hidden], [style*="display: none"]')?[]:[{width:100,height:30}];}});
  let listener,submits=0,paymentOpens=0,enters=0;const messages=[];
  function mount(next={}) {
    if(next.corporate!==undefined)corporate=next.corporate;
    if(next.lateReference!==undefined)lateReference=next.lateReference;
    if(next.postal!==undefined)postal=next.postal;
    if(next.zone!==undefined)zone=next.zone;
    d.body.replaceChildren();paymentOpens=0;
  const add=html=>{const template=d.createElement('template');template.innerHTML=html;d.body.append(template.content);};
  const ids=['namapengirim','phonePengirim','namapenerima','phonePenerima','ref_no','instruksi_pengiriman','koli_description','koli_length','koli_width','koli_height','koli_weight','harga_barang'];
  for(const id of ids)add(`<input id="${id}">`);
  if(lateReference) {
    const reference=d.querySelector('#ref_no');reference.remove();
    // Recipient section appears first; reference mounts later with a hidden old copy.
    w.setTimeout(()=>{add('<div hidden><input id="ref_no" value="OLD"></div>');d.body.append(reference);},600);
  }
  for(const id of ['alamatPengirim','alamatPenerima'])add(`<textarea id="${id}"></textarea>`);
  add('<input name="pelanggan"><input id="addressDetail"><input placeholder="KODE POS" disabled><input placeholder="KODE ZONA" disabled><input id="service">');
  for(const placeholder of ['NPWP','Pilih HSCODE','Nama Barang','Jumlah Barang','Rupiah','Berat','Negara Asal','Imei 1','Imei 2'])add(`<input placeholder="${placeholder}">`);
  d.querySelector('[placeholder="Negara Asal"]').value='ID';
  d.querySelector('input[name="pelanggan"]').addEventListener('keyup',e=>{if(e.key==='Enter'){enters++;w.setTimeout(()=>{d.querySelector('#namapengirim').value='PELANGGAN RESMI';d.querySelector('#phonePengirim').value='08111111111';d.querySelector('#alamatPengirim').value='ALAMAT PELANGGAN BATAM';},80);}});
  function select(id,options,parent=d.body,multi=false) {
    const el=d.createElement('div');el.className='el-select';el.innerHTML=`<input ${id?`id="${id}"`:''} readonly placeholder="Select"><ul class="el-select-dropdown" hidden></ul>`;parent.append(el);
    const input=el.querySelector('input'),list=el.querySelector('ul');
    el.addEventListener('click',event=>{
      if(event.target.closest('.el-select-dropdown__item'))return;
      if(parent.classList.contains('el-dialog') && transitionPayment) {
        paymentOpens++;
        if(paymentOpens===1)return; // Dialog transition consumes the first opening click.
        assert.equal(d.activeElement,input,'Payment wrapper must receive a focused input');
        assert.equal(event.target,el,'Element UI payment is opened through its wrapper');
        d.body.append(list); // Element UI portals the dropdown outside the payment dialog.
      }
      list.hidden=false;
    });
    for(const text of options){const item=d.createElement('li');item.className='el-select-dropdown__item';item.textContent=text;list.append(item);item.addEventListener('click',()=>{input.value=text;list.hidden=true;if(multi){const tag=d.createElement('span');tag.className='el-tag';tag.textContent=text;el.append(tag);}});}
    return input;
  }
  select('COD',['NON-COD','COD']);select('Jenis_Barang',['Paket','Dokumen']);select('', ['Insurance','Total PDRI'],d.body,true);
  select('', ['Dokumen / Documents','Hadiah / Gift']);select('', ['Ecommerce/Biasa','IKM Batam']);select('', ['BX - Box','EN - Envelope']);
  const suggestions=d.createElement('div');suggestions.className='el-autocomplete-suggestion';suggestions.hidden=true;d.body.append(suggestions);
  function suggest(input,text,run){input.addEventListener('input',()=>{suggestions.hidden=false;suggestions.replaceChildren();for(const label of Array.isArray(text)?text:[text]){const item=d.createElement('li');item.textContent=label;suggestions.append(item);item.addEventListener('click',()=>{input.value=label;suggestions.hidden=true;run?.();});}});}
  suggest(d.querySelector('#addressDetail'),regionOptions||'KAB. INDRAGIRI HILIR, KERITANG, PENGALIHAN',()=>{d.querySelector('[placeholder="KODE POS"]').value=postal;d.querySelector('[placeholder="KODE ZONA"]').value=zone;});
  suggest(d.querySelector('#service'),serviceOptions);suggest(d.querySelector('[placeholder="Pilih HSCODE"]'),'49011000 BROSUR BAHAN IKLAN DAGANG');
  d.querySelector('[placeholder="Berat"]').addEventListener('input',e=>{d.querySelector('#koli_weight').value=e.target.value;});
  d.querySelector('[placeholder="Rupiah"]').addEventListener('input',e=>{d.querySelector('#harga_barang').value=e.target.value;});
  add('<button id="calculate">Proses Hitung PDRI</button><button id="pay" disabled>Pembayaran</button>');
  d.querySelector('#calculate').addEventListener('click',()=>{d.querySelector('#calculate').textContent='Ubah Data';d.querySelector('#pay').disabled=false;});
  d.querySelector('#pay').addEventListener('click',()=>{
    const dialog=d.createElement('div');dialog.className='el-dialog';d.body.append(dialog);
    select('',corporate?['Invoice','CREDIT']:['Cash'],dialog).closest('.el-select').classList.add('select-payment');
    const amount=d.createElement('div');amount.className='el-form-item';amount.innerHTML='<label>Total Tagihan</label><input value="25.000">';dialog.append(amount);
    const button=d.createElement('button');button.textContent='Selesai';button.addEventListener('click',()=>{submits++;onSubmit?.(d);});dialog.append(button);
  });
  if(filled)d.querySelector('#namapenerima').value='EXISTING DRAFT';
  }
  mount();
  w.chrome={runtime:{onMessage:{addListener:fn=>listener=fn},sendMessage:async m=>{messages.push(m);return runtimeSend ? runtimeSend(m) : {ok:true,data:{}};}}};
  if(legacyChrome)callbackOnly(w.chrome);
  w.eval(fs.readFileSync('extensions/mile-cn23/compat.js','utf8'));
  w.MileCN23=Q;w.eval(fs.readFileSync('extensions/mile-cn23/form.js','utf8'));
  const row={...Q.defaults,queue_id:'TEST-1',sender_name:'PENGIRIM',sender_phone:'0',sender_address:'BATAM',recipient_name:'PENERIMA',recipient_phone:'0',recipient_address:'PENGALIHAN KERITANG',recipient_postcode:'29274',recipient_city:'INDRAGIRI HILIR',recipient_district:'KERITANG',recipient_village:'PENGALIHAN',service_code:'PKH',customer_mode:corporate?'KORPORAT':'RITEL',customer_code:'ACME',payment_method:corporate?payment:'CASH',ref_no:'TEST-1',description:'Dokumen',shipping_instruction:'Tolong diantar dengan baik'};
  return{w,d,messages,remount:mount,receive(message){let answer;listener(message,null,value=>answer=value);return answer;},get enters(){return enters;},get paymentOpens(){return paymentOpens;},start(patch={},token='TOKEN'){listener({type:'CN23_FILL',token,row:{...row,...patch},options:{autoSubmit,maxCost}},null,()=>{});},pause(){listener({type:'CN23_PAUSE',token:'TOKEN'},null,()=>{});},get submits(){return submits;},close(){w.close();}};
}

module.exports={fixture};
