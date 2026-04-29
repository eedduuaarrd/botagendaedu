import { GoogleGenAI } from '@google/genai';
import { config } from '../src/config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const MODELS_TO_TRY = [
  'gemini-3.1-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-2.5-flash',
];

async function testModel(modelName) {
  try {
    console.log(`\n--- Provant model: ${modelName} ---`);
    const response = await ai.models.generateContent({
      model: modelName,
      contents: 'Respon NOMÉS amb un JSON: {"intent":"general_chat","reply_message":"hola"}',
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    });
    console.log(`✅ ${modelName} FUNCIONA!`);
    console.log('Resposta:', response.text);
    return true;
  } catch (error) {
    console.log(`❌ ${modelName} FALLA: ${error.message?.substring(0, 100)}`);
    return false;
  }
}

async function main() {
  console.log('=== Test de models Gemini ===\n');
  for (const model of MODELS_TO_TRY) {
    const ok = await testModel(model);
    if (ok) break; // Stop at first working model
  }
}

main();
