const axios = require('axios');

// Rate limiter
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000;

async function SummaryAI(transactionsData, periode = 'semua') {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();

    // Hitung total
    const totalPemasukan = transactionsData.pemasukan.reduce((sum, t) => sum + t.jumlah, 0);
    const totalPengeluaran = transactionsData.pengeluaran.reduce((sum, t) => sum + t.jumlah, 0);
    const saldo = totalPemasukan - totalPengeluaran;
    
    // Hitung rata-rata
    const avgPemasukan = transactionsData.pemasukan.length > 0 ? totalPemasukan / transactionsData.pemasukan.length : 0;
    const avgPengeluaran = transactionsData.pengeluaran.length > 0 ? totalPengeluaran / transactionsData.pengeluaran.length : 0;

    // Kelompokkan pengeluaran per kategori
    const pengeluaranPerKategori = {};
    transactionsData.pengeluaran.forEach(t => {
        if (!pengeluaranPerKategori[t.kategori]) {
            pengeluaranPerKategori[t.kategori] = 0;
        }
        pengeluaranPerKategori[t.kategori] += t.jumlah;
    });

    // Kelompokkan pemasukan per kategori
    const pemasukanPerKategori = {};
    transactionsData.pemasukan.forEach(t => {
        if (!pemasukanPerKategori[t.kategori]) {
            pemasukanPerKategori[t.kategori] = 0;
        }
        pemasukanPerKategori[t.kategori] += t.jumlah;
    });

    const prompt = `Kamu adalah Financial Advisor profesional. Analisis data keuangan periode "${periode}" berikut dan berikan laporan keuangan yang komprehensif, detail, dan actionable.

DATA KEUANGAN USER (Periode: ${periode}):
${JSON.stringify({
    periode: periode,
    totalPemasukan,
    totalPengeluaran,
    saldo,
    rataRataPemasukan: Math.round(avgPemasukan),
    rataRataPengeluaran: Math.round(avgPengeluaran),
    jumlahTransaksiPemasukan: transactionsData.pemasukan.length,
    jumlahTransaksiPengeluaran: transactionsData.pengeluaran.length,
    savingRate: totalPemasukan > 0 ? ((saldo / totalPemasukan) * 100).toFixed(1) + '%' : '0%',
    pengeluaranPerKategori,
    pemasukanPerKategori,
    detailTransaksi: {
        pemasukan: transactionsData.pemasukan,
        pengeluaran: transactionsData.pengeluaran
    }
}, null, 2)}

TUGAS ANALISIS LENGKAP:

1. **📊 OVERVIEW KEUANGAN**
   - Status keuangan: Sehat/Perlu Perhatian/Kritis (dengan skor 0-100)
   - Saldo & Saving Rate
   - Perbandingan pemasukan vs pengeluaran

2. **💰 ANALISIS PEMASUKAN**
   - Total & rata-rata per transaksi
   - Sumber pemasukan utama (kategori terbesar)
   - Konsistensi pemasukan
   - Insight tren pemasukan

3. **💸 ANALISIS PENGELUARAN DETAIL**
   - Total & rata-rata per transaksi
   - Breakdown per kategori dengan persentase
   - Kategori terbesar (top 3)
   - Identifikasi pengeluaran boros/tidak efisien
   - Perbandingan dengan standar ideal (jika relevan)

4. **📈 BUDGET HEALTH SCORE (0-100)**
   Buat skor kesehatan budget berdasarkan:
   - Saving rate (30%)
   - Diversifikasi pengeluaran (20%)
   - Konsistensi pemasukan (20%)
   - Efisiensi pengeluaran (30%)
   
   Berikan skor total dan interpretasinya.

5. **🎯 INSIGHT & PATTERN**
   - Kebiasaan finansial yang terdeteksi
   - Pola pengeluaran (impulsif/terencana)
   - Kategori yang perlu dikurangi
   - Kategori yang sudah efisien

6. **💡 REKOMENDASI STRATEGIS**
   - 3-5 aksi konkret untuk meningkatkan kondisi keuangan
   - Alokasi budget ideal (format: kategori - target %)
   - Tips hemat spesifik per kategori boros
   - Target saving rate yang realistis
   - Warning jika ada red flag

7. **🏆 MOTIVASI & TARGET**
   - Apresiasi hal positif yang sudah dilakukan
   - Target improvement yang achievable
   - Motivasi positif untuk periode berikutnya

FORMAT OUTPUT:
- Gunakan Markdown dengan emoji
- Struktur jelas dengan header
- Angka format Rupiah (Rp###.###)
- Bold untuk highlight penting
- Maksimal 35 baris, padat berisi
- Bahasa Indonesia profesional tapi friendly
- Hindari jargon rumit

PENTING:
- Analisis harus berdasarkan DATA, bukan asumsi
- Berikan skor & persentase yang spesifik
- Rekomendasi harus actionable & realistis
- Jika ada masalah, sampaikan dengan empati tapi jujur
- Akhiri dengan motivasi positif`;

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
                        temperature: 0.7,
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

            // Parse response dari Gemini dengan validasi lengkap
            if (!response.data) {
                throw new Error('No response data');
            }
            
            if (!response.data.candidates || response.data.candidates.length === 0) {
                console.error('No candidates in response:', JSON.stringify(response.data, null, 2));
                throw new Error('AI tidak memberikan response - no candidates');
            }
            
            const candidate = response.data.candidates[0];
            if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
                console.error('Invalid candidate structure:', JSON.stringify(candidate, null, 2));
                throw new Error('AI tidak memberikan response - invalid structure');
            }
            
            const aiSummary = candidate.content.parts[0].text;
            
            if (!aiSummary || aiSummary.trim() === '') {
                throw new Error('AI memberikan response kosong');
            }
            
            return aiSummary;
            
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
            
            // Log error detail untuk debugging
            if (error.response) {
                console.error("Summary AI error response:", error.response.status, error.response.data);
            } else {
                console.error("Summary AI error:", error.message);
            }
            
            // Fallback parsing manual jika retry habis
            if (attempt === maxRetries) {
                return generateFallbackSummary(totalPemasukan, totalPengeluaran, saldo, pengeluaranPerKategori, pemasukanPerKategori, transactionsData);
            }
        }
    }
    
    // Fallback final
    return generateFallbackSummary(totalPemasukan, totalPengeluaran, saldo, pengeluaranPerKategori, pemasukanPerKategori, transactionsData);
}

// Fallback manual summary jika AI gagal
function generateFallbackSummary(totalPemasukan, totalPengeluaran, saldo, pengeluaranPerKategori, pemasukanPerKategori, transactionsData) {
    const formatRupiah = (angka) => 'Rp' + angka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    const savingRate = totalPemasukan > 0 ? ((saldo / totalPemasukan) * 100).toFixed(1) : 0;
    const avgPengeluaran = transactionsData.pengeluaran.length > 0 ? totalPengeluaran / transactionsData.pengeluaran.length : 0;
    
    // Budget Health Score sederhana
    let healthScore = 0;
    if (savingRate >= 20) healthScore += 40;
    else if (savingRate >= 10) healthScore += 25;
    else if (savingRate > 0) healthScore += 15;
    
    if (saldo >= 0) healthScore += 30;
    if (transactionsData.pengeluaran.length > 0) healthScore += 15;
    if (Object.keys(pengeluaranPerKategori).length >= 3) healthScore += 15;
    
    const statusKeuangan = healthScore >= 70 ? "💚 Sehat" : healthScore >= 40 ? "💛 Perlu Perhatian" : "❤️ Kritis";
    
    // Kategori pengeluaran terbesar
    const kategoriTerbesar = Object.entries(pengeluaranPerKategori)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    
    let summary = `*RINGKASAN KEUANGAN*\n\n`;
    summary += `*Status:* ${statusKeuangan} (Skor: ${healthScore}/100)\n`;
    summary += `*Saving Rate:* ${savingRate}%\n\n`;
    
    summary += `*OVERVIEW*\n`;
    summary += `Pemasukan: ${formatRupiah(totalPemasukan)}\n`;
    summary += `Pengeluaran: ${formatRupiah(totalPengeluaran)}\n`;
    summary += `━━━━━━━━━━━━━━\n`;
    summary += `Saldo: ${formatRupiah(saldo)}\n\n`;
    
    summary += `*STATISTIK*\n`;
    summary += `Rata-rata pengeluaran: ${formatRupiah(Math.round(avgPengeluaran))}\n`;
    summary += `Total transaksi: ${transactionsData.pemasukan.length + transactionsData.pengeluaran.length}x\n\n`;
    
    if (kategoriTerbesar.length > 0) {
        summary += `*TOP PENGELUARAN*\n`;
        kategoriTerbesar.forEach((item, index) => {
            const persentase = ((item[1] / totalPengeluaran) * 100).toFixed(1);
            summary += `${index + 1}. ${item[0]}: ${formatRupiah(item[1])} (${persentase}%)\n`;
        });
        summary += `\n`;
    }
    
    summary += `*REKOMENDASI*\n`;
    if (savingRate < 10) {
        summary += `• Tingkatkan saving rate ke minimal 20%\n`;
    }
    if (saldo < 0) {
        summary += `• URGENT: Kurangi pengeluaran segera!\n`;
    }
    if (kategoriTerbesar.length > 0 && kategoriTerbesar[0][1] > totalPengeluaran * 0.4) {
        summary += `• Kategori "${kategoriTerbesar[0][0]}" terlalu tinggi\n`;
    }
    summary += `• Track pengeluaran lebih konsisten\n\n`;
    summary += `Tetap semangat mengelola keuangan!`;
    
    return summary;
}

module.exports = SummaryAI;
