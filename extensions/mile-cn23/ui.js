(() => {
  'use strict';
  let menu = null;
  async function request(type, extra = {}) {
    const reply = await chrome.runtime.sendMessage({ type, ...extra });
    if (!reply?.ok) throw new Error(reply?.error || 'Ekstensi belum siap.');
    return reply.data;
  }
  function done(total, held = []) {
    let notice = document.getElementById('mile-cn23-complete');
    if (!notice) { notice = document.createElement('div'); notice.id='mile-cn23-complete'; document.body.append(notice); }
    notice.textContent = `Selesai: seluruh ${total} kiriman dalam antrean sudah dibuat.${held.length ? ` ${held.length} kiriman dari file dilewati karena resi sebelumnya belum pasti.` : ""} Cetak dapat dilakukan belakangan.`;
    notice.setAttribute('role','status');
    notice.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:90vw;padding:16px 24px;background:#166534;color:white;border-radius:12px;box-shadow:0 6px 28px #0004;font:15px Arial';
  }
  function show(tabId, toggle = false) {
    if (menu) { if (toggle) {clearInterval(menu.timer);menu.host.remove();menu=null;void request('PANEL_VISIBILITY',{open:false}).catch(()=>{});} return; }
    const host = document.createElement('aside');host.id='mile-cn23-menu';
    host.style.cssText='position:fixed;right:16px;bottom:16px;width:360px;max-width:calc(100vw - 32px);z-index:2147483647';
    const root = host.attachShadow({mode:'closed'});
    root.innerHTML=`<style>:host{font:14px Arial;color:#112b46}.box{background:white;border:1px solid #cbd5e1;border-radius:14px;padding:18px;box-shadow:0 8px 36px #0005}h3{margin:0 0 12px;font-size:18px}.actions{display:flex;gap:8px;flex-wrap:wrap}button{border:0;border-radius:9px;padding:12px 16px;cursor:pointer;background:#e2e8f0;color:#112b46;font:bold 14px Arial}#start{background:#2563eb;color:white}button:disabled{opacity:.5;cursor:default}p{margin:12px 0 0;line-height:1.45;overflow-wrap:anywhere}small{display:block;margin-top:6px;color:#64748b}#error{color:#b91c1c}#notice{color:#92400e;max-height:160px;overflow:auto}input{display:none}</style><div class="box"><h3>Mile CN23 · ${MileCN23.VERSION}</h3><div class="actions"><button id="upload">Upload Excel</button><button id="start" disabled>Start</button><button id="reset" disabled>Reset</button></div><input id="file" type="file" accept=".xlsx"><p id="status" role="status">Pilih Excel Antrean CN23.</p><small id="fileName"></small><p id="notice" role="status"></p><p id="error" role="alert"></p></div>`;
    document.body.append(host);
    const get=id=>root.getElementById(id);
    let state={rows:[]},busy=false,localError='';
    async function task(fn){if(busy)return;busy=true;localError='';get('error').textContent='';try{await fn();}catch(error){localError=error.message;get('error').textContent=localError;render();}finally{busy=false;}}
    function render(){
      const doneCount=state.rows.filter(row=>row.status==='done').length;
      get('fileName').textContent=state.fileName||'';
      const active=state.rows.find(row=>row.id===state.active?.id);
      const phase=state.active?.submittedAt?'Menunggu resi':state.active?.phase==='customer_loading'?'Memuat pelanggan':state.active?'Mengisi':state.waitingNewForm?'Menunggu form berikutnya':state.running?'Melanjutkan':'Siap';
      get('status').textContent=state.completedAt&&doneCount===state.rows.length
        ? `Selesai: ${doneCount}/${state.rows.length} kiriman.`
        : state.rows.length ? `${doneCount}/${state.rows.length} selesai · ${phase}${active?' · '+active.data.recipient_name:''}${state.skippedCompleted?' · '+state.skippedCompleted+' data yang sudah berhasil dilewati':''}` : state.fileName ? `Tidak ada kiriman baru untuk diproses${state.skippedCompleted?' - '+state.skippedCompleted+' sudah berhasil':''}.` : 'Pilih Excel Antrean CN23.';
      const held=state.skippedPending||[];
      get('notice').textContent=held.length ? `Dilewati dari Excel: ${held.map(row=>'No. '+row.sourceRow+' - '+row.name).join('; ')}. Sudah ditekan Selesai; resi sebelumnya belum terbaca. Periksa transaksi tersebut di Mile. Data lainnya tetap bisa di-Start.` : (state.pendingSubmissions?.length ? `${state.pendingSubmissions.length} transaksi sebelumnya menunggu kepastian resi. Upload Excel; data lainnya tetap bisa diproses.` : '');
      get('error').textContent=state.error||localError;
      if(state.active?.submittedAt)get('status').textContent+=state.receiptWait?' - '+state.receiptWait:' - Menunggu bukti transaksi dari tab resi';
      else if(state.waitingNewForm&&state.formWait)get('status').textContent+=' - '+state.formWait;
      get('start').textContent=state.running?'Jeda':'Start';
      get('start').disabled=!state.running&&(Boolean(state.active)||!state.rows.some(row=>['ready','error'].includes(row.status))||state.rows.some(row=>row.status==='unknown'));
      get('upload').disabled=Boolean(state.active)||state.running;
      get('reset').disabled=!state.rows.length&&!state.fileName&&!localError;
      if(localError&&!state.running)get('start').disabled=true;
      if (!state.completedAt) document.getElementById('mile-cn23-complete')?.remove();
    }
    async function refresh(){state=await request('GET');render();}
    get('upload').addEventListener('click',()=>get('file').click());
    get('file').addEventListener('change',()=>task(async()=>{
      const file=get('file').files[0];if(!file)return;
      if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024)throw new Error('Gunakan Excel Antrean CN23 .xlsx, maksimal 10 MB.');
      const buffer=await file.arrayBuffer();const workbook=XLSX.read(buffer,{type:'array',cellFormula:true});
      if(workbook.SheetNames.length!==1||workbook.SheetNames[0]!=='CN23_ANTREAN')throw new Error('Pilih Antrean CN23, bukan Excel lokal Batam.');
      const sheet=workbook.Sheets.CN23_ANTREAN;
      if(Object.values(sheet).some(cell=>cell?.f))throw new Error('Gunakan hasil ekspor tanpa formula.');
      const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true});MileCN23.validateRows(rows);
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      state=await request('IMPORT',{rows,batchId:digest,fileName:file.name});render();
    }));
    get('start').addEventListener('click',()=>task(async()=>{
      state=await request(state.running?'PAUSE':'RUN',{tabId});render();
    }));
    get('reset').addEventListener('click',()=>task(async()=>{
      state=await request('RESET');get('file').value='';localError='';render();
    }));
    void request('PANEL_VISIBILITY',{open:true}).catch(()=>{});
    menu={host,timer:setInterval(()=>{if(!host.isConnected)document.body.append(host);if(!busy)void refresh().catch(()=>{});},1000)};
    void task(refresh);
  }
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message.type==='CN23_PANEL_TOGGLE'){show(message.tabId,true);reply({accepted:true});}
    else if(message.type==='CN23_BATCH_DONE'){done(message.total,message.held);reply({accepted:true});}
    return false;
  });
  request('PAGE_READY').then(state=>{if(state?.openPanel)show(state.tabId);if(state?.completedAt&&state.done===state.total&&state.total)done(state.total,state.held);}).catch(()=>{});
})();
