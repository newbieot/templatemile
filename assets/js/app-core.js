
        let uploadedFilesManager = [];
        let fileProcessQueue = [];
        let currentWorkbook = null;
        let currentFileName = "";
        let currentHeaders = [];
        let tempExtractedRows = []; 
        let globalHeaderRowIndex = 0; // Menyimpan baris di mana header sebenarnya berada
        let rowIdentityCounter = 0;

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


        // ================= TEMPLATE PELANGGAN KORPORAT =================
        // Single source of truth: ID pelanggan preset WAJIB berasal dari konfigurasi ini,
        // bukan dari input tersembunyi. Ini mencegah kiriman invoice jatuh menjadi ritel
        // apabila field UI ter-reset/kosong sebelum ekspor.
        const corporateTemplatePresets = Object.freeze({
            PN_BATAM: Object.freeze({ customerId: 'LNMAPN01294A', senderName: 'PENGADILAN NEGERI BATAM', tariffCode: '897924', lockTariff: true, defaultItemType: 'DOKUMEN' }),
            MENSA: Object.freeze({ customerId: 'DAGMBS01294A', senderName: 'MENSA BINA SUKSES BATAM', tariffCode: '914556', lockTariff: true, destinationZoneCode: '29100' }),
            TOYOTA: Object.freeze({ customerId: 'FINTOYOTA02294A', senderName: 'PT TOYOTA ASTRA FINANCE' }),
            JACCS_MPM: Object.freeze({ customerId: 'FINMPMJKT04120A', senderName: 'PT JACCS MPM FINANCE INDONESIA', tariffCode: '868523', lockTariff: true, defaultServiceCode: 'PKH' }),
            POLRES: Object.freeze({ customerId: 'LNPOLRES01294A', senderName: 'SATLANTAS POLRESTA BARELANG POLDA KEPULAUAN RIAU' }),
            BNI: Object.freeze({ customerId: 'BANKBNIBTAM02294A', senderName: 'BANK BNI BATAM', tariffCode: '907675', lockTariff: true }),
            BTN: Object.freeze({ customerId: 'BANKBTNBTAM02294A', senderName: 'BANK TABUNGAN NEGARA BATAM', tariffCode: '876577', lockTariff: true }),
            ASTRA: Object.freeze({ customerId: 'INDASTRADAI01294A', senderName: 'ASTRA DAIHATSU MOTOR BATAM' }),
            OJK: Object.freeze({ customerId: 'LNOJK02294A', senderName: 'KANTOR PUSAT OTORITAS JASA KEUANGAN' }),
            BP_BATAM: Object.freeze({ customerId: 'LNBPBATAM02294A', senderName: 'BP BATAM' }),
            INDTEMPO: Object.freeze({ customerId: 'INDTEMPO01294A', senderNameRequired: true })
        });

        function getCorporateTemplatePreset(template) {
            return corporateTemplatePresets[template] || null;
        }

        function resolveCorporateCustomerId(template, manualValue = '') {
            const preset = getCorporateTemplatePreset(template);
            if (preset) return String(preset.customerId || '').trim().toUpperCase();
            return cleanArtifacts(manualValue).toUpperCase();
        }

        function assertPresetCustomerIds() {
            for (const [template, preset] of Object.entries(corporateTemplatePresets)) {
                if (!preset.customerId || !String(preset.customerId).trim()) {
                    throw new Error(`Konfigurasi fatal: ID Pelanggan template ${template} kosong.`);
                }
            }
        }
        assertPresetCustomerIds();


        // ================= ATURAN LAYANAN PN BATAM =================
        // Kalender resmi 2026: libur nasional dan cuti bersama.
        const pnBatamClosedDates2026 = Object.freeze({
            "2026-01-01": "Tahun Baru 2026 Masehi",
            "2026-01-16": "Isra Mikraj Nabi Muhammad SAW",
            "2026-02-16": "Cuti Bersama Tahun Baru Imlek",
            "2026-02-17": "Tahun Baru Imlek 2577 Kongzili",
            "2026-03-18": "Cuti Bersama Hari Suci Nyepi",
            "2026-03-19": "Hari Suci Nyepi",
            "2026-03-20": "Cuti Bersama Idulfitri",
            "2026-03-21": "Hari Raya Idulfitri 1447 H",
            "2026-03-22": "Hari Raya Idulfitri 1447 H",
            "2026-03-23": "Cuti Bersama Idulfitri",
            "2026-03-24": "Cuti Bersama Idulfitri",
            "2026-04-03": "Wafat Yesus Kristus",
            "2026-04-05": "Kebangkitan Yesus Kristus (Paskah)",
            "2026-05-01": "Hari Buruh Internasional",
            "2026-05-14": "Kenaikan Yesus Kristus",
            "2026-05-15": "Cuti Bersama Kenaikan Yesus Kristus",
            "2026-05-27": "Hari Raya Iduladha 1447 H",
            "2026-05-28": "Cuti Bersama Iduladha",
            "2026-05-31": "Hari Raya Waisak 2570 BE",
            "2026-06-01": "Hari Lahir Pancasila",
            "2026-06-16": "1 Muharam 1448 H",
            "2026-08-17": "Hari Proklamasi Kemerdekaan",
            "2026-08-25": "Maulid Nabi Muhammad SAW",
            "2026-12-24": "Cuti Bersama Kelahiran Yesus Kristus",
            "2026-12-25": "Kelahiran Yesus Kristus"
        });

        function getBatamIsoDate(date = new Date()) {
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Jakarta',
                year: 'numeric', month: '2-digit', day: '2-digit'
            });
            const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
            return `${parts.year}-${parts.month}-${parts.day}`;
        }

        function shiftIsoDate(isoDate, days) {
            const [year, month, day] = isoDate.split('-').map(Number);
            const date = new Date(Date.UTC(year, month - 1, day + days, 12));
            return date.toISOString().slice(0, 10);
        }

        function getIsoDayOfWeek(isoDate) {
            const [year, month, day] = isoDate.split('-').map(Number);
            return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
        }

        function formatIndonesianDate(isoDate) {
            const [year, month, day] = isoDate.split('-').map(Number);
            return new Intl.DateTimeFormat('id-ID', {
                timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }).format(new Date(Date.UTC(year, month - 1, day, 5)));
        }

        function getPNBatamServiceRecommendation(date = new Date()) {
            const isoDate = getBatamIsoDate(date);
            const holidayName = pnBatamClosedDates2026[isoDate];
            if (holidayName) {
                return { code: 'PKH', isoDate, reason: `${formatIndonesianDate(isoDate)} merupakan ${holidayName}.` };
            }

            const tomorrowIso = shiftIsoDate(isoDate, 1);
            const tomorrowHoliday = pnBatamClosedDates2026[tomorrowIso];
            if (tomorrowHoliday) {
                return { code: 'PKH', isoDate, reason: `H-1 ${tomorrowHoliday} (${formatIndonesianDate(tomorrowIso)}).` };
            }

            const dayOfWeek = getIsoDayOfWeek(isoDate);
            if (dayOfWeek === 5) {
                return { code: 'PKH', isoDate, reason: 'Hari Jumat menggunakan layanan PKH.' };
            }
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                return { code: 'PKH', isoDate, reason: 'Akhir pekan menggunakan layanan PKH.' };
            }
            return { code: 'PE', isoDate, reason: 'Hari Senin–Kamis normal menggunakan layanan PE.' };
        }

        function applyPNBatamServiceDefault() {
            const template = document.getElementById('corporateTemplate')?.value;
            const mode = document.getElementById('clientMode')?.value;
            const serviceSelect = document.getElementById('serviceCode');
            const hint = document.getElementById('serviceCodeHint');
            if (!serviceSelect || !hint) return;

            if (mode === 'KORPORAT' && template === 'PN_BATAM') {
                const recommendation = getPNBatamServiceRecommendation();
                serviceSelect.value = recommendation.code;
                hint.hidden = false;
                hint.innerHTML = `<strong>Otomatis: ${recommendation.code}</strong> · ${recommendation.reason} Tetap dapat diganti manual.`;
            } else {
                hint.hidden = true;
                hint.textContent = '';
            }
        }

        window.getPNBatamServiceRecommendation = getPNBatamServiceRecommendation;
        window.__mileCore = {
            get uploadedFilesManager() { return uploadedFilesManager; },
            get currentFileName() { return currentFileName; },
            set tempExtractedRows(value) { tempExtractedRows = value; },
            getZipCodeFromAddress,
            cleanArtifacts,
            cleanRecipientName,
            cleanAddressArtifacts,
            splitRecipientAndAddress,
            cleanReference,
            cleanPhoneNumber,
            updateInterface: () => updateInterface(),
            processNextInQueue: () => processNextInQueue(),
            showWeightModal: () => showWeightModal()
        };


        document.addEventListener("DOMContentLoaded", () => {
            handleModeChange();
            document.getElementById('resultTable')?.addEventListener('input', event => {
                syncManagedRowFromInput(event.target);
            });
        });

        // MANAJEMEN UI BERDASARKAN MODE (KORPORAT, RITEL, PINDAH)
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
            const itemInput = document.getElementById('itemType');
            const serviceSelect = document.getElementById('serviceCode');
            const cbInsurance = document.getElementById('useInsurance');
            const wrapPindahDest = document.getElementById('wrapPindahDest');
            const wrapTempoBankSyariah = document.getElementById('wrapTempoBankSyariah');

            // Reset Disabled Status for Safety
            if (wrapTempoBankSyariah && mode !== 'KORPORAT') wrapTempoBankSyariah.style.display = 'none';
            itemInput.disabled = false;
            serviceSelect.disabled = false;
            cbInsurance.disabled = false;

            if (mode === 'KORPORAT') {
                wrapTemplate.style.display = 'block';
                wrapTariff.style.display = 'block';
                wrapSPhone.style.display = 'none';
                wrapSAddr.style.display = 'none';
                wrapItemType.classList.add('full-width');
                wrapPindahDest.style.display = 'none';
                
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
                wrapPindahDest.style.display = 'none';

                tariffInput.value = "";
                tariffInput.readOnly = false;
            }
            else if (mode === 'PINDAH') {
                wrapTemplate.style.display = 'none';
                cardPengirim.style.display = 'block'; 
                wrapCustId.style.display = 'block';
                wrapSName.style.display = 'block';
                wrapSPhone.style.display = 'block';
                wrapSAddr.style.display = 'block';
                wrapTariff.style.display = 'block'; 
                wrapItemType.classList.add('full-width');
                wrapPindahDest.style.display = 'block';

                tariffInput.value = "";
                tariffInput.readOnly = false;
                
                // Wajib Paket & Wajib Asuransi
                itemInput.value = 'PAKET';
                itemInput.disabled = true;
                cbInsurance.checked = true;
                cbInsurance.disabled = true;
            }

            applyPNBatamServiceDefault();
            uploadedFilesManager = [];
            updateInterface();
        }

        // LOGIKA PENYEMBUNYIAN KARTU PENGIRIM BERDASARKAN TEMPLATE
        function handleTempoBankSyariahChange() {
            const template = document.getElementById('corporateTemplate')?.value;
            const mode = document.getElementById('clientMode')?.value;
            if (mode !== 'KORPORAT' || template !== 'INDTEMPO') return;

            const specialSelect = document.getElementById('tempoBankSyariahTariff');
            const tariffInput = document.getElementById('tariffCode');
            const serviceSelect = document.getElementById('serviceCode');
            const itemInput = document.getElementById('itemType');
            const isSpecial = specialSelect?.value === 'YES';

            serviceSelect.disabled = false;
            itemInput.disabled = false;
            tariffInput.readOnly = false;

            if (isSpecial) {
                tariffInput.value = '915552';
                tariffInput.readOnly = true;
                serviceSelect.value = 'PKH';
                serviceSelect.disabled = true;
                itemInput.value = 'DOKUMEN';
                itemInput.disabled = true;
            } else if (specialSelect?.value === 'NO') {
                // Bukan tarif khusus: pengguna dapat memakai tarif lain/publish.
                if (tariffInput.value === '915552') tariffInput.value = '';
            } else {
                tariffInput.value = '';
            }

            updateInterface();
        }

        // LOGIKA PENYEMBUNYIAN KARTU PENGIRIM BERDASARKAN TEMPLATE
        function handleTemplateChange() {
            const template = document.getElementById('corporateTemplate').value;
            const mode = document.getElementById('clientMode').value;
            const cardPengirim = document.getElementById('cardDataPengirim');
            const wrapSName = document.getElementById('wrapSenderName');
            const wrapSPhone = document.getElementById('wrapSenderPhone');
            const wrapSAddr = document.getElementById('wrapSenderAddress');
            const wrapCustId = document.getElementById('wrapCustomerId');
            const wrapTempoBankSyariah = document.getElementById('wrapTempoBankSyariah');
            const tempoBankSyariahTariff = document.getElementById('tempoBankSyariahTariff');
            const custIdInput = document.getElementById('customerId');
            const sNameInput = document.getElementById('senderName');
            const tariffInput = document.getElementById('tariffCode');
            const itemInput = document.getElementById('itemType');
            const serviceSelect = document.getElementById('serviceCode');

            if (mode !== 'KORPORAT') return;

            custIdInput.readOnly = false;
            sNameInput.readOnly = false;
            sNameInput.required = false;
            sNameInput.placeholder = 'Nama perusahaan atau pengirim';
            tariffInput.readOnly = false;
            serviceSelect.disabled = false;
            itemInput.disabled = false;
            wrapSPhone.style.display = 'none';
            wrapSAddr.style.display = 'none';
            if (wrapTempoBankSyariah) wrapTempoBankSyariah.style.display = 'none';

            if (template === 'MANUAL') {
                cardPengirim.style.display = 'block';
                wrapSName.style.display = 'block';
                wrapCustId.style.display = 'block';
                custIdInput.value = '';
                sNameInput.value = '';
                tariffInput.value = '';
                if (tempoBankSyariahTariff) tempoBankSyariahTariff.value = '';
            } else {
                const preset = getCorporateTemplatePreset(template);
                if (!preset) {
                    alert('Template pelanggan tidak dikenali. Pilih ulang template sebelum melanjutkan.');
                    document.getElementById('corporateTemplate').value = 'MANUAL';
                    handleTemplateChange();
                    return;
                }

                // ID pelanggan preset ditampilkan sebagai konfirmasi, tetapi sumber ekspor tetap konfigurasi preset.
                custIdInput.value = preset.customerId;
                custIdInput.readOnly = true;
                sNameInput.value = preset.senderName || '';
                tariffInput.value = preset.tariffCode || '';
                tariffInput.readOnly = Boolean(preset.lockTariff);
                if (preset.defaultServiceCode) serviceSelect.value = preset.defaultServiceCode;
                if (preset.defaultItemType) itemInput.value = preset.defaultItemType;

                if (template === 'INDTEMPO') {
                    cardPengirim.style.display = 'block';
                    wrapCustId.style.display = 'block';
                    wrapSName.style.display = 'block';
                    sNameInput.value = '';
                    sNameInput.placeholder = 'Wajib diisi oleh pengirim';
                    sNameInput.required = true;
                    if (wrapTempoBankSyariah) wrapTempoBankSyariah.style.display = 'block';
                    if (tempoBankSyariahTariff) tempoBankSyariahTariff.value = '';
                    handleTempoBankSyariahChange();
                } else {
                    cardPengirim.style.display = 'none';
                    sNameInput.placeholder = 'Nama perusahaan atau pengirim';
                }
            }

            applyPNBatamServiceDefault();
            // Update tabel agar kodeposnya ter-refresh sesuai database
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
            const fileExt = String(file.name || '').split('.').pop().toLowerCase();

            if (fileExt === 'pdf') {
                if (window.MileAI && typeof window.MileAI.processPDFFile === 'function') {
                    window.MileAI.processPDFFile(file);
                } else {
                    alert('Modul ekstraksi PDF belum siap. Muat ulang halaman lalu coba lagi.');
                    processNextInQueue();
                }
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                currentWorkbook = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
                
                const firstSheetName = currentWorkbook.SheetNames[0];
                const worksheet = currentWorkbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});

                currentHeaders = [];
                globalHeaderRowIndex = 0;
                
                // --- SMART HEADER DETECTION (Deteksi Judul walau nyelip di baris ke-2 atau seterusnya) ---
                let maxScore = 0;
                const headerKeywords = ['nama', 'name', 'alamat', 'address', 'penerima', 'hp', 'telp', 'phone', 'no', 'ref', 'surat', 'deskripsi', 'awb', 'berat', 'weight', 'destination', 'origin'];

                for (let r = 0; r < Math.min(jsonData.length, 15); r++) {
                    let row = jsonData[r];
                    if (!row || row.length === 0) continue;

                    let score = 0;
                    row.forEach(cell => {
                        if (typeof cell === 'string') {
                            let cellLower = cell.toLowerCase().trim();
                            if (headerKeywords.some(kw => cellLower.includes(kw))) {
                                score++;
                            }
                        }
                    });

                    // Jika baris ini memiliki lebih banyak kecocokan keyword header, set sebagai Header baris utama
                    if (score > maxScore) {
                        maxScore = score;
                        globalHeaderRowIndex = r;
                        currentHeaders = row;
                    }
                }

                // Jika kata kunci benar-benar tidak ada, cari baris dengan kolom isi terbanyak sebagai fallback
                if (maxScore === 0) {
                    let maxCols = 0;
                    for (let r = 0; r < Math.min(jsonData.length, 10); r++) {
                        if (jsonData[r] && jsonData[r].length > maxCols) {
                            maxCols = jsonData[r].length;
                            globalHeaderRowIndex = r;
                            currentHeaders = jsonData[r];
                        }
                    }
                }
                // --- END SMART HEADER DETECTION ---

                // AI SMART BYPASS: JIKA FILE YANG DIUPLOAD ADALAH EXCEL MILEAPP HASIL EXPORT
                let isMileApp = currentHeaders.some(h => String(h).toLowerCase().trim() === 'destination_data_customer_name');
                
                if (isMileApp) {
                    // Gunakan range untuk memastikan data diambil mulai dari header row yang sebenarnya
                    const mileAppJsonData = XLSX.utils.sheet_to_json(worksheet, { range: globalHeaderRowIndex });
                    processMileAppFormat(mileAppJsonData); 
                } else {
                    showMappingModal(currentHeaders);
                }
            };
            reader.readAsArrayBuffer(file);
        }

        // FUNGSI KHUSUS UNTUK MEMBACA FILE EXCEL MILE APP (AUTO-DETECT)
        function processMileAppFormat(jsonData) {
            const templateVal = document.getElementById('corporateTemplate').value;
            const mode = document.getElementById('clientMode').value;
            let extractedRows = [];

            jsonData.forEach(row => {
                let rSender = row['origin_data_customer_name'] || "";
                let rRef = row['ref_no'] || row['koli_data_koli_description'] || "";
                let rName = row['destination_data_customer_name'] || "";
                let rPhone = row['destination_data_customer_phone'] || "0";
                let rZip = row['destination_data_customer_zip_code'] || "";
                let rAddress = row['destination_data_customer_address'] || "";
                
                let wRaw = row['koli_data_koli_weight'];
                let rAct = wRaw !== undefined ? parseFloat(String(wRaw).replace(',', '.')) : 0.2;
                if(isNaN(rAct)) rAct = 0.2;

                let pRaw = row['koli_data_koli_width'];
                let rP = pRaw !== undefined ? parseFloat(String(pRaw).replace(',', '.')) : 10;
                if(isNaN(rP)) rP = 10;

                let lRaw = row['koli_data_koli_length'];
                let rL = lRaw !== undefined ? parseFloat(String(lRaw).replace(',', '.')) : 10;
                if(isNaN(rL)) rL = 10;

                let tRaw = row['koli_data_koli_height'];
                let rT = tRaw !== undefined ? parseFloat(String(tRaw).replace(',', '.')) : 10;
                if(isNaN(rT)) rT = 10;

                let vol = (rP * rL * rT) / 6000;
                let rCw = Math.max(rAct, vol).toFixed(2);
                
                let rIns = parseFloat(row['harga_barang']) || 0;

                if (rName || rAddress) {
                    const recipient = splitRecipientAndAddress(rName, rAddress);
                    extractedRows.push({
                        senderName: cleanReference(rSender),
                        noSurat: /^(?:245\s+BATAM|CABANG|CARRIAGE)$/i.test(cleanReference(rRef)) ? "" : cleanReference(rRef),
                        name: recipient.name,
                        phone: cleanPhoneNumber(rPhone),
                        zip: cleanArtifacts(rZip),
                        address: recipient.address,
                        cw: rCw,
                        act: rAct, p: rP, l: rL, t: rT,
                        insHarga: rIns
                    });
                }
            });

            if (extractedRows.length === 0) {
                alert(`Gagal membaca data dari file Mile App "${currentFileName}".`);
                processNextInQueue();
                return;
            }

            // Aktifkan centang asuransi jika ada data harga barang
            let hasInsurance = extractedRows.some(r => r.insHarga > 0);
            if(hasInsurance && mode !== 'PINDAH') {
                document.getElementById('useInsurance').checked = true;
            }

            uploadedFilesManager.push({ id: Date.now(), name: currentFileName, rows: extractedRows });
            updateInterface();
            processNextInQueue();
        }

        function showMappingModal(headers) {
            document.getElementById('mappingFileName').innerText = "📍 File: " + currentFileName + " (Header Terdeteksi di Baris " + (globalHeaderRowIndex + 1) + ")";
            
            // Kosongkan form ketik custom setiap kali modal terbuka
            document.getElementById('customRef').value = "";

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
            const mode = document.getElementById('clientMode').value;

            const idxName = parseInt(document.getElementById('mapName').value);
            const idxAddr = parseInt(document.getElementById('mapAddress').value);
            const idxPhone = parseInt(document.getElementById('mapPhone').value);
            const idxRef = parseInt(document.getElementById('mapRef').value);
            const idxSenderName = parseInt(document.getElementById('mapSenderName').value);
            
            const customRefVal = document.getElementById('customRef').value.trim().toUpperCase();
            
            const idxWeight = parseInt(document.getElementById('mapWeight').value);
            const idxP = parseInt(document.getElementById('mapP').value);
            const idxL = parseInt(document.getElementById('mapL').value);
            const idxT = parseInt(document.getElementById('mapT').value);

            let extractedRows = [];

            currentWorkbook.SheetNames.forEach((sheetName, sheetIndex) => {
                const worksheet = currentWorkbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});

                // Mulai membaca dari baris SETELAH header row agar tidak menangkap judul utama/header
                let startIndex = (sheetIndex === 0) ? (globalHeaderRowIndex + 1) : 1;

                if (jsonData.length > 0) {
                    for (let i = startIndex; i < jsonData.length; i++) { 
                        let row = jsonData[i];
                        if (!row || row.length === 0) continue;

                        // Tambahan proteksi bila baris tersebut mirip sekali dengan header (misalnya sheet lain formatnya beda tipis)
                        if (
                            (idxName !== -1 && String(row[idxName]).toUpperCase() === String(currentHeaders[idxName]).toUpperCase()) ||
                            (idxAddr !== -1 && String(row[idxAddr]).toUpperCase() === String(currentHeaders[idxAddr]).toUpperCase())
                        ) {
                            continue;
                        }

                        let rawName = idxName !== -1 ? row[idxName] : "";
                        let rawAddr = idxAddr !== -1 ? row[idxAddr] : "";
                        let rawPhone = idxPhone !== -1 ? row[idxPhone] : "0";
                        let rawSenderName = idxSenderName !== -1 ? row[idxSenderName] : "";
                        
                        // Menimpa nilai mapping Ref jika user mengetik di kotak custom text
                        let rawRef = customRefVal !== "" ? customRefVal : (idxRef !== -1 ? row[idxRef] : "");
                        
                        let rawWeight = idxWeight !== -1 ? row[idxWeight] : "";
                        let rawP = idxP !== -1 ? row[idxP] : "";
                        let rawL = idxL !== -1 ? row[idxL] : "";
                        let rawT = idxT !== -1 ? row[idxT] : "";

                        const recipient = splitRecipientAndAddress(rawName, rawAddr);
                        let cleanName = recipient.name;
                        let cleanAddr = recipient.address;
                        let cleanPhone = cleanPhoneNumber(rawPhone);
                        let cleanRef = cleanReference(rawRef);
                        let cleanSenderName = cleanReference(rawSenderName); 

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
                    row.cw = "0.20"; row.p = 10; row.l = 10; row.t = 10; row.act = 0.2;
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
                                <input type="number" step="0.1" min="0.2" class="w-act" data-index="${index}" value="${row.act || ''}" placeholder="1" oninput="calculateCW(${index})">
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
                
                const act = parseFloat(input.value.replace(',', '.')) || 0.2;
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

        function cleanRecipientName(text) {
            return cleanArtifacts(text)
                .replace(/^\s*(?:KEPADA\s+(?:YANG\s+TERHORMAT|YTH)|YTH|ATTN)\.?\s*[:,.\-]?\s*/i, '')
                .trim();
        }

        function cleanAddressArtifacts(text) {
            return cleanArtifacts(text)
                .replace(/\b0{5,}\b/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function splitRecipientAndAddress(name, address) {
            const cleanName = cleanRecipientName(name);
            const cleanAddress = cleanAddressArtifacts(address);
            const match = /\b(?:JL\.?|JALAN|RUKO|PERUM(?:AHAN)?|KOMP(?:LEK)?|KAVLING|GEDUNG|PASIR\s+PUTIH\s+RESIDENCE)\b/i.exec(cleanName);
            if (!match || match.index < 5) return { name: cleanName, address: cleanAddress };
            return {
                name: cleanName.slice(0, match.index).trim(),
                address: `${cleanName.slice(match.index).trim()} ${cleanAddress}`.replace(/\s+/g, ' ').trim()
            };
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

        function getZipCodeFromAddress(address, template) {
            const addrUpper = String(address).toUpperCase();

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

        function containsReviewMarker(value) {
            return /\bPERLU\s*(?:DI\s*)?CEK\b/i.test(String(value ?? ''));
        }

        function ensureRowIdentity(row) {
            if (!row._rowId) {
                rowIdentityCounter += 1;
                row._rowId = `row-${Date.now()}-${rowIdentityCounter}`;
            }
            return row._rowId;
        }

        function escapeAttribute(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        const reviewFieldKeys = Object.freeze([
            'senderName', 'noSurat', 'name', 'phone', 'zip', 'cw', 'p', 'l', 't', 'insHarga', 'address'
        ]);

        function ensureRowReviewState(row) {
            if (!row._reviewState || typeof row._reviewState !== 'object') {
                row._reviewState = {};
            }

            // Rekonsiliasi setiap kali dipanggil. Dengan begitu, teks "perlu dicek"
            // tidak pernah dapat tersembunyi hanya karena status lama sempat ditandai selesai.
            reviewFieldKeys.forEach(field => {
                const currentValue = String(row[field] ?? '');
                const hasMarker = containsReviewMarker(currentValue);
                let state = row._reviewState[field];

                if (hasMarker && !state) {
                    state = row._reviewState[field] = {
                        pending: true,
                        dirty: false,
                        originalValue: currentValue
                    };
                } else if (hasMarker && state && !state.pending) {
                    const previousResolvedValue = String(state.resolvedValue ?? state.originalValue ?? '');
                    state.pending = true;
                    state.dirty = currentValue.trim() !== previousResolvedValue.trim();
                    state.originalValue = previousResolvedValue || currentValue;
                    delete state.resolvedValue;
                }
            });

            return row._reviewState;
        }

        function getFieldReviewState(row, field) {
            return ensureRowReviewState(row)[field] || null;
        }

        function isFieldReviewPending(row, field) {
            return Boolean(getFieldReviewState(row, field)?.pending);
        }

        function rowNeedsReview(row) {
            return reviewFieldKeys.some(field => isFieldReviewPending(row, field));
        }

        function getPendingReviewCount() {
            return uploadedFilesManager.reduce((total, file) => total + file.rows.reduce((rowTotal, row) => {
                return rowTotal + reviewFieldKeys.filter(field => isFieldReviewPending(row, field)).length;
            }, 0), 0);
        }

        function findManagedRow(fileId, rowId) {
            const file = uploadedFilesManager.find(item => String(item.id) === String(fileId));
            if (!file) return null;
            const row = file.rows.find(item => ensureRowIdentity(item) === String(rowId));
            return row ? { file, row } : null;
        }

        const fieldClassMap = Object.freeze({
            'val-senderName': 'senderName',
            'val-noSurat': 'noSurat',
            'val-name': 'name',
            'val-phone': 'phone',
            'val-zip': 'zip',
            'val-cw': 'cw',
            'val-p': 'p',
            'val-l': 'l',
            'val-t': 't',
            'val-ins-harga': 'insHarga',
            'val-address': 'address'
        });

        function getManagedInputContext(input) {
            if (!(input instanceof HTMLInputElement)) return null;
            const tr = input.closest('tr[data-file-id][data-row-id]');
            if (!tr) return null;
            const managed = findManagedRow(tr.dataset.fileId, tr.dataset.rowId);
            if (!managed) return null;
            const matchedClass = Object.keys(fieldClassMap).find(className => input.classList.contains(className));
            if (!matchedClass) return null;
            return { ...managed, tr, field: fieldClassMap[matchedClass] };
        }

        function syncManagedRowFromInput(input) {
            const context = getManagedInputContext(input);
            if (!context) return null;

            const previousValue = String(context.row[context.field] ?? '');
            context.row[context.field] = input.value;
            const states = ensureRowReviewState(context.row);
            let reviewState = states[context.field] || null;
            const currentValue = String(input.value ?? '');

            // Jika frasa penanda muncul atau masih tersisa, status wajib koreksi dibuka kembali.
            if (containsReviewMarker(currentValue)) {
                if (!reviewState) {
                    reviewState = states[context.field] = {
                        pending: true,
                        dirty: currentValue.trim() !== previousValue.trim(),
                        originalValue: previousValue || currentValue
                    };
                } else {
                    reviewState.pending = true;
                    delete reviewState.resolvedValue;
                }
            }

            if (reviewState?.pending) {
                const changed = currentValue.trim() !== String(reviewState.originalValue ?? '').trim();
                reviewState.dirty = changed;
                input.dataset.reviewPending = 'true';
                input.dataset.reviewOriginal = String(reviewState.originalValue ?? '');
                input.dataset.reviewDirty = String(changed);
                input.classList.toggle('is-review-dirty', changed);
            }
            return { ...context, reviewState };
        }

        function commitReviewCorrection(input) {
            const context = syncManagedRowFromInput(input);
            if (!context?.reviewState?.pending) {
                return { resolved: false, pending: false, reason: 'not-pending' };
            }

            const currentValue = String(input.value ?? '').trim();
            const originalValue = String(context.reviewState.originalValue ?? '').trim();
            if (!currentValue) {
                context.reviewState.dirty = false;
                input.dataset.reviewDirty = 'false';
                input.classList.remove('is-review-dirty');
                return { resolved: false, pending: true, reason: 'empty' };
            }
            if (currentValue === originalValue) {
                context.reviewState.dirty = false;
                input.dataset.reviewDirty = 'false';
                input.classList.remove('is-review-dirty');
                return { resolved: false, pending: true, reason: 'unchanged' };
            }
            if (containsReviewMarker(currentValue)) {
                context.reviewState.pending = true;
                context.reviewState.dirty = true;
                input.dataset.reviewPending = 'true';
                input.dataset.reviewDirty = 'true';
                input.classList.add('needs-review-field', 'is-review-dirty');
                input.closest('td')?.classList.add('needs-review-cell');
                return { resolved: false, pending: true, reason: 'marker-remains' };
            }

            context.reviewState.pending = false;
            context.reviewState.dirty = false;
            context.reviewState.resolvedValue = input.value;
            input.dataset.reviewPending = 'false';
            input.dataset.reviewDirty = 'false';
            input.classList.remove('needs-review-field', 'is-review-dirty');
            input.closest('td')?.classList.remove('needs-review-cell');

            const rowStillPending = rowNeedsReview(context.row);
            context.tr.dataset.needsReview = String(rowStillPending);
            context.tr.classList.toggle('needs-review', rowStillPending);
            const badge = context.tr.querySelector('.review-row-badge');
            if (badge) badge.hidden = !rowStillPending;

            return { resolved: true, pending: false, reason: 'changed', rowStillPending };
        }

        function ensureOutsideBatamState(row) {
            if (!row._outsideBatamState || typeof row._outsideBatamState !== 'object') {
                row._outsideBatamState = {
                    detected: Boolean(row.outsideBatam),
                    pending: Boolean(row.outsideBatam),
                    resolution: null,
                    originalAddress: String(row.address || ''),
                    reason: String(row.outsideBatamReason || '')
                };
            } else if (row.outsideBatam && row._outsideBatamState.resolution !== 'keep') {
                row._outsideBatamState.detected = true;
                row._outsideBatamState.pending = true;
                row._outsideBatamState.reason ||= String(row.outsideBatamReason || '');
            }
            return row._outsideBatamState;
        }

        function isOutsideBatamPending(row) {
            return Boolean(ensureOutsideBatamState(row).pending);
        }

        function getPendingOutsideBatamCount() {
            return uploadedFilesManager.reduce((total, file) => total + file.rows.filter(isOutsideBatamPending).length, 0);
        }

        function keepOutsideBatamRow(fileId, rowId) {
            const managed = findManagedRow(fileId, rowId);
            if (!managed || !isOutsideBatamPending(managed.row)) return false;
            const address = String(managed.row.address || '').trim();
            if (!window.confirm(`Pastikan alamat berikut memang masih berada di Kota Batam:

${address || '(alamat kosong)'}

Tandai sebagai AI salah deteksi dan tetap lanjutkan data ini?`)) return false;

            const state = ensureOutsideBatamState(managed.row);
            state.pending = false;
            state.resolution = 'keep';
            state.resolvedAt = new Date().toISOString();
            managed.row.outsideBatam = false;
            updateInterface();
            if (typeof window.showToast === 'function') window.showToast('Keputusan disimpan: alamat dinyatakan masih berada di Kota Batam.', 'success');
            return true;
        }

        function deleteOutsideBatamRow(fileId, rowId) {
            const managed = findManagedRow(fileId, rowId);
            if (!managed || !isOutsideBatamPending(managed.row)) return false;
            const label = managed.row.name || managed.row.noSurat || 'baris ini';
            const address = String(managed.row.address || '').trim();
            if (!window.confirm(`Hapus data “${label}” karena alamat penerima memang di luar Kota Batam?

${address || '(alamat kosong)'}

Baris ini tidak akan ikut diekspor.`)) return false;

            managed.file.rows = managed.file.rows.filter(item => ensureRowIdentity(item) !== String(rowId));
            if (managed.file.rows.length === 0) {
                uploadedFilesManager = uploadedFilesManager.filter(item => String(item.id) !== String(fileId));
            }
            updateInterface();
            if (typeof window.showToast === 'function') window.showToast('Baris alamat luar Kota Batam telah dihapus.', 'success');
            return true;
        }

        function getAiPdfManagedFiles() {
            return uploadedFilesManager.filter(file => file && (file.source === 'AI PDF' || /\.pdf$/i.test(String(file.name || ''))));
        }

        function updateBulkPdfReferenceEditor() {
            const editor = document.getElementById('bulkPdfReferenceEditor');
            const hint = document.getElementById('bulkPdfReferenceHint');
            if (!editor) return;
            const pdfFiles = getAiPdfManagedFiles();
            const rowTotal = pdfFiles.reduce((total, file) => total + (Array.isArray(file.rows) ? file.rows.length : 0), 0);
            editor.hidden = rowTotal === 0;
            if (hint && rowTotal > 0) {
                hint.textContent = `Nilai akan diterapkan ke ${rowTotal} baris dari ${pdfFiles.length} PDF hasil AI.`;
            }
        }

        function setPdfReferenceForAllRows(rawValue) {
            const pdfFiles = getAiPdfManagedFiles();
            const rows = pdfFiles.flatMap(file => Array.isArray(file.rows) ? file.rows : []);
            if (!rows.length) {
                if (typeof window.showToast === 'function') window.showToast('Belum ada hasil PDF AI yang dapat diperbarui.', 'error');
                else alert('Belum ada hasil PDF AI yang dapat diperbarui.');
                return;
            }

            const value = cleanReference(rawValue);
            rows.forEach(row => {
                const states = ensureRowReviewState(row);
                row.noSurat = value;
                const state = states.noSurat;
                if (state?.pending) {
                    state.pending = false;
                    state.dirty = false;
                    state.resolvedValue = value;
                }
            });
            updateInterface();
            if (typeof window.showToast === 'function') {
                window.showToast(value ? `No Ref “${value}” diterapkan ke ${rows.length} baris PDF.` : `No Ref dikosongkan pada ${rows.length} baris PDF.`, 'success');
            }
        }

        function applyPdfReferenceToAllRows() {
            const input = document.getElementById('bulkPdfReferenceValue');
            const value = String(input?.value || '').trim();
            if (!value) {
                if (typeof window.showToast === 'function') window.showToast('Isi No Ref terlebih dahulu, atau gunakan tombol “Kosongkan semua”.', 'error');
                else alert('Isi No Ref terlebih dahulu.');
                input?.focus();
                return;
            }
            const pdfFiles = getAiPdfManagedFiles();
            const rowTotal = pdfFiles.reduce((total, file) => total + (Array.isArray(file.rows) ? file.rows.length : 0), 0);
            if (!window.confirm(`Terapkan No Ref “${value.toUpperCase()}” ke seluruh ${rowTotal} baris hasil PDF?`)) return;
            setPdfReferenceForAllRows(value);
        }

        function clearPdfReferenceForAllRows() {
            const pdfFiles = getAiPdfManagedFiles();
            const rowTotal = pdfFiles.reduce((total, file) => total + (Array.isArray(file.rows) ? file.rows.length : 0), 0);
            if (!rowTotal) {
                if (typeof window.showToast === 'function') window.showToast('Belum ada hasil PDF AI yang dapat diperbarui.', 'error');
                return;
            }
            if (!window.confirm(`Kosongkan No Ref pada seluruh ${rowTotal} baris hasil PDF?`)) return;
            const input = document.getElementById('bulkPdfReferenceValue');
            if (input) input.value = '';
            setPdfReferenceForAllRows('');
        }

        window.applyPdfReferenceToAllRows = applyPdfReferenceToAllRows;
        window.clearPdfReferenceForAllRows = clearPdfReferenceForAllRows;

        function deleteFileFromQueue(id) {
            const file = uploadedFilesManager.find(item => String(item.id) === String(id));
            if (!file) return;
            if (!window.confirm(`Hapus berkas "${file.name}" beserta ${file.rows.length} baris datanya?`)) return;
            uploadedFilesManager = uploadedFilesManager.filter(item => String(item.id) !== String(id));
            updateInterface();
            if (typeof window.showToast === 'function') window.showToast('Berkas dan seluruh barisnya telah dihapus.', 'success');
        }

        function deleteDataRow(fileId, rowId) {
            const managed = findManagedRow(fileId, rowId);
            if (!managed) return;
            const label = managed.row.name || managed.row.noSurat || 'baris ini';
            if (!window.confirm(`Hapus data "${label}" dari tabel?`)) return;

            managed.file.rows = managed.file.rows.filter(item => ensureRowIdentity(item) !== String(rowId));
            if (managed.file.rows.length === 0) {
                uploadedFilesManager = uploadedFilesManager.filter(item => String(item.id) !== String(fileId));
            }
            updateInterface();
            if (typeof window.showToast === 'function') window.showToast('Baris berhasil dihapus.', 'success');
        }

        window.containsReviewMarker = containsReviewMarker;
        window.commitReviewCorrection = commitReviewCorrection;
        window.syncManagedRowFromInput = syncManagedRowFromInput;
        window.getPendingReviewCount = getPendingReviewCount;
        window.getPendingOutsideBatamCount = getPendingOutsideBatamCount;
        window.keepOutsideBatamRow = keepOutsideBatamRow;
        window.deleteOutsideBatamRow = deleteOutsideBatamRow;
        window.deleteFileFromQueue = deleteFileFromQueue;
        window.deleteDataRow = deleteDataRow;

        function updateInterface() {
            const fileQueueDiv = document.getElementById('fileQueue');
            if (uploadedFilesManager.length === 0) {
                fileQueueDiv.innerHTML = `<div style="text-align: center; color: #888; font-size: 0.75rem; padding: 15px; font-style: italic;">Antrean kosong.</div>`;
            } else {
                fileQueueDiv.innerHTML = "";
                uploadedFilesManager.forEach(file => {
                    file.rows.forEach(row => {
                        ensureRowIdentity(row);
                        ensureRowReviewState(row);
                        ensureOutsideBatamState(row);
                    });
                    fileQueueDiv.innerHTML += `
                        <div class="file-item">
                            <span style="font-weight:600;">📄 ${escapeAttribute(file.name)} (${file.rows.length} Baris)</span>
                            <button class="btn-delete-file" type="button" data-action="delete-file" data-file-id="${escapeAttribute(file.id)}">Hapus</button>
                        </div>`;
                });
            }

            updateBulkPdfReferenceEditor();

            const useInsurance = document.getElementById('useInsurance').checked;
            const thead = document.querySelector('#resultTable thead');
            thead.innerHTML = `
                <tr>
                    <th style="width: 3%; text-align: center;">NO</th>
                    <th style="width: 12%;">PENGIRIM</th>
                    <th style="width: 11%;">REF/SURAT</th>
                    <th style="width: 14%;">PENERIMA</th>
                    <th style="width: 9%;">NO HP</th>
                    <th style="width: 7%;">KODEPOS</th>
                    <th style="width: 7%;">BERAT(KG)</th>
                    <th style="width: 8%;">PxLxT</th>
                    ${useInsurance ? '<th style="width: 9%;">NILAI BRG(Rp)</th>' : ''}
                    <th style="width: 15%;">ALAMAT</th>
                    <th class="action-column-heading" style="width: 8%; text-align:center;">AKSI</th>
                </tr>
            `;

            const tbody = document.querySelector('#resultTable tbody');
            tbody.innerHTML = '';
            let counter = 0;

            uploadedFilesManager.forEach(file => {
                file.rows.forEach(item => {
                    counter++;
                    const rowId = ensureRowIdentity(item);
                    ensureRowReviewState(item);
                    const outsideState = ensureOutsideBatamState(item);
                    const outsidePending = Boolean(outsideState.pending);
                    const tr = document.createElement('tr');
                    tr.dataset.fileId = String(file.id);
                    tr.dataset.rowId = rowId;
                    tr.dataset.rowNumber = String(counter);
                    const needsReview = rowNeedsReview(item);
                    tr.dataset.needsReview = String(needsReview);
                    tr.classList.toggle('needs-review', needsReview);
                    tr.dataset.outsideBatamPending = String(outsidePending);
                    tr.classList.toggle('outside-batam', outsidePending);

                    const reviewClass = field => isFieldReviewPending(item, field) ? ' needs-review-field' : '';
                    const reviewAttributes = field => {
                        const state = getFieldReviewState(item, field);
                        const pending = Boolean(state?.pending);
                        const dirty = Boolean(state?.dirty);
                        const original = state?.originalValue ?? '';
                        return ` data-review-field="${field}" data-review-pending="${pending}" data-review-dirty="${dirty}" data-review-original="${escapeAttribute(original)}"`;
                    };
                    let insValue = item.insHarga !== undefined ? item.insHarga : 0;
                    let insColumn = useInsurance ? `<td><input type="number" class="table-input val-ins-harga${reviewClass('insHarga')}"${reviewAttributes('insHarga')} value="${escapeAttribute(insValue)}" style="color:#2e7d32; font-weight:bold;"></td>` : ``;

                    tr.innerHTML = `
                        <td class="row-number-cell" style="text-align:center; font-weight:bold; color:var(--pos-orange);">${counter}</td>
                        <td><input type="text" class="table-input val-senderName${reviewClass('senderName')}"${reviewAttributes('senderName')} value="${escapeAttribute(item.senderName || '')}"></td>
                        <td><input type="text" class="table-input val-noSurat${reviewClass('noSurat')}"${reviewAttributes('noSurat')} value="${escapeAttribute(item.noSurat || '')}"></td>
                        <td><input type="text" class="table-input val-name${reviewClass('name')}"${reviewAttributes('name')} value="${escapeAttribute(item.name || '')}"></td>
                        <td><input type="text" class="table-input val-phone${reviewClass('phone')}"${reviewAttributes('phone')} value="${escapeAttribute(item.phone || '')}"></td>
                        <td><input type="text" class="table-input val-zip${reviewClass('zip')}"${reviewAttributes('zip')} style="font-weight:bold; color:#d32f2f;" value="${escapeAttribute(item.zip || '')}"></td>
                        <td><input type="text" class="table-input val-cw${reviewClass('cw')}"${reviewAttributes('cw')} style="font-weight:bold; color:#0277bd;" value="${escapeAttribute(item.cw || '0.20')}"></td>
                        <td>
                            <div class="dim-box">
                                <input type="text" class="val-p${reviewClass('p')}"${reviewAttributes('p')} value="${escapeAttribute(item.p || 10)}">x
                                <input type="text" class="val-l${reviewClass('l')}"${reviewAttributes('l')} value="${escapeAttribute(item.l || 10)}">x
                                <input type="text" class="val-t${reviewClass('t')}"${reviewAttributes('t')} value="${escapeAttribute(item.t || 10)}">
                            </div>
                        </td>
                        ${insColumn}
                        <td><input type="text" class="table-input val-address${reviewClass('address')}"${reviewAttributes('address')} value="${escapeAttribute(item.address || '')}"></td>
                        <td class="row-action-cell">
                            <span class="outside-batam-badge" ${outsidePending ? '' : 'hidden'} title="${escapeAttribute(outsideState.reason || 'AI mendeteksi alamat penerima di luar Kota Batam.')}">Alamat luar Kota Batam</span>
                            <span class="review-row-badge" ${needsReview ? '' : 'hidden'}>No. ${counter} · Teks perlu dicek</span>
                            <div class="outside-batam-row-actions" ${outsidePending ? '' : 'hidden'}>
                                <button class="outside-batam-keep-row" type="button" data-action="keep-outside-batam" data-file-id="${escapeAttribute(file.id)}" data-row-id="${escapeAttribute(rowId)}">AI salah deteksi</button>
                                <button class="outside-batam-delete-row" type="button" data-action="delete-outside-batam" data-file-id="${escapeAttribute(file.id)}" data-row-id="${escapeAttribute(rowId)}">Hapus</button>
                            </div>
                            <button class="row-delete-button" type="button" aria-label="Hapus baris ${counter}" title="Hapus baris" data-action="delete-row" data-file-id="${escapeAttribute(file.id)}" data-row-id="${escapeAttribute(rowId)}">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>
                                <span>Hapus</span>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            });

            if (counter === 0) {
                tbody.innerHTML = `<tr><td colspan="${useInsurance ? 11 : 10}" style="text-align: center; color: #888; padding: 40px; font-style: italic;">Tarik file PDF, Excel, atau CSV ke panel kiri untuk memulai.</td></tr>`;
            }
        }

        function downloadFinalExcel() {
            const rows = document.querySelectorAll('#resultTable tbody tr');
            if (rows.length === 0 || rows[0].querySelector('input') === null) {
                alert("Tidak ada data untuk diekspor."); return;
            }

            const unresolvedOutsideRows = Array.from(document.querySelectorAll('#resultTable tbody tr[data-outside-batam-pending="true"]'));
            if (unresolvedOutsideRows.length > 0) {
                const numbers = unresolvedOutsideRows.map(row => row.dataset.rowNumber).filter(Boolean).slice(0, 8).join(', ');
                alert(`Masih ada ${unresolvedOutsideRows.length} alamat penerima yang terdeteksi di luar Kota Batam${numbers ? ` pada No. ${numbers}` : ''}. Pilih “Hapus” jika benar di luar Batam, atau “AI salah deteksi — tetap lanjutkan” jika alamat sebenarnya masih Kota Batam.`);
                unresolvedOutsideRows[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                return;
            }

            const unresolvedReviewInputs = Array.from(document.querySelectorAll('#resultTable tbody tr input[data-review-pending="true"]'));
            if (unresolvedReviewInputs.length > 0) {
                alert(`Masih ada ${unresolvedReviewInputs.length} bagian bertuliskan “perlu dicek”. Koreksi seluruhnya sebelum ekspor.`);
                const firstIssue = unresolvedReviewInputs[0];
                firstIssue.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                firstIssue.focus({ preventScroll: true });
                firstIssue.select?.();
                return;
            }

            const mode = document.getElementById('clientMode').value;
            const template = document.getElementById('corporateTemplate').value;
            const useInsurance = document.getElementById('useInsurance').checked;
            
            let finalCustomerId = "";
            let finalTariffCode = "";
            let baseSenderName = "";
            let baseSenderPhone = "0";
            let baseSenderAddress = "";
            let serviceCode = document.getElementById('serviceCode').value.toUpperCase();
            let itemType = document.getElementById('itemType').value.toUpperCase();
            
            const paymentType = (mode === 'KORPORAT' || mode === 'PINDAH') ? "INVOICE" : "CASH"; 
            
            let destZoneCodeGlobal = "29400";
            let destZipCodeGlobal = "";

            if (mode === 'KORPORAT') {
                const preset = getCorporateTemplatePreset(template);
                finalCustomerId = resolveCorporateCustomerId(template, document.getElementById('customerId').value);
                finalTariffCode = document.getElementById('tariffCode').value.trim().toUpperCase();

                if (template !== 'MANUAL' && !preset) {
                    alert('Ekspor dibatalkan: konfigurasi template pelanggan tidak ditemukan.');
                    return;
                }

                if (preset) {
                    // Semua preset mengunci ID Pelanggan dari konfigurasi, termasuk ASTRA dan INDTEMPO.
                    // Field UI tidak pernah menjadi sumber kebenaran customer_code untuk template preset.
                    finalCustomerId = preset.customerId;
                    if (preset.tariffCode && preset.lockTariff) finalTariffCode = preset.tariffCode;
                    if (preset.destinationZoneCode) destZoneCodeGlobal = preset.destinationZoneCode;
                    baseSenderName = preset.senderName || '';
                } else {
                    baseSenderName = cleanArtifacts(document.getElementById('senderName').value);
                }

                if (!finalCustomerId) {
                    alert('FATAL: ID Pelanggan kosong. Ekspor dibatalkan agar kiriman invoice tidak terbaca sebagai kiriman ritel.');
                    document.getElementById('customerId')?.focus();
                    return;
                }

                if (template === 'INDTEMPO') {
                    baseSenderName = cleanArtifacts(document.getElementById('senderName').value);
                    if (!baseSenderName) {
                        alert('Nama Pengirim wajib diisi untuk ID Pelanggan INDTEMPO01294A.');
                        document.getElementById('senderName')?.focus();
                        return;
                    }

                    const specialTariffChoice = document.getElementById('tempoBankSyariahTariff')?.value || '';
                    if (!specialTariffChoice) {
                        alert('Pilih apakah kiriman ini menggunakan tarif Bank Syariah Negara Cabang Batam.');
                        document.getElementById('tempoBankSyariahTariff')?.focus();
                        return;
                    }
                    if (specialTariffChoice === 'YES') {
                        finalTariffCode = '915552';
                        serviceCode = 'PKH';
                        itemType = 'DOKUMEN';
                    }
                }
            } else if (mode === 'RITEL') {
                finalCustomerId = ""; 
                finalTariffCode = ""; 
                baseSenderName = cleanArtifacts(document.getElementById('senderName').value);
                baseSenderPhone = cleanPhoneNumber(document.getElementById('senderPhone').value);
                baseSenderAddress = cleanArtifacts(document.getElementById('senderAddress').value);
            } else if (mode === 'PINDAH') {
                finalCustomerId = cleanArtifacts(document.getElementById('customerId').value);
                finalTariffCode = document.getElementById('tariffCode').value.trim().toUpperCase();
                baseSenderName = cleanArtifacts(document.getElementById('senderName').value);
                baseSenderPhone = cleanPhoneNumber(document.getElementById('senderPhone').value);
                baseSenderAddress = cleanArtifacts(document.getElementById('senderAddress').value);
                
                destZipCodeGlobal = document.getElementById('destZipPindah').value.trim();
                destZoneCodeGlobal = document.getElementById('destZonePindah').value.trim();

                if (!destZipCodeGlobal || !destZoneCodeGlobal) {
                    alert("Kodepos Tujuan dan Kode Zona Tujuan WAJIB diisi untuk Barang Pindah!");
                    return;
                }
            }

            let finalExportRows = [];
            let validationFailed = false;

            rows.forEach((tr, index) => {
                if (validationFailed) return;

                let dSenderName = cleanReference(tr.querySelector('.val-senderName').value);
                let dNoSurat = cleanReference(tr.querySelector('.val-noSurat').value);
                
                let dName = cleanRecipientName(tr.querySelector('.val-name').value);
                let dPhone = cleanPhoneNumber(tr.querySelector('.val-phone').value);
                let dZip = cleanArtifacts(tr.querySelector('.val-zip').value); 
                let dAddress = cleanAddressArtifacts(tr.querySelector('.val-address').value);
                
                // Override khusus Barang Pindah
                if (mode === 'PINDAH') {
                    dZip = destZipCodeGlobal;
                }

                let dWeightStr = tr.querySelector('.val-cw').value.replace(',', '.');
                let dWeight = parseFloat(dWeightStr) || 0.2;

                let dP = parseFloat(tr.querySelector('.val-p').value) || 10;
                let dL = parseFloat(tr.querySelector('.val-l').value) || 10;
                let dT = parseFloat(tr.querySelector('.val-t').value) || 10;

                let dHargaBarang = 0;
                if (useInsurance) {
                    dHargaBarang = parseFloat(tr.querySelector('.val-ins-harga').value) || 0;
                    if (mode === 'PINDAH' && dHargaBarang <= 0) {
                        alert(`Nilai Barang (Asuransi) pada Baris ke-${index + 1} WAJIB diisi (Tidak Boleh 0) untuk Barang Pindah!`);
                        validationFailed = true;
                        return;
                    }
                }

                let senderNameFinal, senderAddrFinal, senderPhoneFinal;

                if (mode === 'KORPORAT' && template === 'PN_BATAM') {
                    senderNameFinal = dSenderName ? dSenderName : cleanArtifacts(dNoSurat); 
                    senderAddrFinal = baseSenderName;
                    senderPhoneFinal = "0";
                } else if (mode === 'KORPORAT' && template === 'JACCS_MPM') {
                    senderNameFinal = "PT JACCS MPM FINANCE INDONESIA";
                    senderAddrFinal = baseSenderName;
                    senderPhoneFinal = "0";
                } else if (mode === 'KORPORAT' && template === 'INDTEMPO') {
                    senderNameFinal = baseSenderName;
                    senderAddrFinal = baseSenderName.includes('BATAM') ? baseSenderName : `${baseSenderName} BATAM`;
                    senderPhoneFinal = "0";
                } else if (mode === 'KORPORAT') {
                    senderNameFinal = dSenderName ? dSenderName : baseSenderName;
                    senderAddrFinal = baseSenderName;
                    if (!senderAddrFinal.includes("BATAM") && template !== 'POLRES') { senderAddrFinal += " BATAM"; }
                    senderPhoneFinal = "0";
                } else if (mode === 'RITEL' || mode === 'PINDAH') {
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
                    "destination_data_zone_code": destZoneCodeGlobal,        
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

            if (validationFailed) return;

            // Invariant terakhir sebelum file dibuat: kiriman korporat tidak boleh pernah memiliki customer_code kosong.
            if (mode === 'KORPORAT') {
                const invalidCustomerRow = finalExportRows.find(row => !String(row.customer_code || '').trim());
                if (invalidCustomerRow) {
                    alert('FATAL: ditemukan baris korporat tanpa ID Pelanggan. File tidak dibuat untuk mencegah kiriman terbaca sebagai ritel.');
                    return;
                }

                const preset = getCorporateTemplatePreset(template);
                if (preset && finalExportRows.some(row => row.customer_code !== preset.customerId)) {
                    alert('FATAL: ID Pelanggan hasil ekspor tidak sesuai template. File dibatalkan.');
                    return;
                }
            }

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

            let fileSuffix = mode === 'RITEL' ? "Ritel" : (mode === 'PINDAH' ? "BarangPindah" : (finalCustomerId || "Corporate"));
            XLSX.writeFile(workbook, `Upload_MileApp_${fileSuffix}.xlsx`);
        }
    