import { GoogleGenAI } from '@google/genai';
import { config } from '../src/config/env.js';

async function list() {
    const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    const response = await ai.models.list();
    for (const model of response) {
        console.log(model.name);
    }
}
list();
