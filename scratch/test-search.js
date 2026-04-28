import { GoogleGenAI } from '@google/genai';
import { config } from '../src/config/env.js';

async function test() {
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash-8b',
            contents: 'Quin temps fa a balaguer dema a la tarde?',
            config: { 
                temperature: 0.7,
                tools: [{ googleSearch: {} }]
            }
        });
        console.log(response.text);
    } catch (e) {
        console.error("ERROR:", e.message);
    }
}
test();
