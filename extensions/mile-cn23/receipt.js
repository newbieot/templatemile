(() => {
  'use strict';
  if (!MileCN23.receiptId(location.href)) return;
  let sent = false, pending = false, reported = '';
  const started = Date.now();
  function readReceipt() {
    const section = document.getElementById('section-to-print');
    const text = section?.innerText || section?.textContent || '';
    if (!text.trim()) return { reason:'Menunggu isi label resi tampil' };
    const bodyText = document.body.innerText || document.body.textContent || '';
    const codes = [...new Set((text + '\n' + bodyText).match(/\b[A-Z]\d{10,20}\b/g) || [])];
    const transactionCode = text.match(/Kode\s*Transaksi\s*:?\s*(\d{8,30})/i)?.[1] || bodyText.match(/Kode\s*Transaksi\s*:?\s*(\d{8,30})/i)?.[1];
    if (codes.length !== 1) return { reason:codes.length ? 'Label menampilkan lebih dari satu nomor resi' : 'Nomor resi belum terlihat pada label' };
    if (!transactionCode) return { reason:'Kode Transaksi belum terlihat pada label' };
    return { evidence:{ code:codes[0], transactionCode, text } };
  }
  chrome.runtime.onMessage?.addListener((message,_sender,reply)=>{
    if(message.type!=='CN23_RECEIPT_PROBE')return false;
    reply({version:MileCN23.VERSION,...readReceipt()});return false;
  });
  async function inspect() {
    if (sent || pending || typeof document==='undefined' || !document?.documentElement) return;
    const result=readReceipt();
    if(!result.evidence){
      if(result.reason!==reported){reported=result.reason;void chrome.runtime.sendMessage({type:'RECEIPT_STATUS',reason:reported}).catch(()=>{});}
      return;
    }
    pending = true;
    try {
      const reply = await chrome.runtime.sendMessage({ type:'RECEIPT', evidence:result.evidence });
      sent = Boolean(reply?.ok && reply.data?.receiptAccepted);
    } catch (_) { /* Retry if the service worker was waking up. */ }
    finally { pending = false; }
  }
  const observer = new MutationObserver(() => { void inspect(); });
  observer.observe(document.documentElement, { subtree:true, childList:true, characterData:true });
  void inspect();
  const timer = setInterval(() => {
    if (sent || Date.now()-started > 180000) { clearInterval(timer); observer.disconnect(); return; }
    void inspect();
  }, 500);
})();
