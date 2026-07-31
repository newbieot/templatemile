
        let uploadedFilesManager = [];
        let fileProcessQueue = [];
        let currentWorkbook = null;
        let currentFileName = "";
        let currentHeaders = [];
        let tempExtractedRows = []; 

        // ================= DATABASE BATAM =================
        const batamKelurahanMapping = [
            { keyword: 'TELUK TERING', code: '29411' }, { keyword: 'SUNGAI PANAS', code: '29412' },
            { keyword: 'BALOI PERMAI', code: '29413' }, { keyword: 'TAMAN BALOI', code: '29413' },
            { keyword: 'BELIAN', code: '29414' }, { keyword: 'SUKAJADI', code: '29415' },
            { keyword: 'BATU BESAR', code: '29416' }, { keyword: 'NGENANG', code: '29416' },
            { keyword: 'KABIL', code: '29417' }, { keyword: 'SAMBAU', code: '29419' },
            { keyword: 'TANJUNG SENGKUANG', code: '29421' }, { keyword: 'BATU MERAH', code: '29422' },
            { keyword: 'SUNGAI JODOH', code: '29423' }, { keyword: 'KAMPUNG SERAYA', code: '29424' },
            { keyword: 'SADAI', code: '29426' }, { keyword: 'BENGKONG INDAH', code: '29427' },
            { keyword: 'BENGKONG LAUT', code: '29428' }, { keyword: 'TANJUNG BUNTUNG', code: '29429' },
            { keyword: 'BATU SELICIN', code: '29431' }, { keyword: 'KAMPUNG PELITA', code: '29433' },
            { keyword: 'LUBUK BAJA KOTA', code: '29434' }, { keyword: 'TANJUNG UMA', code: '29435' },
            { keyword: 'BALOI INDAH', code: '29436' }, { keyword: 'BULIANG', code: '29441' },
            { keyword: 'KIBING', code: '29442' }, { keyword: 'BUKIT TEMPAYAN', code: '29443' },
            { keyword: 'TANJUNG UNCANG', code: '29444' }, { keyword: 'TANJUNG RIAU', code: '29445' },
            { keyword: 'TIBAN LAMA', code: '29445' }, { keyword: 'TIBAN INDAH', code: '29446' },
            { keyword: 'PATAM LESTARI', code: '29447' }, { keyword: 'TANJUNG PINGGIR', code: '29448' },
            { keyword: 'SUNGAI HARAPAN', code: '29448' }, { keyword: 'TIBAN BARU', code: '29449' },
            { keyword: 'SAGULUNG KOTA', code: '29451' }, { keyword: 'TEMBESI', code: '29452' },
            { keyword: 'SUNGAI BINTI', code: '29453' }, { keyword: 'SUNGAI LEKOP', code: '29454' },
            { keyword: 'SUNGAI LANGKAI', code: '29455' }, { keyword: 'SUNGAI PELUNGGUT', code: '29456' },
            { keyword: 'DURIANGKANG', code: '29461' }, { keyword: 'MANGSANG', code: '29462' },
            { keyword: 'MUKA KUNING', code: '29463' }, { keyword: 'TANJUNG PIAYU', code: '29464' },
            { keyword: 'BULANG LINTANG', code: '29471' }, { keyword: 'PULAU BULUH', code: '29472' },
            { keyword: 'PANTAI GELAM', code: '29473' }, { keyword: 'BATU LEGONG', code: '29474' },
            { keyword: 'TEMOYONG', code: '29475' }, { keyword: 'PULAU SETOKOK', code: '29476' },
            { keyword: 'SEMBULANG', code: '29481' }, { keyword: 'REMPANG CATE', code: '29482' },
            { keyword: 'SUBANG MAS', code: '29483' }, { keyword: 'AIR RAJA', code: '29483' },
            { keyword: 'GALANG BARU', code: '29484' }, { keyword: 'SIJANTUNG', code: '29485' },
            { keyword: 'KARAS', code: '29486' }, { keyword: 'PULAU ABANG', code: '29487' },
            { keyword: 'TANJUNG SARI', code: '29491' }, { keyword: 'PEMPING', code: '29492' },
            { keyword: 'KASU', code: '29493' }, { keyword: 'PECONG', code: '29494' },
            { keyword: 'SEKANAK RAYA', code: '29495' }, { keyword: 'PULAU TERUNG', code: '29496' }
        ];

        const batamKecamatanMapping = [
            { keyword: 'BATAM KOTA', code: '29411' }, { keyword: 'NONGSA', code: '29416' },
            { keyword: 'BATU AMPAR', code: '29421' }, { keyword: 'BENGKONG', code: '29426' },
            { keyword: 'LUBUK BAJA', code: '29431' }, { keyword: 'BATU AJI', code: '29441' },
            { keyword: 'BATUAJI', code: '29441' }, { keyword: 'SEKUPANG', code: '29445' },
            { keyword: 'SAGULUNG', code: '29451' }, { keyword: 'SEI BEDUK', code: '29461' },
            { keyword: 'BULANG', code: '29471' }, { keyword: 'GALANG', code: '29481' },
            { keyword: 'BELAKANG PADANG', code: '29491' }
        ];

        // ================= DATABASE TANJUNG PINANG (Khusus MENSA) =================
        const tpiKelurahanMapping = [
            { keyword: 'TANJUNG PINANG TIMUR', code: '29122' }, { keyword: 'TANJUNG PINANG BARAT', code: '29113' },
            { keyword: 'TANJUNG PINANG KOTA', code: '29111' }, { keyword: 'TANJUNG AYUN SAKTI', code: '29124' },
            { keyword: 'BATU IX (SEMBILAN)', code: '29125' }, { keyword: 'BATU IX', code: '29125' },
            { keyword: 'BATU 9', code: '29125' }, { keyword: 'BATU SEMBILAN', code: '29125' },
            { keyword: 'MELAYU KOTA PIRING', code: '29123' }, { keyword: 'TANJUNG UNGGAT', code: '29122' },
            { keyword: 'KAMPUNG BULANG', code: '29122' }, { keyword: 'PINANG KENCANA', code: '29122' },
            { keyword: 'KAMPUNG BUGIS', code: '29115' }, { keyword: 'BUKIT CERMIN', code: '29111' },
            { keyword: 'KAMPUNG BARU', code: '29113' }, { keyword: 'SENGGARANG', code: '29111' },
            { keyword: 'PENYENGAT', code: '29114' }, { keyword: 'SEI JANG', code: '29124' },
            { keyword: 'AIR RAJA', code: '29122' }, { keyword: 'KEMBOJA', code: '29112' },
            { keyword: 'DOMPAK', code: '29124' }
        ];

        const tpiKecamatanMapping = [
            { keyword: 'TANJUNG PINANG BARAT', code: '29111' }, { keyword: 'TANJUNG PINANG TIMUR', code: '29122' },
            { keyword: 'TANJUNG PINANG KOTA', code: '29115' }, { keyword: 'BUKIT BESTARI', code: '29124' }
        ];

        document.addEventListener("DOMContentLoaded", () => {
            handleModeChange();
        });

        // MANAJEMEN UI BERDASARKAN MODE (KORPORAT vs RITEL)
        function handleModeChange() {
            const mode = document.getElementById('clientMode').value;
            const wrapTemplate = document.getElementById('wrapTemplate');
            const cardPengirim = document.getElementById('cardDataPengirim');
            const wrapCustId = document.getElementById('wrapCustomerId');
            const wrapSName = document.getElementById('wrapSenderName');
            const wrapSPhone = document.getElementById('wrapSenderPhone');
            const wrapSAddr = document.getElementById('wrapSenderAddress');
            const wrapTariff = document.getElementById('wrapTariffCode');
            const wrapItemType = document.getElementById('wrapItemType');
            const tariffInput = document.getElementById('tariffCode');

            if (mode === 'KORPORAT') {
                wrapTemplate.style.display = 'block';
                wrapTariff.style.display = 'block';
                wrapSPhone.style.display = 'none';
                wrapSAddr.style.display = 'none';
                wrapItemType.classList.add('full-width');
                
                handleTemplateChange(); 
            } 
            else if (mode === 'RITEL') {
                wrapTemplate.style.display = 'none';
                cardPengirim.style.display = 'block'; 
                wrapCustId.style.display = 'none';
                wrapSName.style.display = 'block';
                wrapSPhone.style.display = 'block';
                wrapSAddr.style.display = 'block';
                wrapTariff.style.display = 'none'; 
                wrapItemType.classList.remove('full-width');
                wrapItemType.style.gridColumn = 'span 2';

                tariffInput.value = "";
                tariffInput.readOnly = false;
            }

            uploadedFilesManager = [];
            updateInterface();
        }

        // LOGIKA PENYEMBUNYIAN KARTU PENGIRIM BERDASARKAN TEMPLATE
        function handleTemplateChange() {
            const template = document.getElementById('corporateTemplate').value;
            const mode = document.getElementById('clientMode').value;
            const cardPengirim = document.getElementById('cardDataPengirim');
            const wrapSName = document.getElementById('wrapSenderName');
            const wrapCustId = document.getElementById('wrapCustomerId');
            const custIdInput = document.getElementById('customerId');
            const sNameInput = document.getElementById('senderName');
            const tariffInput = document.getElementById('tariffCode');
            const serviceInput = document.getElementById('serviceCode');
            const itemInput = document.getElementById('itemType');

            if (mode !== 'KORPORAT') return;

            custIdInput.readOnly = false;
            sNameInput.readOnly = false;
            tariffInput.readOnly = false;
            
            if (template === 'MANUAL') {
                cardPengirim.style.display = 'block'; 
                wrapSName.style.display = 'block'; 
                wrapCustId.style.display = 'block';
                custIdInput.value = "";
                sNameInput.value = "";
                tariffInput.value = "";
            } else {
                cardPengirim.style.display = 'none'; // Sembunyikan Data Pengirim!
                
                if (template === 'PN_BATAM') {
                    custIdInput.value = "LNMAPN01294A";
                    tariffInput.value = "897924";
                    tariffInput.readOnly = true;
                    itemInput.value = 'DOKUMEN'; 
                } else if (template === 'MENSA') {
                    custIdInput.value = "DAGMBS01294A";
                    sNameInput.value = "MENSA BINA SUKSES BATAM";
                    tariffInput.value = "914556";
                    tariffInput.readOnly = true;
                } else if (template === 'TOYOTA') {
                    custIdInput.value = "FINTOYOTA02294A";
                    sNameInput.value = "PT TOYOTA ASTRA FINANCE";
                    tariffInput.value = "";
                } else if (template === 'MPM_FINANCE') {
                    custIdInput.value = "FINMPMJKT04120A";
                    sNameInput.value = "PT JACCS MPM FINANCE INDONESIA";
                    tariffInput.value = "868523";
                    tariffInput.readOnly = true;
                    serviceInput.value = "PKH";
                } else if (template === 'POLRES') {
                    custIdInput.value = "LNPOLRES01294A";
                    sNameInput.value = "SATLANTAS POLRESTA BARELANG POLDA KEPULAUAN RIAU";
                    tariffInput.value = "";
                }
            }
            updateInterface();
        }

        const dropzone = document.getElementById('dropzone');
        ['dragenter', 'dragover'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.add('dragover'); }));
        ['dragleave', 'drop'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.remove('dragover'); }));
        dropzone.addEventListener('drop', e => handleFileSelection(e.dataTransfer.files));

        function handleFileSelection(files) {
            for (let file of files) {
                if (!uploadedFilesManager.some(f => f.name === file.name)) {
                    fileProcessQueue.push(file);
                }
            }
            document.getElementById('excelInput').value = "";
            processNextInQueue();
        }

        function processNextInQueue() {
            if (fileProcessQueue.length === 0) return; 

            const file = fileProcessQueue.shift();
            currentFileName = file.name;
            const fileExt = file.name.split('.').pop().toLowerCase();

            // CABANG LOGIKA: JIKA PDF LEMPAR KE AI, JIKA BUKAN PROSES SEBAGAI EXCEL/CSV
            if (fileExt === 'pdf') {
                processPDFFile(file);
            } else {
                processExcelFile(file);
            }
        }

        // ================= FUNGSI PROSES DOKUMEN PDF VIA API HUGGING FACE =================
        async function processPDFFile(file) {
            document.getElementById('loadingModal').style.display = 'flex';

            const formData = new FormData();
            formData.append("file", file);

            try {
                // Endpoint mengarah langsung ke server API Hugging Face Bapak
                // Ganti baris fetch lama menjadi seperti ini:
const response = await fetch("http://127.0.0.1:8000/extract", {
                    method: "POST",
                    body: formData
                });

                const result = await response.json();
                document.getElementById('loadingModal').style.display = 'none';

                if (result.status === "success") {
                    let aiData = result.data;
                    // Antisipasi jika data dibungkus dalam {"data": [...]} berdasarkan Llama-3 output
                    if (aiData.data) { aiData = aiData.data; }
                    
                    let extractedRows = [];
                    const templateVal = document.getElementById('corporateTemplate').value;

                    // Mengurai array JSON yang dikembalikan Llama-3
                    aiData.forEach(item => {
                        let cleanName = cleanArtifacts(item.nama);
                        let cleanAddr = cleanArtifacts(item.alamat);
                        let cleanPhone = cleanPhoneNumber(item.hp);
                        let cleanRef = cleanReference(item.ref);
                        
                        let targetZipCode = getZipCodeFromAddress(cleanAddr, templateVal);

                        if (cleanName || cleanAddr || cleanRef) {
                            extractedRows.push({
                                senderName: "", 
                                noSurat: cleanRef,
                                name: cleanName,
                                phone: cleanPhone,
                                zip: targetZipCode,
                                address: cleanAddr,
                                act: 0.1, p: 10, l: 10, t: 10, cw: "0.10"
                            });
                        }
                    });

                    if(extractedRows.length === 0) {
                        alert("AI gagal menemukan data valid di PDF ini.");
                        processNextInQueue();
                        return;
                    }

                    const itemType = document.getElementById('itemType').value;
                    if (itemType === 'PAKET') {
                        tempExtractedRows = extractedRows;
                        showWeightModal();
                    } else {
                        uploadedFilesManager.push({ id: Date.now(), name: currentFileName, rows: extractedRows });
                        updateInterface();
                        processNextInQueue();
                    }

                } else {
                    alert("Error pada AI Backend: " + result.message);
                    processNextInQueue();
                }
            } catch (error) {
                document.getElementById('loadingModal').style.display = 'none';
                alert("Gagal menghubungi server AI. Pastikan Space Hugging Face 'newbieot/mile' sedang Running. Info: " + error.message);
                processNextInQueue();
            }
        }

        // ================= FUNGSI PROSES EXCEL LOKAL (LOGIKA LAMA) =================
        function processExcelFile(file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentWorkbook = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
                
                const firstSheetName = currentWorkbook.SheetNames[0];
                const worksheet = currentWorkbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});

                currentHeaders = [];
                for (let r = 0; r < Math.min(jsonData.length, 10); r++) {
                    if (jsonData[r] && jsonData[r].length > 0) {
                        currentHeaders = jsonData[r];
                        break;
                    }
                }

                showMappingModal(currentHeaders);
            };
            reader.readAsArrayBuffer(file);
        }

        function showMappingModal(headers) {
            document.getElementById('mappingFileName').innerText = "📍 File: " + currentFileName;

            const selects = ['mapName', 'mapAddress', 'mapPhone', 'mapRef', 'mapSenderName', 'mapWeight', 'mapP', 'mapL', 'mapT'];
            selects.forEach(id => {
                const el = document.getElementById(id);
                el.innerHTML = '<option value="-1">-- KOSONG / ABAIKAN --</option>';
                headers.forEach((h, index) => {
                    let val = h ? String(h).trim() : `Kolom ${index + 1}`;
                    el.innerHTML += `<option value="${index}">${val}</option>`;
                });
            });

            headers.forEach((h, index) => {
                if(!h) return;
                let text = String(h).toUpperCase().trim();
                
                if (text.includes('NAMA') || text.includes('PEMILIK') || text.includes('PENERIMA')) {
                    if(document.getElementById('mapName').value == "-1") document.getElementById('mapName').value = index;
                }
                if (text.includes('ALAMAT') || text.includes('ADDRESS')) {
                    if(document.getElementById('mapAddress').value == "-1") document.getElementById('mapAddress').value = index;
                }
                if (text.includes('HP') || text.includes('TELP') || text.includes('PHONE')) {
                    if(document.getElementById('mapPhone').value == "-1") document.getElementById('mapPhone').value = index;
                }
                if (text.includes('SURAT') || text.includes('REF') || text.includes('DESKRIPSI') || text.includes('TNKB') || text.includes('PLAT') || text.includes('AWB')) {
                    if(document.getElementById('mapRef').value == "-1") document.getElementById('mapRef').value = index;
                }
                if (text === 'BERAT' || text === 'KG' || text === 'WEIGHT' || text === 'BERAT AKTUAL' || text.includes('BERAT')) {
                    if(document.getElementById('mapWeight').value == "-1") document.getElementById('mapWeight').value = index;
                }
                if (text === 'P' || text === 'PANJANG' || text === 'LENGTH') {
                    if(document.getElementById('mapP').value == "-1") document.getElementById('mapP').value = index;
                }
                if (text === 'L' || text === 'LEBAR' || text === 'WIDTH') {
                    if(document.getElementById('mapL').value == "-1") document.getElementById('mapL').value = index;
                }
                if (text === 'T' || text === 'TINGGI' || text === 'HEIGHT') {
                    if(document.getElementById('mapT').value == "-1") document.getElementById('mapT').value = index;
                }
            });

            document.getElementById('mappingModal').style.display = 'flex';
        }

        function skipCurrentMapping() {
            document.getElementById('mappingModal').style.display = 'none';
            processNextInQueue();
        }

        function applyMappingAndProcess() {
            document.getElementById('mappingModal').style.display = 'none';
            const templateVal = document.getElementById('corporateTemplate').value;

            const idxName = parseInt(document.getElementById('mapName').value);
            const idxAddr = parseInt(document.getElementById('mapAddress').value);
            const idxPhone = parseInt(document.getElementById('mapPhone').value);
            const idxRef = parseInt(document.getElementById('mapRef').value);
            const idxSenderName = parseInt(document.getElementById('mapSenderName').value);
            
            const idxWeight = parseInt(document.getElementById('mapWeight').value);
            const idxP = parseInt(document.getElementById('mapP').value);
            const idxL = parseInt(document.getElementById('mapL').value);
            const idxT = parseInt(document.getElementById('mapT').value);

            let extractedRows = [];

            currentWorkbook.SheetNames.forEach(sheetName => {
                const worksheet = currentWorkbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});

                if (jsonData.length > 0) {
                    for (let i = 0; i < jsonData.length; i++) { 
                        let row = jsonData[i];
                        if (!row || row.length === 0) continue;

                        if (
                            (idxName !== -1 && String(row[idxName]).toUpperCase() === String(currentHeaders[idxName]).toUpperCase()) ||
                            (idxAddr !== -1 && String(row[idxAddr]).toUpperCase() === String(currentHeaders[idxAddr]).toUpperCase())
                        ) {
                            continue;
                        }

                        let rawName = idxName !== -1 ? row[idxName] : "";
                        let rawAddr = idxAddr !== -1 ? row[idxAddr] : "";
                        let rawPhone = idxPhone !== -1 ? row[idxPhone] : "0";
                        let rawRef = idxRef !== -1 ? row[idxRef] : "";
                        let rawSenderName = idxSenderName !== -1 ? row[idxSenderName] : "";
                        
                        let rawWeight = idxWeight !== -1 ? row[idxWeight] : "";
                        let rawP = idxP !== -1 ? row[idxP] : "";
                        let rawL = idxL !== -1 ? row[idxL] : "";
                        let rawT = idxT !== -1 ? row[idxT] : "";

                        let cleanName = cleanArtifacts(rawName);
                        let cleanAddr = cleanArtifacts(rawAddr);
                        let cleanPhone = cleanPhoneNumber(rawPhone);
                        let cleanRef = cleanReference(rawRef);
                        let cleanSenderName = cleanReference(rawSenderName); 
                        
                        // Gunakan algoritma 2 Database tergantung Klien
                        let targetZipCode = getZipCodeFromAddress(cleanAddr, templateVal);
                        
                        let parsedW = parseFloat(String(rawWeight).replace(',', '.')) || "";
                        let parsedP = parseFloat(String(rawP).replace(',', '.')) || "";
                        let parsedL = parseFloat(String(rawL).replace(',', '.')) || "";
                        let parsedT = parseFloat(String(rawT).replace(',', '.')) || "";

                        if (!cleanName && !cleanAddr && !cleanRef && !cleanSenderName) continue;

                        extractedRows.push({ 
                            senderName: cleanSenderName, 
                            noSurat: cleanRef, 
                            name: cleanName, 
                            phone: cleanPhone, 
                            zip: targetZipCode, 
                            address: cleanAddr,
                            act: parsedW, p: parsedP, l: parsedL, t: parsedT
                        });
                    }
                }
            });
            
            if (extractedRows.length === 0) {
                alert(`Gagal menemukan data di file "${currentFileName}".`);
                processNextInQueue();
                return;
            }

            const itemType = document.getElementById('itemType').value;
            if (itemType === 'PAKET') {
                tempExtractedRows = extractedRows;
                showWeightModal();
            } else {
                extractedRows.forEach(row => {
                    row.cw = "0.10"; row.p = 10; row.l = 10; row.t = 10; row.act = 0.1;
                });
                uploadedFilesManager.push({ id: Date.now(), name: currentFileName, rows: extractedRows });
                updateInterface();
                processNextInQueue(); 
            }
        }

        function showWeightModal() {
            const container = document.getElementById('weightListContainer');
            container.innerHTML = '';
            
            tempExtractedRows.forEach((row, index) => {
                container.innerHTML += `
                    <div class="weight-row">
                        <div class="weight-info">
                            <strong>${index+1}. ${row.name}</strong>
                            <span>${row.address}</span>
                        </div>
                        <div class="weight-calc-grid">
                            <div class="weight-input-group">
                                <label>Actual (Kg)</label>
                                <input type="number" step="0.1" min="0.1" class="w-act" data-index="${index}" value="${row.act || ''}" placeholder="1" oninput="calculateCW(${index})">
                            </div>
                            <div class="weight-input-group">
                                <label>Panjang (cm)</label>
                                <input type="number" class="w-p" data-index="${index}" value="${row.p || ''}" placeholder="10" oninput="calculateCW(${index})">
                            </div>
                            <div class="weight-input-group">
                                <label>Lebar (cm)</label>
                                <input type="number" class="w-l" data-index="${index}" value="${row.l || ''}" placeholder="10" oninput="calculateCW(${index})">
                            </div>
                            <div class="weight-input-group">
                                <label>Tinggi (cm)</label>
                                <input type="number" class="w-t" data-index="${index}" value="${row.t || ''}" placeholder="10" oninput="calculateCW(${index})">
                            </div>
                            <div class="cw-result">
                                <span style="font-size:0.6rem; color:#0277bd; font-weight:bold;">CHARGEABLE WEIGHT</span><br>
                                <span id="cw-text-${index}" style="font-size:1.1rem; font-weight:900; color:var(--pos-orange);">0.00 Kg</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            document.getElementById('weightModal').style.display = 'flex';

            setTimeout(() => {
                tempExtractedRows.forEach((_, index) => calculateCW(index));
            }, 50);
        }

        function calculateCW(index) {
            const rowDiv = document.querySelector(`.w-act[data-index="${index}"]`).closest('.weight-row');
            const actStr = rowDiv.querySelector('.w-act').value.replace(',', '.');
            const act = parseFloat(actStr) || 0; 
            const p = parseFloat(rowDiv.querySelector('.w-p').value) || 0;
            const l = parseFloat(rowDiv.querySelector('.w-l').value) || 0;
            const t = parseFloat(rowDiv.querySelector('.w-t').value) || 0;
            
            const volumetric = (p * l * t) / 6000;
            const chargeableWeight = Math.max(act, volumetric);
            
            rowDiv.querySelector(`#cw-text-${index}`).innerText = chargeableWeight.toFixed(2) + " Kg";
        }

        function cancelWeightInput() {
            document.getElementById('weightModal').style.display = 'none';
            tempExtractedRows = [];
            processNextInQueue();
        }

        function saveWeightsAndProcess() {
            const actInputs = document.querySelectorAll('.w-act');
            actInputs.forEach(input => {
                const idx = input.getAttribute('data-index');
                const rowDiv = input.closest('.weight-row');
                
                const act = parseFloat(input.value.replace(',', '.')) || 0.1;
                const p = parseFloat(rowDiv.querySelector('.w-p').value) || 10;
                const l = parseFloat(rowDiv.querySelector('.w-l').value) || 10;
                const t = parseFloat(rowDiv.querySelector('.w-t').value) || 10;
                
                const vol = (p * l * t) / 6000;
                const cw = Math.max(act, vol);

                tempExtractedRows[idx].act = act;
                tempExtractedRows[idx].p = p;
                tempExtractedRows[idx].l = l;
                tempExtractedRows[idx].t = t;
                tempExtractedRows[idx].cw = cw.toFixed(2);
            });

            uploadedFilesManager.push({ id: Date.now(), name: currentFileName, rows: tempExtractedRows });
            
            tempExtractedRows = [];
            document.getElementById('weightModal').style.display = 'none';
            
            updateInterface();
            processNextInQueue();
        }

        function cleanArtifacts(text) {
            if (!text) return "";
            let str = String(text).replace(/pdf\s*\+?\s*\d*/gi, '');
            return str.replace(/[^A-Za-z0-9\s.,]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
        }

        function cleanReference(text) { 
            if (!text) return "";
            let str = String(text).replace(/pdf\s*\+?\s*\d*/gi, '');
            return str.replace(/[^A-Za-z0-9\s/\-.,_]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
        }

        function cleanPhoneNumber(phone) {
            if (!phone) return "0";
            let str = String(phone).replace(/[^0-9]/g, ''); 
            str = str.replace(/^0+/, '0'); // Basmi Double Zero
            if (!str) return "0";
            if (str.startsWith('62')) { str = '0' + str.slice(2); }
            if (!str.startsWith('0')) { str = '0' + str; }
            return str;
        }

        // ALGORITMA MULTI-CITY (BATAM vs TANJUNG PINANG)
        function getZipCodeFromAddress(address, template) {
            const addrUpper = String(address).toUpperCase();

            // Tentukan Database yang Aktif
            let activeKelMapping = (template === 'MENSA') ? tpiKelurahanMapping : batamKelurahanMapping;
            let activeKecMapping = (template === 'MENSA') ? tpiKecamatanMapping : batamKecamatanMapping;
            let defaultZip = (template === 'MENSA') ? "29111" : "29411";

            let bestKelurahanCode = null;
            let highestKelIndex = -1;

            for (let item of activeKelMapping) {
                let matchIndex = addrUpper.lastIndexOf(item.keyword);
                if (matchIndex > -1 && matchIndex > highestKelIndex) {
                    highestKelIndex = matchIndex;
                    bestKelurahanCode = item.code;
                }
            }
            if (bestKelurahanCode) return bestKelurahanCode;

            let bestKecamatanCode = null;
            let highestKecIndex = -1;

            for (let item of activeKecMapping) {
                let matchIndex = addrUpper.lastIndexOf(item.keyword);
                if (matchIndex > -1 && matchIndex > highestKecIndex) {
                    highestKecIndex = matchIndex;
                    bestKecamatanCode = item.code;
                }
            }
            if (bestKecamatanCode) return bestKecamatanCode;

            return defaultZip;
        }

        function deleteFileFromQueue(id) {
            uploadedFilesManager = uploadedFilesManager.filter(f => f.id !== id);
            updateInterface();
        }

        function updateInterface() {
            const fileQueueDiv = document.getElementById('fileQueue');
            if (uploadedFilesManager.length === 0) {
                fileQueueDiv.innerHTML = `<div style="text-align: center; color: #888; font-size: 0.75rem; padding: 15px; font-style: italic;">Antrean kosong.</div>`;
            } else {
                fileQueueDiv.innerHTML = "";
                uploadedFilesManager.forEach(file => {
                    fileQueueDiv.innerHTML += `
                        <div class="file-item">
                            <span style="font-weight:600;">📄 ${file.name} (${file.rows.length} Baris)</span>
                            <button class="btn-delete-file" onclick="deleteFileFromQueue(${file.id})">Hapus</button>
                        </div>`;
                });
            }

            const useInsurance = document.getElementById('useInsurance').checked;
            const thead = document.querySelector('#resultTable thead');
            thead.innerHTML = `
                <tr>
                    <th style="width: 3%; text-align: center;">NO</th>
                    <th style="width: 13%;">PENGIRIM</th>
                    <th style="width: 12%;">REF/SURAT</th>
                    <th style="width: 15%;">PENERIMA</th>
                    <th style="width: 10%;">NO HP</th>
                    <th style="width: 7%;">KODEPOS</th>
                    <th style="width: 7%;">BERAT(KG)</th>
                    <th style="width: 8%;">PxLxT</th>
                    ${useInsurance ? '<th style="width: 10%;">NILAI BRG(Rp)</th>' : ''}
                    <th style="width: 15%;">ALAMAT</th>
                </tr>
            `;

            const tbody = document.querySelector('#resultTable tbody');
            tbody.innerHTML = '';
            let counter = 0;

            uploadedFilesManager.forEach(file => {
                file.rows.forEach(item => {
                    counter++;
                    const tr = document.createElement('tr');
                    
                    let insColumn = useInsurance ? `<td><input type="number" class="table-input val-ins-harga" value="0" style="color:#2e7d32; font-weight:bold;"></td>` : ``;

                    tr.innerHTML = `
                        <td style="text-align:center; font-weight:bold; color:var(--pos-orange);">${counter}</td>
                        <td><input type="text" class="table-input val-senderName" value="${item.senderName || ''}"></td>
                        <td><input type="text" class="table-input val-noSurat" value="${item.noSurat || ''}"></td>
                        <td><input type="text" class="table-input val-name" value="${item.name || ''}"></td>
                        <td><input type="text" class="table-input val-phone" value="${item.phone || ''}"></td>
                        <td><input type="text" class="table-input val-zip" style="font-weight:bold; color:#d32f2f;" value="${item.zip || ''}"></td>
                        
                        <td><input type="text" class="table-input val-cw" style="font-weight:bold; color:#0277bd;" value="${item.cw || '0.10'}"></td>
                        
                        <td>
                            <div class="dim-box">
                                <input type="text" class="val-p" value="${item.p || 10}">x
                                <input type="text" class="val-l" value="${item.l || 10}">x
                                <input type="text" class="val-t" value="${item.t || 10}">
                            </div>
                        </td>
                        
                        ${insColumn}
                        
                        <td><input type="text" class="table-input val-address" value="${item.address || ''}"></td>
                    `;
                    tbody.appendChild(tr);
                });
            });

            if (counter === 0) {
                tbody.innerHTML = `<tr><td colspan="${useInsurance ? 10 : 9}" style="text-align: center; color: #888; padding: 40px; font-style: italic;">Tarik file Excel/PDF ke panel kiri untuk memulai.</td></tr>`;
            }
        }

        function downloadFinalExcel() {
            const rows = document.querySelectorAll('#resultTable tbody tr');
            if (rows.length === 0 || rows[0].querySelector('input') === null) {
                alert("Tidak ada data untuk diekspor."); return;
            }

            const mode = document.getElementById('clientMode').value;
            const template = document.getElementById('corporateTemplate').value;
            const useInsurance = document.getElementById('useInsurance').checked;
            
            let finalCustomerId = "";
            let finalTariffCode = "";
            let baseSenderName = "";
            let baseSenderPhone = "0";
            let baseSenderAddress = "";
            const serviceCode = document.getElementById('serviceCode').value.toUpperCase();
            const itemType = document.getElementById('itemType').value.toUpperCase();
            
            const paymentType = mode === 'RITEL' ? "CASH" : "INVOICE";
            let destZoneCode = (template === 'MENSA') ? "29100" : "29400";
            
            let finalExportRows = [];

            if (mode === 'KORPORAT') {
                finalCustomerId = cleanArtifacts(document.getElementById('customerId').value);
                finalTariffCode = document.getElementById('tariffCode').value.trim().toUpperCase();
                
                if (template === 'MANUAL') {
                    baseSenderName = cleanArtifacts(document.getElementById('senderName').value);
                } else if (template === 'PN_BATAM') {
                    baseSenderName = "PENGADILAN NEGERI BATAM";
                } else if (template === 'MENSA') {
                    baseSenderName = "MENSA BINA SUKSES BATAM";
                } else if (template === 'TOYOTA') {
                    baseSenderName = "PT TOYOTA ASTRA FINANCE";
                } else if (template === 'MPM_FINANCE') {
                    baseSenderName = "PT JACCS MPM FINANCE INDONESIA";
                } else if (template === 'POLRES') {
                    baseSenderName = "SATLANTAS POLRESTA BARELANG POLDA KEPULAUAN RIAU";
                }
            } else if (mode === 'RITEL') {
                finalCustomerId = ""; 
                finalTariffCode = ""; 
                baseSenderName = cleanArtifacts(document.getElementById('senderName').value);
                baseSenderPhone = cleanPhoneNumber(document.getElementById('senderPhone').value);
                baseSenderAddress = cleanArtifacts(document.getElementById('senderAddress').value);
            }

            rows.forEach((tr, index) => {
                let dSenderName = cleanReference(tr.querySelector('.val-senderName').value);
                let dNoSurat = cleanReference(tr.querySelector('.val-noSurat').value);
                let dName = cleanArtifacts(tr.querySelector('.val-name').value);
                let dPhone = cleanPhoneNumber(tr.querySelector('.val-phone').value);
                let dZip = cleanArtifacts(tr.querySelector('.val-zip').value); 
                let dAddress = cleanArtifacts(tr.querySelector('.val-address').value);
                
                let dWeightStr = tr.querySelector('.val-cw').value.replace(',', '.');
                let dWeight = parseFloat(dWeightStr) || 0.1;

                let dP = parseFloat(tr.querySelector('.val-p').value) || 10;
                let dL = parseFloat(tr.querySelector('.val-l').value) || 10;
                let dT = parseFloat(tr.querySelector('.val-t').value) || 10;

                let dHargaBarang = 0;
                if (useInsurance) {
                    dHargaBarang = parseFloat(tr.querySelector('.val-ins-harga').value) || 0;
                }

                let senderNameFinal, senderAddrFinal, senderPhoneFinal;

                if (mode === 'KORPORAT' && template === 'PN_BATAM') {
                    senderNameFinal = dSenderName ? dSenderName : cleanArtifacts(dNoSurat); 
                    senderAddrFinal = baseSenderName;
                    senderPhoneFinal = "0";
                } else if (mode === 'KORPORAT') {
                    senderNameFinal = dSenderName ? dSenderName : baseSenderName;
                    senderAddrFinal = baseSenderName;
                    if (!senderAddrFinal.includes("BATAM") && template !== 'POLRES') { senderAddrFinal += " BATAM"; }
                    senderPhoneFinal = "0";
                } else if (mode === 'RITEL') {
                    senderNameFinal = dSenderName ? dSenderName : baseSenderName;
                    senderAddrFinal = baseSenderAddress;
                    senderPhoneFinal = baseSenderPhone;
                }

                let rowObject = {
                    "connote_code": index + 1,
                    "customer_code": finalCustomerId,
                    "origin_data_customer_name": senderNameFinal,
                    "origin_data_customer_phone": senderPhoneFinal, 
                    "origin_data_customer_address": senderAddrFinal,
                    "origin_data_customer_zip_code": "29411", 
                    "origin_data_zone_code": "29400",
                    "destination_data_customer_name": dName,
                    "destination_data_customer_phone": dPhone,
                    "destination_data_customer_address": dAddress,
                    "destination_data_customer_zip_code": dZip, 
                    "destination_data_zone_code": destZoneCode,        
                    "service_code": serviceCode,
                    "connote_sub_service_code": finalTariffCode, 
                    "koli_data_koli_description": dNoSurat ? dNoSurat : itemType, 
                    "koli_data_koli_weight": dWeight,
                    "koli_data_koli_width": dP,
                    "koli_data_koli_height": dT, 
                    "koli_data_koli_length": dL, 
                    "transaction_payment_type_name": paymentType,
                    "instruksi_pengiriman": "Tolong diantar dengan baik",
                    "harga_barang": dHargaBarang,
                    "ref_no": dNoSurat, 
                    "Jenis_Barang": itemType, 
                    "statusRetur": "Kembali ke pengirim"
                };

                if (useInsurance) {
                    rowObject["INS"] = "Y"; 
                }

                finalExportRows.push(rowObject);
            });

            const exportHeaders = [
                "connote_code", "customer_code", "origin_data_customer_name", "origin_data_customer_phone", 
                "origin_data_customer_address", "origin_data_customer_zip_code", "origin_data_zone_code", 
                "destination_data_customer_name", "destination_data_customer_phone", "destination_data_customer_address", 
                "destination_data_customer_zip_code", "destination_data_zone_code", "service_code", 
                "connote_sub_service_code", "koli_data_koli_description", "koli_data_koli_weight", 
                "koli_data_koli_width", "koli_data_koli_height", "koli_data_koli_length", 
                "transaction_payment_type_name", "instruksi_pengiriman", "harga_barang", 
                "ref_no", "Jenis_Barang", "statusRetur"
            ];

            if (useInsurance) {
                exportHeaders.push("INS");
            }

            const worksheet = XLSX.utils.json_to_sheet(finalExportRows, { header: exportHeaders });
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
            
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                let cell_sender_phone = worksheet[XLSX.utils.encode_cell({r: R, c: 3})];
                if (cell_sender_phone) cell_sender_phone.z = '@';
                let cell_dest_phone = worksheet[XLSX.utils.encode_cell({r: R, c: 8})];
                if (cell_dest_phone) cell_dest_phone.z = '@';
                let cell_dest_zip = worksheet[XLSX.utils.encode_cell({r: R, c: 10})];
                if (cell_dest_zip) cell_dest_zip.z = '@';
            }

            let fileSuffix = mode === 'RITEL' ? "Ritel" : (finalCustomerId || "Corporate");
            XLSX.writeFile(workbook, `Upload_MileApp_${fileSuffix}.xlsx`);
        }
    