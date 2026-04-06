const axios = require('axios');

// Rate limiter
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000;

async function FinanceAI(userInput) {
    const currentDate = new Date();
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const todayInfo = `${dayNames[currentDate.getDay()]}, ${currentDate.getDate()} ${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    const currentTime = `${String(currentDate.getHours()).padStart(2, '0')}:${String(currentDate.getMinutes()).padStart(2, '0')}`;
    
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();

    const prompt = `Kamu adalah asisten keuangan. Analisis input berikut dan tentukan apakah ini transaksi keuangan yang valid atau bukan.

PENTING: Jika input BUKAN transaksi keuangan yang valid (seperti sapaan, pertanyaan random, kata acak tanpa konteks finansial), respon dengan JSON: {"valid": false, "reason": "alasan singkat"}

Jika valid, konversi menjadi format JSON yang valid.

Input user: "${userInput}"

Informasi waktu saat ini: ${todayInfo}, pukul ${currentTime}

Aturan:
1. Tentukan TIPE: "Pemasukan" atau "Pengeluaran"
   - Kata kunci pemasukan: dapat, terima, gaji, pendapatan, hasil, untung, cashback, transfer masuk, bonus
   - Kata kunci pengeluaran: beli, bayar, buat, belanja, keluar, spending, spend, pakai

2. Tentukan KATEGORI berdasarkan tipe:
   
   Untuk Pengeluaran:
   - Makanan & Minuman: makanan, makan, minum, kopi, nasi, snack, minuman, restoran, cafe, dll
   - Transportasi: bensin, grab, gojek, taxi, parkir, tol, ojol, ojek online, bus, kereta, dll
   - Belanja: baju, sepatu, elektronik, gadget, barang, shopping, marketplace, tokopedia, shopee, dll
   - Hiburan: nonton, bioskop, game, konser, liburan, wisata, rekreasi, jalan-jalan, dll
   - Kesehatan: obat, dokter, rumah sakit, vitamin, checkup, medical, apotek, dll
   - Pendidikan: buku, kursus, sekolah, kuliah, seminar, les, belajar, dll
   - Tagihan: listrik, air, internet, pulsa, wifi, token, langganan, subscription, dll
   - Tabungan: nabung, saving, simpan, celengan, dll
   - Investasi: saham, reksadana, crypto, emas, properti, investasi, dll

   Untuk Pemasukan:
   - Gaji: gaji, salary, upah, honorarium, dll
   - Investasi: dividen, profit, keuntungan investasi, hasil saham, dll
   - Transfer Masuk: transfer, kiriman, dikirim, terima transfer, dll
   - Cashback: cashback, voucher, reward, hadiah, promo, dll

3. Untuk TANGGAL:
   - Jika disebutkan "kemarin", gunakan 1 hari sebelum hari ini
   - Jika disebutkan "tadi pagi/siang/sore/malam", gunakan hari ini
   - Jika tidak disebutkan, gunakan hari ini
   - Format: Hari, DD Bulan YYYY

4. Untuk WAKTU:
   - pagi (06:00-10:00), siang (11:00-14:00), sore (15:00-18:00), malam (19:00-23:00)
   - Jika tidak disebutkan, gunakan waktu saat ini
   - Format: HH:MM

5. Untuk JUMLAH:
   - Ekstrak angka dari input (rb = ribu, jt = juta)
   - Format: angka tanpa Rp (contoh: 50000)

6. Untuk DESKRIPSI:
   - Buat deskripsi singkat dan jelas dari aktivitas
   - Hapus info nominal dan waktu dari deskripsi

7. CATATAN (opsional):
   - Jika ada info tambahan yang tidak masuk ke field lain

8. VALIDASI:
   - Jumlah harus > 0
   - Harus ada deskripsi yang masuk akal
   - Jika input tidak jelas atau asal-asalan (misal: "hola", "test", "abc 123"), tandai sebagai tidak valid

Berikan output dalam format JSON yang VALID dan DAPAT DI-PARSE:

Jika TIDAK VALID (bukan transaksi):
{
  "valid": false,
  "reason": "Input bukan transaksi keuangan yang valid"
}

Jika VALID (transaksi):
{
  "valid": true,
  "tipe": "Pemasukan/Pengeluaran",
  "tanggal": "Hari, DD Bulan YYYY",
  "waktu": "HH:MM",
  "deskripsi": "deskripsi singkat",
  "jumlah": angka_nominal,
  "kategori": "kategori_yang_sesuai",
  "catatan": "catatan tambahan atau kosongkan"
}

PENTING: Hanya berikan JSON, tidak ada penjelasan tambahan!`;

    const apiKey = global.geminiApiKey;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                {
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2048
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            // Parse response dari Gemini
            if (!response.data.candidates || !response.data.candidates[0]) {
                throw new Error('AI tidak memberikan response');
            }
            
            let aiResponse = response.data.candidates[0].content.parts[0].text;
            
            // Ekstrak JSON dari response (kadang AI memberikan penjelasan tambahan)
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                aiResponse = jsonMatch[0];
            }
            
            // Parse JSON
            const parsedData = JSON.parse(aiResponse);
            
            // Cek apakah transaksi valid
            if (parsedData.valid === false) {
                return { valid: false, reason: parsedData.reason || "Input bukan transaksi yang valid" };
            }
            
            // Validasi dan set default jika perlu
            parsedData.valid = true;
            if (!parsedData.tipe) parsedData.tipe = "Pengeluaran";
            if (!parsedData.tanggal) parsedData.tanggal = todayInfo;
            if (!parsedData.waktu) parsedData.waktu = currentTime;
            if (!parsedData.deskripsi) parsedData.deskripsi = userInput;
            if (!parsedData.jumlah || parsedData.jumlah <= 0) {
                return { valid: false, reason: "Nominal transaksi tidak valid atau 0" };
            }
            if (!parsedData.kategori) parsedData.kategori = parsedData.tipe === "Pemasukan" ? "Transfer Masuk" : "Belanja";
            if (!parsedData.catatan) parsedData.catatan = "-";
            
            return parsedData;
            
        } catch (error) {
            // Handle rate limit
            if (error.response && error.response.status === 429) {
                if (attempt < maxRetries) {
                    const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    console.log(`Rate limit hit, waiting ${waitTime}ms before retry ${attempt + 1}...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
            }
            
            console.error("Finance AI error:", error.message);
            
            // Fallback parsing manual sederhana jika retry habis
            if (attempt === maxRetries) {
                const fallbackData = manualParse(userInput, todayInfo, currentTime);
                return fallbackData;
            }
        }
    }
    
    // Fallback final
    return manualParse(userInput, todayInfo, currentTime);
}

// Fallback manual parsing jika AI gagal
function manualParse(input, todayInfo, currentTime) {
    
    // Deteksi tipe
    const pemasukanKeywords = ['dapat', 'terima', 'gaji', 'pendapatan', 'hasil', 'untung', 'cashback', 'bonus'];
    const isPemasukan = pemasukanKeywords.some(keyword => input.toLowerCase().includes(keyword));
    const tipe = isPemasukan ? "Pemasukan" : "Pengeluaran";
    
    // Ekstrak nominal
    let jumlah = 0;
    const nominalMatch = input.match(/(\d+)\s*(rb|ribu|jt|juta|k)?/i);
    if (nominalMatch) {
        jumlah = parseInt(nominalMatch[1]);
        if (nominalMatch[2]) {
            const unit = nominalMatch[2].toLowerCase();
            if (unit === 'rb' || unit === 'ribu' || unit === 'k') jumlah *= 1000;
            if (unit === 'jt' || unit === 'juta') jumlah *= 1000000;
        }
    }
    
    // Validasi jumlah
    if (!jumlah || jumlah <= 0) {
        return { valid: false, reason: "Tidak dapat mendeteksi nominal transaksi yang valid" };
    }
    
    // Kategori default
    const kategori = tipe === "Pemasukan" ? "Transfer Masuk" : "Belanja";
    
    return {
        valid: true,
        tipe,
        tanggal: todayInfo,
        waktu: currentTime,
        deskripsi: input,
        jumlah,
        kategori,
        catatan: "-"
    };
}

module.exports = FinanceAI;
