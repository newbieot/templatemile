(() => {
  'use strict';
  if (!MileCN23.receiptId(location.href)) return;
  let sent = false, pending = false;
  const started = Date.now();
  async function inspect() {
    if (sent || pending) return;
    const section = document.getElementById('section-to-print');
    const text = section?.innerText || section?.textContent || '';
    if (!text.trim()) return;
    const bodyText = document.body.innerText || document.body.textContent || '';
    const codes = [...new Set((text + '\n' + bodyText).match(/\b[A-Z]\d{10,20}\b/g) || [])];
    const transactionCode = text.match(/Kode\s*Transaksi\s*:?\s*(\d{8,30})/i)?.[1] || bodyText.match(/Kode\s*Transaksi\s*:?\s*(\d{8,30})/i)?.[1];
    if (codes.length !== 1 || !transactionCode) return;
    pending = true;
    try {
      const reply = await chrome.runtime.sendMessage({ type:'RECEIPT', evidence:{ code:codes[0], transactionCode, text } });
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
