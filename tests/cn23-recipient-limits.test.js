'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Q=require('../extensions/mile-cn23/queue.js');

test('CN23 recipient limits preserve short text, compact whitespace and enforce exact boundaries',()=>{
  assert.equal(Q.recipientText('  BUDI\n  SANTOSO  ','recipient_name'),'BUDI SANTOSO');
  assert.equal(Q.recipientText('  JL. MAWAR\t NO. 1  ','recipient_address'),'JL. MAWAR NO. 1');
  for(const [field,limit] of [['recipient_name',30],['recipient_address',80]]) {
    assert.equal(Q.recipientText('X'.repeat(limit),field),'X'.repeat(limit));
    assert.equal(Q.recipientText('X'.repeat(limit+1),field),'X'.repeat(limit));
    assert.equal(Q.recipientText('X'.repeat(300),field,20),'X'.repeat(20));
    for(const htmlLimit of [undefined,-1,0,1000])assert.equal(Q.recipientText('X'.repeat(300),field,htmlLimit),'X'.repeat(limit));
  }
});

test('CN23 truncation does not split Unicode surrogate pairs at either recipient boundary',()=>{
  for(const [field,limit] of [['recipient_name',30],['recipient_address',80]]) {
    const prefix='A'.repeat(limit-1);
    assert.equal(Q.recipientText(prefix+'😀 BUDI',field),prefix);
    assert.equal(Q.recipientText('😀'.repeat(limit),field),'😀'.repeat(limit/2));
  }
});

test('Excel import retains long original recipient text for routing and does not reject it before automatic truncation',()=>{
  const row={...Q.defaults,queue_id:'LONG-1',customer_mode:'RITEL',payment_method:'CASH',service_code:'PE',sender_name:'PENGIRIM',sender_address:'BATAM',
    recipient_name:'N'.repeat(4000),recipient_address:'A'.repeat(4500),recipient_postcode:'29274',recipient_city:'INDRAGIRI HILIR',
    recipient_district:'KERITANG',recipient_village:'PENGALIHAN',recipient_province:'RIAU'};
  const stored=Q.validateRows([row])[0].data;
  assert.equal(stored.recipient_name,row.recipient_name);
  assert.equal(stored.recipient_address,row.recipient_address);
  assert.equal(Q.recipientText(stored.recipient_name,'recipient_name'),'N'.repeat(30));
  assert.equal(Q.recipientText(stored.recipient_address,'recipient_address'),'A'.repeat(80));
  assert.throws(()=>Q.validateRows([{...row,shipping_instruction:'X'.repeat(3001)}]),/terlalu panjang/);
  assert.throws(()=>Q.validateRows([{...row,recipient_name:row.recipient_name+' PERLU DICEK'}]),/pemeriksaan/);
});
