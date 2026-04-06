const axios = require('axios');

// Rate limiter
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000;

async function Ai4Chat(prompt) {
    const apiKey = global.geminiApiKey;
    
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastRequestTime = Date.now();

    // Retry mechanism
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

            // Parse response dari Gemini
            if (!response.data.candidates || !response.data.candidates[0]) {
                throw new Error('AI tidak memberikan response');
            }

            return response.data.candidates[0].content.parts[0].text;
            
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
            
            console.error("AI Chat error:", error.message);
            throw error;
        }
    }
    
    throw new Error('Failed after maximum retries');
}

module.exports = Ai4Chat;