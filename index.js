// Import Module 
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("baileys")
const pino = require("pino")
const chalk = require("chalk")
const readline = require("readline")
const { resolve } = require("path")
const { version } = require("os")
const qrcode = require("qrcode")
const fs = require("fs")

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./FinSession')
  
  // Versi Terbaru
  const { version, isLatest } = await fetchLatestBaileysVersion()
  console.log(`Fin Using WA v${version.join('.')}, isLatest: ${isLatest}`)

  const fin = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    version: version,
    syncFullHistory: true,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id)
        return msg?.message || undefined
      }
      return proto.Message.fromObject({})
    }
  })

  // Handle QR Code
  fin.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    
    if (qr) {
      const qrPath = './database/image/qr/qrcode.png'
      await qrcode.toFile(qrPath, qr)
      console.log(chalk.cyan('📱 QR Code telah dibuat!'))
      console.log(chalk.yellow(`Lokasi: ${qrPath}`))
      console.log(chalk.green('Buka file QR tersebut dan scan dengan WhatsApp'))
      console.log(chalk.green('WhatsApp > Linked Devices > Link a Device'))
    }
    
    if (connection === "close") {
      console.log(chalk.red("Koneksi Terputus, Mencoba Menyambung Ulang"))
      connectToWhatsApp()
    } else if (connection === "open") {
      console.log(chalk.green("Bot Berhasil Terhubung Ke WhatsApp"))
      // Hapus QR setelah berhasil connect
      const qrPath = './database/image/qr/qrcode.png'
      if (fs.existsSync(qrPath)) {
        fs.unlinkSync(qrPath)
        console.log(chalk.gray('QR Code dihapus'))
      }
    }
  })
    // Menyimpan Sesi Login
    fin.ev.on("creds.update", saveCreds)

    // Respon Pesan Masuk
    fin.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0]

        if (!msg.message) return

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
        const sender = msg.key.remoteJid
        const pushname = msg.pushName || "fin"

        // Log Pesan Masuk Terminal
        const listColor = ["red", "green", "yellow", "magenta", "cyan", "white", "blue"]
        const randomColor = listColor[Math.floor(Math.random() * listColor.length)]

        console.log(
            chalk.yellow.bold("Fin Bot"),
            chalk.green.bold("[ WhatsApp ]"),
            chalk[randomColor](pushname),
            chalk[randomColor](" : "),
            chalk.white(body)
            
        )

        require("./fin")(fin, m)
    })
    
}

// Jalankan Koneksi WhatsApp
connectToWhatsApp()