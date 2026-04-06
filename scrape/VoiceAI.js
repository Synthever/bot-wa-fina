const axios = require('axios');
const FormData = require('form-data');

// Rate limiter
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000;

async function VoiceAI(audioBuffer) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();

    const apiKey = global.geminiApiKey;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Convert audio buffer to base64
            const base64Audio = audioBuffer.toString('base64');
            
            // Kirim audio ke Gemini API untuk speech-to-text
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                {
                    contents: [{
                        parts: [
                            {
                                text: "Transkripsi audio ini ke teks bahasa Indonesia. Hanya berikan teks transkripsinya saja, tanpa penjelasan tambahan."
                            },
                            {
                                inline_data: {
                                    mime_type: "audio/ogg",
                                    data: base64Audio
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 1024
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
            
            const transcription = response.data.candidates[0].content.parts[0].text.trim();
            
            if (!transcription || transcription.length < 3) {
                return {
                    success: false,
                    error: "Tidak dapat mendengar audio dengan jelas. Coba rekam ulang dengan suara lebih jelas."
                };
            }
            
            return {
                success: true,
                text: transcription
            };
            
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
            
            console.error("Voice AI error:", error.message);
            
            if (attempt === maxRetries) {
                return {
                    success: false,
                    error: error.response?.data?.error?.message || "Gagal memproses voice note. Coba lagi."
                };
            }
        }
    }
    
    return {
        success: false,
        error: "Gagal memproses voice note setelah beberapa percobaan."
    };
}

module.exports = VoiceAI;
