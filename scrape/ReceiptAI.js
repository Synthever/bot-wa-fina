const axios = require('axios');

// Rate limiter untuk mencegah terlalu banyak request
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 detik antar request

async function ReceiptAI(imageBuffer) {
    try {
        // Rate limiting: tunggu jika request terlalu cepat
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            console.log(`Rate limiting: menunggu ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        lastRequestTime = Date.now();
        
        // Konversi gambar ke base64
        const base64Image = imageBuffer.toString('base64');
        
        // Kirim langsung ke AI untuk analisis gambar dengan retry
        const receiptData = await analyzeReceiptWithAI(base64Image);
        return receiptData;
        
    } catch (error) {
        console.error('Receipt AI Error:', error.message);
        return { 
            valid: false, 
            isReceipt: false,
            reason: "Gagal memproses gambar" 
        };
    }
}

// Analisis gambar struk langsung dengan AI Vision
async function analyzeReceiptWithAI(base64Image) {
    const currentDate = new Date();
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const todayInfo = `${dayNames[currentDate.getDay()]}, ${currentDate.getDate()} ${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    const currentTime = `${String(currentDate.getHours()).padStart(2, '0')}:${String(currentDate.getMinutes()).padStart(2, '0')}`;

    // Gunakan API key dari global config
    const apiKey = global.geminiApiKey;
    
    const prompt = `Kamu adalah asisten keuangan yang menganalisis gambar struk belanja.

PENTING: Jika gambar ini BUKAN struk/nota belanja (misalnya foto orang, pemandangan, meme, dll), respon dengan:
{
  "valid": false,
  "isReceipt": false,
  "reason": "Gambar bukan struk atau nota belanja"
}

Jika ini adalah struk/nota belanja, analisis dan ekstrak informasi berikut:

Tugas:
1. VALIDASI: Pastikan ini benar-benar struk/nota (ada total, harga, nama toko)
2. Ekstrak TOTAL PEMBAYARAN (cari: total, grand total, total bayar, amount, jumlah)
3. Ekstrak NAMA TOKO/MERCHANT (biasanya di bagian atas struk)
4. Ekstrak TANGGAL transaksi jika terlihat di struk
5. Ekstrak ITEM yang dibeli (jika terlihat jelas)
6. Tentukan KATEGORI belanja berdasarkan:
   - Makanan & Minuman: cafe, restaurant, kfc, mcd, starbucks, warteg, makanan, minuman, kedai kopi
   - Transportasi: grab, gojek, taxi, uber, bensin, pertamina, shell, spbu
   - Belanja: indomaret, alfamart, supermarket, hypermart, carrefour, mall, toko
   - Kesehatan: apotek, kimia farma, guardian, century, klinik, rumah sakit
   - Tagihan: listrik, pln, air, pdam, internet, indihome, telkom, wifi

Output format JSON:

Jika BUKAN struk:
{
  "valid": false,
  "isReceipt": false,
  "reason": "Gambar bukan struk belanja"
}

Jika STRUK VALID:
{
  "valid": true,
  "isReceipt": true,
  "tipe": "Pengeluaran",
  "tanggal": "Hari, DD Bulan YYYY",
  "waktu": "HH:MM",
  "deskripsi": "Belanja di [Nama Toko]",
  "jumlah": angka_total_tanpa_Rp,
  "kategori": "kategori",
  "catatan": "Detail item (singkat)",
  "merchant": "Nama Toko"
}

Default jika tidak ada di struk:
- Tanggal: ${todayInfo}
- Waktu: ${currentTime}

PENTING: Hanya JSON, tanpa penjelasan!`;

    // Retry mechanism untuk handle rate limit
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${maxRetries} - Analyzing receipt...`);
            
            // Gunakan Google Gemini 2.0 Flash Experimental
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                {
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg",
                                    data: base64Image
                                }
                            }
                        ]
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

            // Extract response dari Gemini
            if (!response.data.candidates || !response.data.candidates[0]) {
                throw new Error('AI tidak memberikan response');
            }
            
            const aiResponse = response.data.candidates[0].content.parts[0].text;
        
        // Ekstrak JSON dari response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('AI tidak memberikan response JSON yang valid');
        }
        
        const parsedData = JSON.parse(jsonMatch[0]);
        
        // Cek apakah ini struk atau bukan
        if (parsedData.isReceipt === false || parsedData.valid === false) {
            return parsedData; // Return langsung jika bukan struk
        }
        
        // Validasi data struk
        if (!parsedData.jumlah || parsedData.jumlah <= 0) {
            return { 
                valid: false, 
                isReceipt: true,
                reason: "Tidak dapat mendeteksi total pembayaran di struk" 
            };
        }
        
        // Set properties yang diperlukan
        parsedData.valid = true;
        parsedData.isReceipt = true;
        parsedData.tipe = "Pengeluaran";
        
        // Set default jika tidak ada
        if (!parsedData.tanggal) parsedData.tanggal = todayInfo;
        if (!parsedData.waktu) parsedData.waktu = currentTime;
        if (!parsedData.deskripsi) parsedData.deskripsi = `Belanja di ${parsedData.merchant || 'Toko'}`;
        if (!parsedData.kategori) parsedData.kategori = "Belanja";
        if (!parsedData.catatan) parsedData.catatan = "-";
        if (!parsedData.merchant) parsedData.merchant = "Toko";
        
            return parsedData;
            
        } catch (error) {
            lastError = error;
            
            // Handle rate limit (429)
            if (error.response && error.response.status === 429) {
                console.log(`Rate limit hit on attempt ${attempt}. Waiting before retry...`);
                
                // Tunggu lebih lama untuk setiap retry (exponential backoff)
                const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                console.log(`Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Jika ini retry terakhir, return error
                if (attempt === maxRetries) {
                    return { 
                        valid: false, 
                        isReceipt: false,
                        reason: "API rate limit tercapai. Tunggu 1-2 menit dan coba lagi." 
                    };
                }
                
                continue; // Coba lagi
            }
            
            // Handle error lainnya
            if (error.response) {
                const status = error.response.status;
                if (status === 400) {
                    return { 
                        valid: false, 
                        isReceipt: false,
                        reason: "Format gambar tidak didukung. Kirim gambar JPG/PNG." 
                    };
                } else if (status === 403) {
                    return { 
                        valid: false, 
                        isReceipt: false,
                        reason: "API key tidak valid atau tidak memiliki akses." 
                    };
                }
            }
            
            // Jika bukan 429 atau ini retry terakhir, break
            if (attempt === maxRetries) {
                console.error('Analyze Receipt Error:', error.message);
                return { 
                    valid: false, 
                    isReceipt: false,
                    reason: "Gagal menganalisis gambar. Coba lagi dalam beberapa saat." 
                };
            }
        }
    }
    
    // Fallback jika semua retry gagal
    return { 
        valid: false, 
        isReceipt: false,
        reason: "Gagal menganalisis gambar setelah beberapa percobaan." 
    };
}

module.exports = ReceiptAI;
