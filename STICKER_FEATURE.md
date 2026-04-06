# Fitur Sticker - Fin Bot

## Deskripsi
Fitur untuk membuat sticker dari gambar menggunakan WhatsApp Bot.

## File yang Ditambahkan

### 1. scrape/StickerMaker.js
Module utama untuk konversi gambar ke sticker dengan beberapa fungsi:
- `createSticker()` - Metode utama menggunakan lolhuman API
- `createStickerAlt()` - Metode alternatif menggunakan popcat API
- `makeStickerWithFallback()` - Fungsi dengan fallback otomatis
- `validateStickerMedia()` - Validasi ukuran dan format media

## Command

### .sticker / .stiker / .s
Membuat sticker dari gambar

**Cara Penggunaan:**
1. Kirim gambar dengan caption `.sticker`
2. Reply gambar lalu ketik `.sticker` atau `.s`

**Spesifikasi:**
- Format: JPG, PNG
- Ukuran max: 1MB
- Output: WebP sticker (512x512px)

**Contoh:**
```
[Kirim foto] + caption: .sticker
[Reply foto] + ketik: .s
```

## Fitur Teknis

### Resize Otomatis
Gambar akan diresize otomatis ke 512x512px menggunakan Sharp dengan:
- Fit mode: contain (menjaga aspek rasio)
- Background: transparent
- Quality: 80%

### Fallback System
Jika API pertama gagal, otomatis mencoba API alternatif untuk memastikan sticker tetap bisa dibuat.

### Validasi
- Cek ukuran file (max 1MB)
- Error handling untuk gambar corrupt
- User-friendly error messages

## Dependencies
- axios: HTTP client untuk API calls
- form-data: Untuk upload multipart/form-data
- sharp: Image processing dan resize

## Update Menu
Menu telah diperbarui di `database/Menu/finMenu.js` dengan section baru:
```
*STICKER:*
.sticker - Buat sticker dari gambar (kirim/reply gambar)
.s - Singkatan dari .sticker
```

## Error Handling
- File terlalu besar: Menampilkan ukuran aktual dan limit
- Gambar invalid: Memberikan saran untuk mencoba gambar lain
- API gagal: Mencoba metode alternatif otomatis
- Network error: Informasi jelas untuk user

## Catatan Pengembangan
- Packname default: "Fin Bot"
- Author: Menggunakan pushname pengirim
- Timeout API: 30 detik
- Background transparent untuk hasil terbaik
