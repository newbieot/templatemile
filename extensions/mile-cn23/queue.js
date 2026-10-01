(function(root) {
  'use strict';
  const FORM_URL = 'https://expos.mile.app/new-transaction-custom';
  const defaults = Object.freeze({ workflow:'CN23 DOKUMEN LUAR KOTA',queue_status:'SIAP',cod:'NON-COD',item_type:'DOKUMEN',nature_of_goods:'Documents',shipment_category:'Ecommerce/Biasa',npwp:'000000000000000',hs_code:'49011000',item_name:'DOKUMEN',quantity:1,item_value_idr:20000,weight_kg:0.2,length_cm:0,width_cm:0,height_cm:0,koli_count:1,country_of_origin:'ID',packaging_code:'EN',packaging_name:'Envelope',imei_1:'0',imei_2:'0',insurance:'N' });
  const required = ['queue_id','recipient_name','recipient_address','recipient_postcode','recipient_district','recipient_city','recipient_province','sender_name','sender_address','customer_mode','payment_method','service_code'];
  const norm = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  function validateRows(input) {
    if (!Array.isArray(input) || !input.length || input.length > 2000) throw new Error('Antrean harus berisi 1–2.000 kiriman.');
    const ids = new Set();
    const rows = input.map((original,index) => {
      const fail = message => { throw new Error(`Baris ${index + 2}: ${message}`); };
      const row = {...defaults,...original};
      Object.keys(row).forEach(key => {
        if (typeof row[key] === 'string') row[key] = row[key].trim();
        if (typeof row[key] === 'string' && row[key].length > 3000) fail(`Kolom ${key} terlalu panjang.`);
      });
      required.forEach(key => { if (!String(row[key] ?? '').trim()) fail(`Kolom ${key} belum diisi.`); });
      if (!String(row.recipient_village || '').trim() && norm(row.recipient_region_scope) !== 'DISTRICT POSTCODE') fail('Kelurahan kosong tanpa hasil pencocokan kecamatan/kode pos.');
      if (/PERLU[\s._-]*(?:DI[\s._-]*)?CEK/i.test(String(row.recipient_village || ''))) fail('Kelurahan belum terbaca.');
      if (required.some(key => /PERLU[\s._-]*(?:DI[\s._-]*)?CEK/i.test(String(row[key])))) fail('Selesaikan pemeriksaan data sebelum impor.');
      if (norm(row.workflow) !== norm(defaults.workflow) || norm(row.queue_status) !== 'SIAP') fail('Gunakan Excel Antrean CN23 yang berstatus SIAP.');
      if (/^(?:KOTA )?BATAM$/.test(norm(row.recipient_city))) fail('Tujuan Batam harus masuk Excel lokal tersendiri.');
      if (!/^\d{5}$/.test(String(row.recipient_postcode))) fail('Kode pos tujuan harus 5 digit.');
      if (!['RITEL','KORPORAT'].includes(row.customer_mode)) fail('Pelanggan harus RITEL atau KORPORAT.');
      if (row.customer_mode === 'KORPORAT' && !String(row.customer_code || '').trim()) fail('Kode Pelanggan korporat wajib diisi.');
      if (row.customer_mode === 'RITEL' ? row.payment_method !== 'CASH' : !['INVOICE','CREDIT'].includes(row.payment_method)) fail('Metode pembayaran tidak sesuai jenis pelanggan.');
      for (const [key,value] of Object.entries(defaults)) {
        if (['workflow','queue_status','insurance'].includes(key)) continue;
        if (typeof value === 'number' ? Number(row[key]) !== value : norm(row[key]) !== norm(value)) fail(`Preset dokumen ${key} harus ${value}.`);
        row[key] = value;
      }
      if (!['N','Y'].includes(row.insurance)) fail('Asuransi harus N atau Y.');
      for (const key of ['sender_phone','recipient_phone']) {
        row[key] = String(row[key] || '0');
        if (!/^\+?\d{1,20}$/.test(row[key])) fail(`Periksa nomor telepon ${key}.`);
      }
      row.queue_id = String(row.queue_id);
      if (ids.has(row.queue_id)) fail('ID kiriman berulang dalam file.');
      ids.add(row.queue_id);
      return {id:row.queue_id,data:row,status:'ready',error:'',confirmation:null};
    });
    if (JSON.stringify(rows).length > 5 * 1024 * 1024) throw new Error('Data antrean terlalu besar. Pisahkan menjadi beberapa file.');
    return rows;
  }
  function recoverInterrupted(state,now=Date.now()) {
    if (state.active?.phase === 'payment_ready' || state.active?.phase === 'customer_review') return false;
    if (!state.active || now-state.active.startedAt < 180000) return false;
    const row=state.rows.find(r=>r.id===state.active.id);
    if (row && row.status !== 'done') { row.status=state.active.submittedAt ? 'unknown':'error'; row.error=state.active.submittedAt ? 'Selesai sudah ditekan tetapi Mile belum kembali ke daftar transaksi. Periksa Mile.' : 'Pengisian terputus. Bersihkan form Mile sebelum mencoba isi ulang.'; }
    state.running=false; state.error=row?.error || 'Proses terputus.';
    if (!state.active.submittedAt) state.active=null;
    return true;
  }
  const VERSION='0.2.6';
  const api={VERSION,FORM_URL,defaults,required,norm,validateRows,recoverInterrupted};
  root.MileCN23=api;
  if (typeof module !== 'undefined') module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
