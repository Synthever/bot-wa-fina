const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

/**
 * Detect if buffer is an animated image (GIF)
 * @param {Buffer} buffer - Image buffer
 * @returns {boolean}
 */
function isAnimated(buffer) {
    // Check GIF signature and animated marker
    const gifSignature = buffer.toString('hex', 0, 6);
    if (gifSignature === '474946383961' || gifSignature === '474946383761') { // GIF89a or GIF87a
        // Check for animation (NETSCAPE2.0 extension)
        const bufferStr = buffer.toString('binary');
        return bufferStr.includes('NETSCAPE2.0');
    }
    return false;
}

/**
 * Convert static image to WebP sticker using Sharp
 * @param {Buffer} media - Buffer dari gambar
 * @param {Object} options - Options untuk sticker
 * @returns {Promise<Buffer>} - Buffer sticker WebP
 */
async function createStaticSticker(media, options = {}) {
    try {
        const { quality = 80 } = options;
        
        // Process with sharp - resize and convert to WebP
        const webpBuffer = await sharp(media, { animated: false })
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality })
            .toBuffer();
        
        return webpBuffer;
    } catch (error) {
        console.error('Error creating static sticker:', error.message);
        throw new Error('Gagal membuat sticker. Pastikan gambar valid.');
    }
}

/**
 * Convert animated GIF to WebP sticker using Sharp
 * @param {Buffer} media - Buffer dari GIF
 * @param {Object} options - Options untuk sticker
 * @returns {Promise<Buffer>} - Buffer animated sticker WebP
 */
async function createAnimatedSticker(media, options = {}) {
    try {
        const { quality = 75 } = options;
        
        // Process animated GIF with sharp
        const webpBuffer = await sharp(media, { animated: true })
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .webp({ quality, loop: 0 }) // loop: 0 means infinite loop
            .toBuffer();
        
        return webpBuffer;
    } catch (error) {
        console.error('Error creating animated sticker:', error.message);
        throw new Error('Gagal membuat sticker animasi. Pastikan GIF valid.');
    }
}

/**
 * Main function to create sticker (auto-detect static or animated)
 * @param {Buffer} media - Buffer dari gambar atau GIF
 * @param {Object} options - Options untuk sticker
 * @returns {Promise<Buffer>} - Buffer sticker WebP
 */
async function createSticker(media, options = {}) {
    try {
        // Detect if image is animated
        const animated = isAnimated(media);
        
        if (animated) {
            console.log('Detected animated GIF, creating animated sticker...');
            return await createAnimatedSticker(media, options);
        } else {
            console.log('Creating static sticker...');
            return await createStaticSticker(media, options);
        }
    } catch (error) {
        console.error('Error in createSticker:', error.message);
        throw error;
    }
}

/**
 * Create sticker with fallback (kept for compatibility)
 * @param {Buffer} media - Buffer dari gambar atau GIF
 * @param {Object} options - Options untuk sticker
 * @returns {Promise<Buffer>} - Buffer sticker WebP
 */
async function makeStickerWithFallback(media, options = {}) {
    try {
        return await createSticker(media, options);
    } catch (error) {
        console.error('Failed to create sticker:', error);
        throw new Error('Gagal membuat sticker. Coba dengan gambar/GIF lain.');
    }
}

/**
 * Validate if media is suitable for sticker
 * @param {Buffer} media - Buffer media
 * @param {number} maxSize - Max size in MB (default: 2MB for GIF, 1MB for static)
 * @returns {boolean}
 */
function validateStickerMedia(media, maxSize = 2) {
    const sizeInMB = media.length / (1024 * 1024);
    
    // Higher limit for animated GIF
    const animated = isAnimated(media);
    const limit = animated ? 2 : maxSize;
    
    if (sizeInMB > limit) {
        throw new Error(`Ukuran file terlalu besar (${sizeInMB.toFixed(2)}MB). Maksimal ${limit}MB untuk ${animated ? 'GIF animasi' : 'gambar'}`);
    }
    return true;
}

/**
 * Get media type info
 * @param {Buffer} media - Buffer media
 * @returns {Object} - Info about media type
 */
function getMediaInfo(media) {
    const animated = isAnimated(media);
    const sizeInMB = (media.length / (1024 * 1024)).toFixed(2);
    
    return {
        isAnimated: animated,
        type: animated ? 'GIF Animasi' : 'Gambar',
        size: `${sizeInMB} MB`
    };
}

module.exports = {
    createSticker,
    createStaticSticker,
    createAnimatedSticker,
    makeStickerWithFallback,
    validateStickerMedia,
    getMediaInfo,
    isAnimated
};
