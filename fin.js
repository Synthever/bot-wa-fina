// Import Module
require('./general')
require('./database/Menu/finMenu')
const fs = require('fs');
const axios = require('axios');
const { downloadMediaMessage } = require('baileys');
const sharp = require('sharp');

// Import Scrape
const Ai4Chat = require('./scrape/Ai4Chat');
const FinanceAI = require('./scrape/FinanceAI');
const ReceiptAI = require('./scrape/ReceiptAI');
const SummaryAI = require('./scrape/SummaryAI');
const VoiceAI = require('./scrape/VoiceAI');
const { makeStickerWithFallback, validateStickerMedia, getMediaInfo } = require('./scrape/StickerMaker');

// Path database transaksi
const transactionsDir = './database/transactions';

// Fungsi untuk load transactions per user
function loadUserTransactions(userId) {
    // Buat folder jika belum ada
    if (!fs.existsSync(transactionsDir)) {
        fs.mkdirSync(transactionsDir, { recursive: true });
    }
    
    const userFile = `${transactionsDir}/${userId.replace('@s.whatsapp.net', '')}.json`;
    
    if (!fs.existsSync(userFile)) {
        const initialData = { 
            userId: userId,
            pemasukan: [], 
            pengeluaran: [] 
        };
        fs.writeFileSync(userFile, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    
    return JSON.parse(fs.readFileSync(userFile, 'utf-8'));
}

// Fungsi untuk save transactions per user
function saveUserTransactions(userId, data) {
    const userFile = `${transactionsDir}/${userId.replace('@s.whatsapp.net', '')}.json`;
    data.userId = userId;
    fs.writeFileSync(userFile, JSON.stringify(data, null, 2));
}

// Format rupiah
function formatRupiah(angka) {
    return 'Rp' + angka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Fungsi untuk filter transaksi berdasarkan periode
function filterTransactionsByPeriod(transactions, period) {
    const now = new Date();
    let startDate;
    
    // Parse custom period (contoh: "3 hari", "2 minggu", "1 bulan")
    const customMatch = period.match(/(\d+)\s*(hari|minggu|bulan|tahun)/i);
    
    if (customMatch) {
        const amount = parseInt(customMatch[1]);
        const unit = customMatch[2].toLowerCase();
        
        startDate = new Date(now);
        if (unit === 'hari') {
            startDate.setDate(startDate.getDate() - amount);
        } else if (unit === 'minggu') {
            startDate.setDate(startDate.getDate() - (amount * 7));
        } else if (unit === 'bulan') {
            startDate.setMonth(startDate.getMonth() - amount);
        } else if (unit === 'tahun') {
            startDate.setFullYear(startDate.getFullYear() - amount);
        }
    } else {
        // Periode preset
        switch(period.toLowerCase()) {
            case 'hari':
            case 'harian':
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'kemarin':
            case 'yesterday':
                // Buat tanggal kemarin
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.getDate();
                const yesterdayMonth = yesterday.getMonth();
                const yesterdayYear = yesterday.getFullYear();
                
                return {
                    pemasukan: transactions.pemasukan.filter(t => {
                        if (!t.timestamp) return false;
                        const tDate = new Date(t.timestamp);
                        return tDate.getDate() === yesterdayStr && 
                            tDate.getMonth() === yesterdayMonth && 
                            tDate.getFullYear() === yesterdayYear;
                    }),
                    pengeluaran: transactions.pengeluaran.filter(t => {
                        if (!t.timestamp) return false;
                        const tDate = new Date(t.timestamp);
                        return tDate.getDate() === yesterdayStr && 
                            tDate.getMonth() === yesterdayMonth && 
                            tDate.getFullYear() === yesterdayYear;
                    })
                };
            case 'minggu':
            case 'mingguan':
            case 'week':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'bulan':
            case 'bulanan':
            case 'month':
                startDate = new Date(now);
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'tahun':
            case 'tahunan':
            case 'year':
                startDate = new Date(now);
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                // Semua data
                return transactions;
        }
    }
    
    return {
        pemasukan: transactions.pemasukan.filter(t => new Date(t.timestamp) >= startDate),
        pengeluaran: transactions.pengeluaran.filter(t => new Date(t.timestamp) >= startDate)
    };
}

module.exports = async (fin, m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const sender = msg.key.remoteJid;
    const pushname = msg.pushName || "fin";
    
    // Ignore pesan dari bot sendiri
    if (msg.key.fromMe) return;
    
    const finreply = (teks) => fin.sendMessage(sender, { text: teks }, { quoted: msg });
    const isGroup = sender.endsWith('@g.us');
    const isAdmin = (admin.includes(sender))
    
    // Cek apakah pesan menggunakan prefix
    const prefixMatch = body.match(prefix);
    
    // Deteksi gambar (untuk fitur scan struk)
    const hasImage = msg.message.imageMessage || msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    
    // Deteksi voice note (untuk fitur catat via suara)
    const hasVoice = msg.message.audioMessage && msg.message.audioMessage.ptt === true;
    
    // Handler untuk voice note (catat transaksi via suara)
    if (hasVoice) {
        try {
            finreply('Mendengarkan voice note...');
            
            // Download audio
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            
            // Proses audio dengan AI (speech to text)
            const voiceResult = await VoiceAI(buffer);
            
            if (!voiceResult.success) {
                return finreply(`❌ ${voiceResult.error}`);
            }
            
            const transcription = voiceResult.text;
            
            // Tampilkan hasil transkripsi
            await finreply(`*Transkripsi:*\n"${transcription}"\n\nMemproses transaksi...`);
            
            // Proses transaksi dengan FinanceAI
            const transactionData = await FinanceAI(transcription);
            
            // Cek validasi
            if (transactionData.valid === false) {
                return finreply(`*Input Tidak Valid*\n\n${transactionData.reason || 'Input bukan transaksi keuangan yang valid.'}\n\n_Pastikan voice note mengandung aktivitas dan nominal yang jelas._`);
            }
            
            // Load data transaksi user
            const transactions = loadUserTransactions(sender);
            
            // Tambahkan ID dan timestamp
            transactionData.id = Date.now();
            transactionData.timestamp = new Date().toISOString();
            
            // Simpan ke database
            if (transactionData.tipe === "Pemasukan") {
                transactions.pemasukan.push(transactionData);
            } else {
                transactions.pengeluaran.push(transactionData);
            }
            saveUserTransactions(sender, transactions);
            
            // Format pesan response dengan button
            const responseMsg = `*Transaksi dari Voice Note Berhasil Dicatat*\n\n` +
                `*Tipe:* ${transactionData.tipe}\n` +
                `*Tanggal:* ${transactionData.tanggal}\n` +
                `*Waktu:* ${transactionData.waktu}\n` +
                `*Deskripsi:* ${transactionData.deskripsi}\n` +
                `*Jumlah:* ${formatRupiah(transactionData.jumlah)}\n` +
                `*Kategori:* ${transactionData.kategori}\n` +
                `*Catatan:* ${transactionData.catatan}\n\n` +
                `_ID: ${transactionData.id}_`;
            
            await fin.sendMessage(sender, {
                text: responseMsg,
                footer: 'Fin Finance Bot',
                buttons: [
                    { buttonId: `.hapus ${transactionData.id}`, buttonText: { displayText: '🗑️ Hapus Transaksi' }, type: 1 }
                ],
                headerType: 1
            }, { quoted: msg });
            return;
        } catch (error) {
            console.error('Error processing voice note:', error);
            finreply('Gagal memproses voice note. Coba lagi dengan suara yang lebih jelas.');
            return;
        }
    }
    
    // Handler untuk gambar struk (tanpa prefix atau dengan prefix .catat)
    if (hasImage && (!prefixMatch || (prefixMatch && body.toLowerCase().includes('catat')))) {
        try {
            finreply('Menganalisis gambar...');
            
            // Download gambar
            let buffer;
            if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
                const quotedMsgObj = {
                    key: msg.message.extendedTextMessage.contextInfo.quotedMessage,
                    message: msg.message.extendedTextMessage.contextInfo.quotedMessage
                };
                buffer = await downloadMediaMessage(quotedMsgObj, 'buffer', {});
            } else {
                buffer = await downloadMediaMessage(msg, 'buffer', {});
            }
            
            // Proses gambar dengan AI
            const receiptData = await ReceiptAI(buffer);
            
            // Cek apakah gambar adalah struk
            if (!receiptData.isReceipt) {
                return finreply('Butuh bantuan? Ketik !menu');
            }
            
            // Cek validasi
            if (receiptData.valid === false) {
                return finreply(`${receiptData.reason}\n\nPastikan foto struk jelas dan terlihat total pembayarannya.`);
            }
            
            // Load data transaksi user
            const transactions = loadUserTransactions(sender);
            
            // Tambahkan ID dan timestamp
            receiptData.id = Date.now();
            receiptData.timestamp = new Date().toISOString();
            
            // Simpan ke database
            transactions.pengeluaran.push(receiptData);
            saveUserTransactions(sender, transactions);
            
            // Format pesan response dengan button
            const responseMsg = `*Transaksi dari Struk Berhasil Dicatat*\n\n` +
                `*Merchant:* ${receiptData.merchant || '-'}\n` +
                `*Tipe:* ${receiptData.tipe}\n` +
                `*Tanggal:* ${receiptData.tanggal}\n` +
                `*Waktu:* ${receiptData.waktu}\n` +
                `*Deskripsi:* ${receiptData.deskripsi}\n` +
                `*Jumlah:* ${formatRupiah(receiptData.jumlah)}\n` +
                `*Kategori:* ${receiptData.kategori}\n` +
                `*Catatan:* ${receiptData.catatan}\n\n` +
                `_ID: ${receiptData.id}_`;
            
            await fin.sendMessage(sender, {
                text: responseMsg,
                footer: 'Fin Finance Bot',
                buttons: [
                    { buttonId: `.hapus ${receiptData.id}`, buttonText: { displayText: '🗑️ Hapus Transaksi' }, type: 1 }
                ],
                headerType: 1
            }, { quoted: msg });
            return;
        } catch (error) {
            console.error('Error processing receipt:', error);
            finreply('Gagal memproses gambar struk. Pastikan gambar jelas dan terlihat.');
            return;
        }
    }
    
    // Jika tidak ada prefix, cek apakah ini input transaksi keuangan
    if (!prefixMatch) {
        // Deteksi kata kunci transaksi keuangan
        const financeKeywords = ['beli', 'bayar', 'belanja', 'dapat', 'terima', 'gaji', 'keluar', 'masuk', 'transfer', 'cashback', 'spending', 'spend', 'pakai', 'nabung', 'investasi'];
        const hasFinanceKeyword = financeKeywords.some(keyword => body.toLowerCase().includes(keyword));
        
        // Deteksi angka (nominal)
        const hasNumber = /\d+/.test(body);
        
        if (hasFinanceKeyword && hasNumber) {
            try {
                finreply(mess.wait);
                
                // Proses dengan AI
                const transactionData = await FinanceAI(body);
                
                // Cek validasi dari AI
                if (transactionData.valid === false) {
                    return finreply(`*Input Tidak Valid*\n\n${transactionData.reason || 'Input bukan transaksi keuangan yang valid.'}\n\n_Pastikan input mengandung aktivitas dan nominal yang jelas._`);
                }
                
                // Load data transaksi user
                const transactions = loadUserTransactions(sender);
                
                // Tambahkan ID dan timestamp
                transactionData.id = Date.now();
                transactionData.timestamp = new Date().toISOString();
                
                // Simpan ke database
                if (transactionData.tipe === "Pemasukan") {
                    transactions.pemasukan.push(transactionData);
                } else {
                    transactions.pengeluaran.push(transactionData);
                }
                saveUserTransactions(sender, transactions);
                
                // Format pesan response dengan button
                const responseMsg = `*Transaksi Berhasil Dicatat*\n\n` +
                    `*Tipe:* ${transactionData.tipe}\n` +
                    `*Tanggal:* ${transactionData.tanggal}\n` +
                    `*Waktu:* ${transactionData.waktu}\n` +
                    `*Deskripsi:* ${transactionData.deskripsi}\n` +
                    `*Jumlah:* ${formatRupiah(transactionData.jumlah)}\n` +
                    `*Kategori:* ${transactionData.kategori}\n` +
                    `*Catatan:* ${transactionData.catatan}\n\n` +
                    `_ID: ${transactionData.id}_`;
                
                await fin.sendMessage(sender, {
                    text: responseMsg,
                    footer: 'Fin Finance Bot',
                    buttons: [
                        { buttonId: `.hapus ${transactionData.id}`, buttonText: { displayText: '🗑️ Hapus Transaksi' }, type: 1 }
                    ],
                    headerType: 1
                }, { quoted: msg });
                return;
            } catch (error) {
                console.error("Error processing transaction:", error);
                finreply("Gagal memproses transaksi. Pastikan format benar.");
                return;
            }
        }
        return;
    }
    
    const usedPrefix = prefixMatch[0];
    const args = body.slice(usedPrefix.length).trim().split(" ");
    const command = args.shift().toLowerCase();
    const q = args.join(" ");

switch (command) {

// Menu
case "menu": {
    try {
        const menuImage = fs.readFileSync(image);
        await fin.sendMessage(sender,
            {
                image: menuImage,
                caption: finmenu,
                mentions: [sender]
            },
        { quoted: msg }
        )
    } catch (error) {
        console.error("Error sending menu:", error);
        finreply(finmenu);
    }
}
break

// Catat transaksi manual dengan command
case "catat":
case "transaksi": {
    if (!q) return finreply(`*Contoh penggunaan:*\n${usedPrefix}catat beli kopi 20rb di starbucks`);
    
    try {
        finreply(mess.wait);
        
        // Proses dengan AI
        const transactionData = await FinanceAI(q);
        
        // Cek validasi dari AI
        if (transactionData.valid === false) {
            return finreply(`*Input Tidak Valid*\n\n${transactionData.reason || 'Input bukan transaksi keuangan yang valid.'}\n\n_Pastikan input mengandung aktivitas dan nominal yang jelas._\n\n*Contoh:* ${usedPrefix}catat beli kopi 20rb`);
        }
        
        // Load data transaksi user
        const transactions = loadUserTransactions(sender);
        
        // Tambahkan ID dan timestamp
        transactionData.id = Date.now();
        transactionData.timestamp = new Date().toISOString();
        
        // Simpan ke database
        if (transactionData.tipe === "Pemasukan") {
            transactions.pemasukan.push(transactionData);
        } else {
            transactions.pengeluaran.push(transactionData);
        }
        saveUserTransactions(sender, transactions);
        
        // Format pesan response dengan button
        const responseMsg = `*Transaksi Berhasil Dicatat*\n\n` +
            `*Tipe:* ${transactionData.tipe}\n` +
            `*Tanggal:* ${transactionData.tanggal}\n` +
            `*Waktu:* ${transactionData.waktu}\n` +
            `*Deskripsi:* ${transactionData.deskripsi}\n` +
            `*Jumlah:* ${formatRupiah(transactionData.jumlah)}\n` +
            `*Kategori:* ${transactionData.kategori}\n` +
            `*Catatan:* ${transactionData.catatan}\n\n` +
            `_ID: ${transactionData.id}_`;
        
        await fin.sendMessage(sender, {
            text: responseMsg,
            footer: 'Fin Finance Bot',
            buttons: [
                { buttonId: `.hapus ${transactionData.id}`, buttonText: { displayText: '🗑️ Hapus Transaksi' }, type: 1 }
            ],
            headerType: 1
        }, { quoted: msg });
    } catch (error) {
        console.error("Error:", error);
        finreply(mess.error);
    }
}
break

// Lihat riwayat transaksi
case "riwayat":
case "riwayattransaksi":
case "history":
case "historytransaksi":
case "transaksilist": {
    try {
        const transactions = loadUserTransactions(sender);
        
        // Cek apakah ada parameter periode
        if (!q || q.trim() === '') {
            return finreply(`*Pilih Periode Riwayat Transaksi*\n\n` +
                `Ketik: ${usedPrefix}riwayat [periode]\n\n` +
                `*Periode yang tersedia:*\n` +
                `• harian / hari - Transaksi hari ini\n` +
                `• kemarin - Transaksi kemarin\n` +
                `• mingguan / minggu - 7 hari terakhir\n` +
                `• bulanan / bulan - 30 hari terakhir\n` +
                `• tahunan / tahun - 1 tahun terakhir\n` +
                `• semua - Semua transaksi\n\n` +
                `*Custom:*\n` +
                `• "3 hari" - 3 hari terakhir\n` +
                `• "2 minggu" - 2 minggu terakhir\n` +
                `• "6 bulan" - 6 bulan terakhir\n\n` +
                `*Contoh:* ${usedPrefix}riwayat mingguan`);
        }
        
        const periode = q.toLowerCase();
        let filteredData = periode === 'semua' ? transactions : filterTransactionsByPeriod(transactions, periode);
        
        let dataToShow = [
            ...filteredData.pemasukan,
            ...filteredData.pengeluaran
        ].sort((a, b) => b.id - a.id);
        
        if (dataToShow.length === 0) {
            return finreply(`📭 Tidak ada transaksi dalam periode "${periode}".`);
        }
        
        // Hitung total
        const totalPemasukan = filteredData.pemasukan.reduce((sum, t) => sum + t.jumlah, 0);
        const totalPengeluaran = filteredData.pengeluaran.reduce((sum, t) => sum + t.jumlah, 0);
        
        // Tampilkan 15 transaksi terakhir
        const recentTransactions = dataToShow.slice(0, 15);
        
        let message = `*Riwayat Transaksi - ${periode.charAt(0).toUpperCase() + periode.slice(1)}*\n\n`;
        message += `Total Pemasukan: ${formatRupiah(totalPemasukan)}\n`;
        message += `Total Pengeluaran: ${formatRupiah(totalPengeluaran)}\n`;
        message += `━━━━━━━━━━━━━━\n`;
        message += `Saldo: ${formatRupiah(totalPemasukan - totalPengeluaran)}\n\n`;
        
        recentTransactions.forEach((t, index) => {
            message += `${index + 1}. ${t.tipe === "Pemasukan" ? "📈" : "📉"} ${t.deskripsi}\n`;
            message += `   ${formatRupiah(t.jumlah)} | ${t.kategori}\n`;
            message += `   ${t.tanggal} ${t.waktu}\n`;
            message += `   ID: ${t.id}\n\n`;
        });
        
        if (dataToShow.length > 15) {
            message += `_Menampilkan 15 dari ${dataToShow.length} transaksi_`;
        }
        
        finreply(message);
    } catch (error) {
        console.error("Error:", error);
        finreply(mess.error);
    }
}
break

// Lihat ringkasan keuangan dengan AI
case "saldo":
case "ringkasan":
case "summary": {
    try {
        const transactions = loadUserTransactions(sender);
        
        // Cek apakah ada transaksi
        if (transactions.pemasukan.length === 0 && transactions.pengeluaran.length === 0) {
            return finreply('📭 Belum ada transaksi yang tercatat.\n\nMulai catat transaksi Anda untuk mendapatkan analisis keuangan!');
        }
        
        // Cek apakah ada parameter periode
        if (!q || q.trim() === '') {
            return finreply(`*Pilih Periode Ringkasan Keuangan*\n\n` +
                `Ketik: ${usedPrefix}ringkasan [periode]\n\n` +
                `*Periode yang tersedia:*\n` +
                `• harian / hari - Hari ini\n` +
                `• kemarin - Kemarin\n` +
                `• mingguan / minggu - 7 hari terakhir\n` +
                `• bulanan / bulan - 30 hari terakhir\n` +
                `• tahunan / tahun - 1 tahun terakhir\n` +
                `• semua - Semua data\n\n` +
                `*Custom:*\n` +
                `• "3 hari" - 3 hari terakhir\n` +
                `• "2 minggu" - 2 minggu terakhir\n` +
                `• "6 bulan" - 6 bulan terakhir\n\n` +
                `*Contoh:* ${usedPrefix}ringkasan bulanan`);
        }
        
        finreply('Menganalisis keuangan Anda...');
        
        const periode = q.toLowerCase();
        const filteredData = periode === 'semua' ? transactions : filterTransactionsByPeriod(transactions, periode);
        
        // Cek apakah ada data di periode tersebut
        if (filteredData.pemasukan.length === 0 && filteredData.pengeluaran.length === 0) {
            return finreply(`Tidak ada transaksi dalam periode "${periode}".\n\nCoba periode lain atau catat transaksi terlebih dahulu.`);
        }
        
        // Kirim data periode ke AI untuk dianalisis
        const aiSummary = await SummaryAI(filteredData, periode);
        
        finreply(aiSummary);
    } catch (error) {
        console.error("Error:", error);
        finreply(mess.error);
    }
}
break

// Hapus transaksi dari chat reply atau ID
case "hapustransaksi":
case "hapus":
case "delete": {
    try {
        let transactionId;
        
        // Cek apakah user memberikan ID langsung
        if (q && q.trim() !== '') {
            transactionId = parseInt(q.trim());
            if (isNaN(transactionId)) {
                return finreply("ID transaksi tidak valid!\n\n*Contoh:*\n" + usedPrefix + "hapus 1234567890");
            }
        } else {
            // Cek apakah user reply pesan transaksi
            const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedText = quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text;
            
            if (!quotedText) {
                return finreply("*Cara Hapus Transaksi:*\n\n" +
                    `1. Reply pesan transaksi lalu ketik ${usedPrefix}hapus\n` +
                    `2. Ketik ${usedPrefix}hapus [ID]\n\n` +
                    `*Contoh:*\n${usedPrefix}hapus 1234567890\n\n` +
                    `_Cek ID transaksi dengan ${usedPrefix}riwayat_`);
            }
            
            // Ekstrak ID dari pesan yang di-reply
            const idMatch = quotedText.match(/ID: (\d+)/);
            if (!idMatch) {
                return finreply("Pesan yang di-reply bukan pesan transaksi yang valid!");
            }
            
            transactionId = parseInt(idMatch[1]);
        }
        const transactions = loadUserTransactions(sender);
        
        // Cari transaksi berdasarkan ID
        let deletedTransaction = null;
        let transactionType = null;
        
        // Cek di pemasukan
        const pemasukanIndex = transactions.pemasukan.findIndex(t => t.id === transactionId);
        if (pemasukanIndex !== -1) {
            deletedTransaction = transactions.pemasukan[pemasukanIndex];
            transactions.pemasukan.splice(pemasukanIndex, 1);
            transactionType = "Pemasukan";
        } else {
            // Cek di pengeluaran
            const pengeluaranIndex = transactions.pengeluaran.findIndex(t => t.id === transactionId);
            if (pengeluaranIndex !== -1) {
                deletedTransaction = transactions.pengeluaran[pengeluaranIndex];
                transactions.pengeluaran.splice(pengeluaranIndex, 1);
                transactionType = "Pengeluaran";
            }
        }
        
        if (!deletedTransaction) {
            return finreply("Transaksi tidak ditemukan atau sudah dihapus.");
        }
        
        // Simpan perubahan
        saveUserTransactions(sender, transactions);
        
        finreply(`*Transaksi Berhasil Dihapus*\n\n` +
            `Tipe: ${transactionType}\n` +
            `${deletedTransaction.deskripsi}\n` +
            `${formatRupiah(deletedTransaction.jumlah)}`);
    } catch (error) {
        console.error("Error:", error);
        finreply(mess.error);
    }
}
break

// AI4Chat
case "ai":
case "chatai": {
    if (!q) return finreply(`*Contoh penggunaan:*\n${usedPrefix}ai Apa itu ekonomi?`);
    try {
        finreply(mess.wait);
        const aiResponse = await Ai4Chat(q);
        finreply(`${aiResponse}`);
    } catch (error) {
        console.error("AI4Chat error:", error);
        finreply(mess.error);
    }
}
break

// check response time
case "ping": {
    const start = Date.now();
    await finreply('Pong!');
    const end = Date.now();
    const responseTime = end - start;
    await finreply(`Response time: ${responseTime} ms`);
}
break

// Cek model Gemini yang tersedia
case "cekmodel":
case "checkmodel": {
    try {
        finreply('Mengecek model yang tersedia...');
        
        const apiKey = global.geminiApiKey;
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        
        const models = response.data.models;
        const geminiModels = models.filter(model => model.name.includes('gemini'));
        
        if (geminiModels.length === 0) {
            return finreply('❌ Tidak ada model Gemini yang tersedia.');
        }
        
        let message = '🤖 *Daftar Model Gemini Tersedia:*\n\n';
        geminiModels.forEach((model, index) => {
            const modelName = model.name.replace('models/', '');
            const displayName = model.displayName || modelName;
            
            message += `${index + 1}. *${displayName}*\n`;
            message += `   Model: \`${modelName}\`\n`;
            
            if (model.supportedGenerationMethods) {
                message += `   Methods: ${model.supportedGenerationMethods.join(', ')}\n`;
            }
            
            message += '\n';
        });
        
        message += `\n_Total: ${geminiModels.length} model_\n`;
        message += `_API Key: ${apiKey.substring(0, 10)}..._`;
        
        finreply(message);
        
    } catch (error) {
        console.error('Error checking models:', error.message);
        
        if (error.response) {
            const status = error.response.status;
            if (status === 403) {
                finreply('API key tidak valid atau tidak memiliki akses.');
            } else if (status === 429) {
                finreply('Rate limit tercapai. Tunggu sebentar dan coba lagi.');
            } else {
                finreply(`Error ${status}: ${error.response.data?.error?.message || 'Gagal mengecek model'}`);
            }
        } else {
            finreply('Gagal terhubung ke Google API.');
        }
    }
}
break

// Buat Sticker dari gambar
case "sticker":
case "stiker":
case "s": {
    try {
        // Cek apakah ada gambar atau video
        const hasImageMsg = msg.message.imageMessage || 
                           msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
                           msg.message.videoMessage ||
                           msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
        
        if (!hasImageMsg) {
            return finreply(`*Cara Membuat Sticker:*\n\n` +
                `1. Kirim gambar/GIF dengan caption ${usedPrefix}sticker\n` +
                `2. Reply gambar/GIF lalu ketik ${usedPrefix}sticker\n\n` +
                `*Contoh:*\n` +
                `• Kirim foto → tambahkan caption ".sticker"\n` +
                `• Reply GIF → ketik ".s"\n\n` +
                `*Support:*\n` +
                `• Gambar: JPG, PNG (max 1MB)\n` +
                `• GIF Animasi: (max 2MB)\n\n` +
                `_Sticker dibuat secara lokal tanpa API_`);
        }
        
        finreply('🔄 Memproses media...');
        
        // Download media (gambar atau video/GIF)
        let buffer;
        if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedMsgObj = {
                key: msg.message.extendedTextMessage.contextInfo.quotedMessage,
                message: quotedMsg
            };
            buffer = await downloadMediaMessage(quotedMsgObj, 'buffer', {});
        } else {
            buffer = await downloadMediaMessage(msg, 'buffer', {});
        }
        
        // Get media info
        const mediaInfo = getMediaInfo(buffer);
        console.log('Media info:', mediaInfo);
        
        // Validasi ukuran
        try {
            validateStickerMedia(buffer);
            await finreply(`📦 ${mediaInfo.type} (${mediaInfo.size})\n🔨 Membuat sticker...`);
        } catch (validationError) {
            return finreply(`❌ ${validationError.message}`);
        }
        
        // Buat sticker (auto-detect static atau animated)
        try {
            const stickerBuffer = await makeStickerWithFallback(buffer, {
                packname: "Fin Bot",
                author: pushname
            });
            
            // Kirim sticker
            await fin.sendMessage(sender, {
                sticker: stickerBuffer
            }, { quoted: msg });
            
            console.log(`✅ Sticker created: ${mediaInfo.type}`);
            
        } catch (stickerError) {
            console.error('Sticker creation error:', stickerError);
            finreply(`❌ Gagal membuat sticker ${mediaInfo.type.toLowerCase()}.\n\n` +
                     `*Troubleshooting:*\n` +
                     `• Pastikan file tidak corrupt\n` +
                     `• Coba compress gambar/GIF terlebih dahulu\n` +
                     `• Untuk GIF, pastikan durasi tidak terlalu panjang`);
        }
        
    } catch (error) {
        console.error("Error creating sticker:", error);
        finreply('❌ Terjadi kesalahan saat memproses media.\n\n_Coba lagi dengan file yang berbeda atau compress ukurannya._');
    }
}
break

        default: { finreply(mess.default) }
    }
}