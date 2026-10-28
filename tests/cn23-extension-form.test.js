'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {fixture}=require('./helpers/cn23-form-fixture.cjs');
async function until(fn){const start=Date.now();while(Date.now()-start<8000){if(fn())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Fixture timeout');}
test('retail automatically chooses Cash and submits once after durable intent',async()=>{
  const f=fixture();try{f.start();await until(()=>f.messages.some(m=>m.type==='FILLED'));
    assert.equal(f.d.querySelector('[placeholder="Pilih HSCODE"]').value.startsWith('49011000'),true);
    assert.equal(f.d.querySelector('#koli_weight').value,'0.2');assert.equal(f.d.querySelector('[placeholder="Rupiah"]').value,'20000');await until(()=>f.submits===1);assert.equal(f.d.querySelector('.el-dialog .el-select input').value,'Cash');
    const button=[...f.d.querySelectorAll('button')].find(el=>el.textContent==='Selesai');button.click();button.click();
    await until(()=>f.submits===1);assert.equal(f.messages.filter(m=>m.type==='SUBMIT_INTENT').length,1);
  }finally{f.close();}
});
test('long CN23 recipient name/address are truncated automatically for retail and corporate',async()=>{
  for(const corporate of [false,true]) {
    const f=fixture({corporate,legacyChrome:88});
    const row={recipient_name:'BPK/IBU KEPALA SEKOLAH NEGERI '.repeat(5),recipient_address:'JL. PENDIDIKAN RT 01 RW 02 PENGALIHAN KERITANG INHIL RIAU '.repeat(6)};
    const original={...row};
    try {
      f.start(row);await until(()=>f.submits===1);
      assert.equal(f.d.querySelector('#namapenerima').value,row.recipient_name.trim().slice(0,30).trim());
      assert.equal(f.d.querySelector('#alamatPenerima').value,row.recipient_address.trim().slice(0,80).trim());
      assert.equal(f.d.querySelector('[placeholder="KODE POS"]').value,'29274');
      assert.equal(f.d.querySelector('#phonePenerima').value,'0');
      assert.equal(f.d.querySelector('#namapengirim').value,'PENGIRIM');
      assert.equal(f.messages.some(m=>m.type==='FORM_ERROR'),false);
      assert.deepEqual(row,original);
    } finally { f.close(); }
  }
});
test('corporate Belakang Padang district and Kasu village match Batam options and use Mile locked codes',async()=>{
  for(const village of ['', 'KASU']) {
    const f=fixture({corporate:true,postal:'29416',zone:'29400',regionOptions:[
      'KOTA BATAM, SEKUPANG, TANJUNG RIAU (29426)',
      'KOTA BATAM, BELAKANG PADANG, KASU (29416)'
    ]});
    try {
      f.start({recipient_city:'BATAM',recipient_province:'KEPULAUAN RIAU',recipient_district:'BELAKANG PADANG',
        recipient_village:village,recipient_region_scope:village?'VILLAGE':'DISTRICT POSTCODE',
        recipient_postcode:village?'29413':'29416',destination_code:'',recipient_address:'BELAKANG PADANG BATAM'});
      await until(()=>f.submits===1);
      assert.match(f.d.querySelector('#addressDetail').value,/BELAKANG PADANG, KASU/);
      assert.equal(f.d.querySelector('[placeholder="KODE POS"]').value,'29416');
      assert.equal(f.d.querySelector('[placeholder="KODE ZONA"]').value,'29400');
      assert.equal(f.messages.some(m=>m.type==='FORM_ERROR'),false);
    } finally {f.close();}
  }
});

test('CN23 entry respects shorter name/address maxlength from Mile without changing sender fields',async()=>{
  const f=fixture();
  try {
    f.d.querySelector('#namapenerima').maxLength=20;
    f.d.querySelector('#alamatPenerima').maxLength=60;
    const sender='PENGIRIM '.repeat(10).trim(),address='ALAMAT PENGIRIM '.repeat(10).trim();
    f.start({recipient_name:'N'.repeat(80),recipient_address:'A'.repeat(180),sender_name:sender,sender_address:address});
    await until(()=>f.submits===1);
    assert.equal(f.d.querySelector('#namapenerima').value,'N'.repeat(20));
    assert.equal(f.d.querySelector('#alamatPenerima').value,'A'.repeat(60));
    assert.equal(f.d.querySelector('#namapengirim').value,sender);
    assert.equal(f.d.querySelector('#alamatPengirim').value,address);
    assert.equal(f.messages.some(m=>m.type==='FORM_ERROR'),false);
  } finally { f.close(); }
});

test('nonempty user draft stops before payment',async()=>{
  const f=fixture({filled:true});try{f.start();await until(()=>f.messages.some(m=>m.type==='FORM_ERROR'));assert.equal(f.submits,0);assert.equal(f.messages.some(m=>m.type==='FILLED'),false);assert.equal(f.d.querySelector('#namapenerima').value,'EXISTING DRAFT');}finally{f.close();}
});

test('city routing searches city/code automatically and retains edited weight above 1 kg',async()=>{
  const f=fixture({postal:'40111',zone:'40100',regionOptions:[
    'KOTA BANDUNG, SUMUR BANDUNG, BRAGA (40111)',
    'KOTA BANDUNG, BANDUNG WETAN, CITARUM (40115)'
  ]});
  try {
    f.start({recipient_city:'BANDUNG',recipient_province:'JAWA BARAT',recipient_district:'',recipient_village:'',
      recipient_postcode:'40111',recipient_region_scope:'CITY_POSTCODE',weight_kg:1.5});
    await until(()=>f.submits===1);
    assert.equal(Number(f.d.querySelector('#koli_weight').value),1.5);
    assert.match(f.d.querySelector('#addressDetail').value,/BRAGA/);
    assert.equal(f.d.querySelector('[placeholder="KODE POS"]').value,'40111');
    assert.equal(f.messages.some(message=>message.type==='FORM_ERROR'),false);
  } finally { f.close(); }
});

test('retail and corporate keep Mile postcode/zone despite Excel differences and submit automatically',async()=>{
  for(const corporate of [false,true]) for(const codes of [
    {excel:'29274',mile:'29276',excelZone:'29275',mileZone:'29274'},
    {excel:'11111',mile:'22222',excelZone:'OLD-A',mileZone:'MILE-A'},
    {excel:'99999',mile:'12345',excelZone:'OLD-B',mileZone:'MILE-B'}
  ]) {
    const f=fixture({postal:codes.mile,zone:codes.mileZone,corporate});
    try {
      f.start({recipient_postcode:codes.excel,destination_code:codes.excelZone});await until(()=>f.submits===1);
      assert.equal(f.d.querySelector('[placeholder="KODE POS"]').value,codes.mile);
      assert.equal(f.d.querySelector('[placeholder="KODE ZONA"]').value,codes.mileZone);
      assert.equal(f.messages.some(m=>m.type==='FORM_ERROR'),false);
      assert.equal(f.messages.filter(m=>m.type==='SUBMIT_INTENT').length,1);
    } finally {f.close();}
  }
});

test('matching Mile regions sharing another postcode continue without an Excel postcode match',async()=>{
  const f=fixture({postal:'29276',regionOptions:[
    'KAB. INDRAGIRI HILIR, KERITANG, PENGALIHAN (29276)',
    'KAB. INDRAGIRI HILIR, KERITANG, PENGALIHAN / KEMUNING (29276)'
  ]});
  try {
    f.start();await until(()=>f.submits===1);
    assert.equal(f.d.querySelector('[placeholder="KODE POS"]').value,'29276');
    assert.equal(f.messages.some(m=>m.type==='FORM_ERROR'),false);
  } finally {f.close();}
});
test('corporate Mile choice preserves lookup sender and selects CREDIT',async()=>{
  const f=fixture({corporate:true,senderSource:'mile'});try{f.start();await until(()=>f.submits===1);
    assert.equal(f.enters,1);assert.equal(f.d.querySelector('#namapengirim').value,'PELANGGAN RESMI');
    assert.equal(f.d.querySelector('#phonePengirim').value,'08111111111');assert.equal(f.d.querySelector('#alamatPengirim').value,'ALAMAT PELANGGAN BATAM');
    assert.equal(f.d.querySelector('#namapenerima').value,'PENERIMA');assert.equal(f.d.querySelector('.el-dialog .el-select input').value,'CREDIT');
    assert.equal(f.messages.find(m=>m.customerResolved)?.customerResolved.sender_name,'PELANGGAN RESMI');
    assert.equal([...f.d.querySelectorAll('button')].some(el=>el.textContent==='Pelanggan benar, lanjutkan'),false);
  }finally{f.close();}
});
test('corporate Excel choice clears all three lookup values, emits input/change and restores a late autofill before submit',async()=>{
  const f=fixture({corporate:true,senderSource:'excel',legacyChrome:88});
  const values={namapengirim:'PENGIRIM EXCEL',phonePengirim:'089876543210',alamatPengirim:'ALAMAT KHUSUS EXCEL'};
  const events={};
  try {
    for(const id of Object.keys(values)) {
      events[id]={input:[],change:[]};
      for(const type of ['input','change'])f.d.querySelector('#'+id).addEventListener(type,event=>events[id][type].push(event.target.value));
    }
    f.start({sender_name:values.namapengirim,sender_phone:values.phonePengirim,sender_address:values.alamatPengirim});
    await until(()=>f.d.querySelector('#namapengirim').value===values.namapengirim);
    for(const id of Object.keys(values))f.d.querySelector('#'+id).value='AUTOFILL TERLAMBAT';
    await until(()=>f.submits===1);
    for(const [id,value] of Object.entries(values)) {
      assert.equal(f.d.querySelector('#'+id).value,value);
      for(const type of ['input','change'])assert.deepEqual(events[id][type].slice(-2),['',value]);
    }
    assert.equal(f.enters,1);
    assert.equal(f.messages.some(message=>message.type==='FORM_ERROR'),false);
  }finally{f.close();}
});

test('automatic submit observes cost cap; pausing a review releases unsubmitted row',async()=>{
  for(const limit of [20000,50000]){const f=fixture({autoSubmit:true,maxCost:limit});try{f.start();await until(()=>f.messages.some(m=>m.type==='FILLED'));if(limit>25000){await until(()=>f.submits===1);}else{assert.equal(f.submits,0);f.pause();await until(()=>f.messages.some(m=>m.type==='FORM_ERROR'));}}finally{f.close();}}
});

test('corporate automatically selects Invoice when the queue requests Invoice',async()=>{
  const f=fixture({corporate:true,payment:'INVOICE'});try{f.start();await until(()=>f.submits===1);assert.equal(f.d.querySelector('.el-dialog .el-select input').value,'Invoice');}finally{f.close();}
});

test('payment retries an ignored opening click and selects portaled Cash/CREDIT/Invoice without user input',async()=>{
  for(const options of [{}, {corporate:true,payment:'CREDIT'}, {corporate:true,payment:'INVOICE'}]) {
    const f=fixture({...options,transitionPayment:true});
    try {
      f.start();await until(()=>f.submits===1);
      assert.equal(f.paymentOpens,2);
      assert.equal(f.d.querySelector('.select-payment input').value,options.payment==='INVOICE'?'Invoice':options.payment==='CREDIT'?'CREDIT':'Cash');
      assert.equal(f.messages.filter(m=>m.type==='SUBMIT_INTENT').length,1);
      assert.equal(f.messages.some(m=>m.type==='FORM_ERROR'),false);
    } finally { f.close(); }
  }
});

test('next form waits for reference section and ignores hidden old reference before advertising readiness',async()=>{
  const f=fixture({lateReference:true});
  try {
    f.start();await new Promise(resolve=>setTimeout(resolve,250));
    assert.equal(f.messages.some(m=>m.type==='FORM_READY'),false);
    assert.equal(f.messages.some(m=>m.type==='FORM_ERROR'),false);
    await until(()=>f.submits===1);
    assert.equal([...f.d.querySelectorAll('#ref_no')].find(el=>!el.closest('[hidden]')).value,'TEST-1');
    assert.equal(f.receive({type:'CN23_PROBE'}).ready,true);
    assert.equal(f.receive({type:'CN23_PROBE'}).busy,true);
    assert.equal(f.messages.some(m=>m.type==='FORM_ERROR'),false);
  } finally { f.close(); }
});

test('Reset during an asynchronous fill cannot submit or poison the replacement Excel row',async()=>{
  const f=fixture();
  try {
    f.start();await until(()=>f.d.querySelector('#namapenerima').value==='PENERIMA');
    assert.equal(f.receive({type:'CN23_RESET'}).accepted,true);
    f.remount();f.start({recipient_name:'PENERIMA BARU',ref_no:'BARU'},'NEW-TOKEN');
    await until(()=>f.submits===1);
    assert.equal(f.d.querySelector('#namapenerima').value,'PENERIMA BARU');assert.equal(f.d.querySelector('#ref_no').value,'BARU');
    assert.equal(f.messages.filter(m=>m.type==='SUBMIT_INTENT').length,1);
    assert.equal(f.messages.find(m=>m.type==='SUBMIT_INTENT').token,'NEW-TOKEN');
    assert.equal(f.messages.some(m=>m.type==='FORM_ERROR'),false);
  } finally {f.close();}
});
