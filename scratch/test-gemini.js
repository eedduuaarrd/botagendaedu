import { GoogleGenAI } from '@google/genai';
import { config } from '../src/config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const MODELS_TO_TRY = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-lite-preview-0514',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash-lite-preview',
  'gemini-3-flash',
  'gemini-3-flash-lite',
];

async function testModel(modelName) {
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: 'Respon NOMÉS: OK',
      config: { temperature: 0.1 }
    });
    console.log(`✅ ${modelName} → "${response.text.trim()}"`);
    return true;
  } catch (error) {
    const code = error?.message?.match(/"code":(\d+)/)?.[1] || '?';
    console.log(`❌ ${modelName} → code ${code}`);
    return false;
  }
}

async function main() {
  for (const model of MODELS_TO_TRY) {
    await testModel(model);
  }
}
main();
