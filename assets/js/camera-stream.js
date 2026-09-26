(() => {
  'use strict';

  const BATCH_SIZE = 5;
  const DEEPSEEK_MODEL = 'deepseek-v4.1-flash';

  let sessionId = null;
  let queue = [];
  let pendingTasks = [];
  let completedRows = [];
  let isFinishing = false;
  let globalCaptureIndex = 0;

  function init(id) {
    sessionId = id;
    queue = [];
    pendingTasks = [];
    completedRows = [];
    isFinishing = false;
    globalCaptureIndex = 0;
  }

  function queueCapture(blob) {
    globalCaptureIndex++;
    queue.push({ index: globalCaptureIndex, blob });

    if (queue.length >= BATCH_SIZE) {
      const batch = queue.splice(0, BATCH_SIZE);
      triggerBackgroundProcess(batch);
    }
  }

  async function finishStream() {
    isFinishing = true;
    if (queue.length > 0) {
      const batch = queue.splice(0, queue.length);
      triggerBackgroundProcess(batch);
    }

    if (pendingTasks.length > 0) {
      if (typeof window.updateProcessingStatus === 'function') {
        window.updateProcessingStatus('Mengekstrak AI...', `Menunggu ${pendingTasks.length} antrean gambar terakhir diproses DeepSeek...`);
      }
      await Promise.allSettled(pendingTasks);
    }

    return completedRows;
  }

  function triggerBackgroundProcess(batch) {
    const task = processBatch(batch).catch(err => {
      console.error('Background AI failed for batch:', err);
      completedRows.push({ _error: err.message || 'Terjadi kesalahan jaringan/AI saat memproses gambar.' });
    });
    pendingTasks.push(task);
    
    // Remove from pending tasks once complete
    task.finally(() => {
      pendingTasks = pendingTasks.filter(t => t !== task);
    });
  }

  async function processBatch(batch) {
    if (!batch.length) return;

    // 1. Upload images to R2
    const urls = [];
    for (const item of batch) {
      const url = await uploadToR2(item.blob, item.index);
      if (url) urls.push({ url, index: item.index });
    }

    if (!urls.length) {
      throw new Error('Seluruh gambar dalam antrean gagal diunggah ke penyimpanan sementara.');
    }

    // 2. Call Cosmos AI
    const rows = await callAI(urls);
    
    // 3. Append to completed rows
    completedRows.push(...rows);
  }

  async function uploadToR2(blob, index) {
    try {
      const response = await fetch(`/api/beta/images/${encodeURIComponent(sessionId)}/${index}/first`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'image/jpeg' },
        body: blob
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message || `Gagal menyimpan gambar ke R2 (Status: ${response.status})`);
      }
      return payload?.url || payload?.ref;
  }

  async function callAI(urls) {
    const startIdx = urls[0].index;
    const endIdx = urls[urls.length - 1].index;

    const prompt = `Tolong ubah gambar-gambar resi ini menjadi data terstruktur.
Baca HANYA sebagai HASIL SCAN. Cocokkan tulisan dari gambar, JANGAN menebak yang tidak terbaca, beri "PERLU DICEK" pada bagian meragukan.
Kembalikan HANYA JSON valid tanpa markdown.

Aturan:
1. Urutan sesuai urutan gambar.
2. nama_penerima: Hapus "KEPADA YTH", "ATTN", dan SETIAP kode/resi panjang yang mencampur huruf dengan angka. Contoh: "FAHRUDIN 0028C2025" menjadi "FAHRUDIN". Jangan campur alamat.
3. Abaikan CABANG/CARRIAGE BATAM dan footer transaksi.
4. nomor_hp: Hanya diisi bila ada nomor telp/wa (08..., +62...), abaikan kode mandiri.
5. nomor_surat: PRIORITAS PERTAMA adalah nomor surat resmi setelah label NOMOR/NOMOR SURAT/NO. SURAT/REF. Abaikan nomor perkara. Jika tidak ada, gunakan isi setelah label PERIHAL/HAL/SUBJECT. Setelah itu barulah gunakan ID Pesanan/Resi.
6. di_luar_batam: true HANYA JIKA jelas bukan Kota Batam atau kode pos bukan 294xx. Jika meragukan, false dan tandai alamat_penerima di perlu_dicek_fields.
7. perlu_dicek_fields: array string nama kolom jika ragu dengan bacaan.

Format Wajib:
{"rows":[{"page":1,"nama_penerima":"...","alamat_penerima":"...","nomor_hp":"","nomor_surat":"","di_luar_batam":false,"perlu_dicek_fields":[]}]}
`;

    const content = [{ type: 'text', text: prompt }];
    urls.forEach((item) => {
      content.push({ type: 'text', text: \`GAMBAR \${item.index}\` });
      content.push({ type: 'image_url', image_url: { url: item.url } });
    });

    const body = {
      model: DEEPSEEK_MODEL,
      stream: false,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: 'Anda adalah operator data entri. Utamakan kesetiaan pada gambar. Kembalikan HANYA JSON valid.'
        },
        { role: 'user', content }
      ]
    };

    try {
      const response = await fetch('/api/ai-proxy', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({ body })
      });
      const data = await response.json();
      
      const contentStr = data?.choices?.[0]?.message?.content;
      if (!contentStr) {
         console.error('AI Proxy returned no content. Data:', data);
         throw new Error(data?.error?.message || 'AI Proxy tidak mengembalikan hasil.');
      }
      
      const parsed = JSON.parse(contentStr.replace(/```json/g, '').replace(/```/g, '').trim());
      
      if (Array.isArray(parsed.rows)) {
        // Map the 'page' to the actual capture index based on the input URLs
        // Deepseek might just number them 1..5. We need to map them back.
        return parsed.rows.map((row, idx) => {
           const actualIndex = urls[idx]?.index || (startIdx + idx);
           return { ...row, page: actualIndex };
        });
      }
      return [];
    } catch (err) {
      console.error('AI Proxy failed:', err);
      return [];
    }
  }

  window.MileCameraStream = { init, queueCapture, finishStream };
})();
