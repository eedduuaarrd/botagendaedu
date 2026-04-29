import { GoogleGenAI } from '@google/genai';
import { config } from '../src/config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

async function testCalls() {
  const MODEL = 'gemini-3.1-flash-lite-preview';
  
  // Test 1: Simple call (com el greeting)
  console.log('--- Test 1: Simple text generation ---');
  try {
    const r1 = await ai.models.generateContent({
      model: MODEL,
      contents: 'Digues "Bon dia Edu!" i res més.',
      config: { temperature: 0.3 }
    });
    console.log('✅ Resultat:', r1.text);
  } catch (e) {
    console.log('❌ Error:', e.message?.substring(0, 200) || JSON.stringify(e).substring(0, 200));
  }

  // Test 2: JSON response (com parseNaturalLanguage)
  console.log('\n--- Test 2: JSON response ---');
  try {
    const r2 = await ai.models.generateContent({
      model: MODEL,
      contents: 'Retorna un JSON: {"intent":"general_chat","reply_message":"hola"}',
      config: { temperature: 0.1, responseMimeType: 'application/json' }
    });
    console.log('✅ Resultat:', r2.text);
  } catch (e) {
    console.log('❌ Error:', e.message?.substring(0, 200) || JSON.stringify(e).substring(0, 200));
  }

  // Test 3: Long prompt (com summarizeEmails)
  console.log('\n--- Test 3: Long prompt ---');
  try {
    const fakeEmails = Array(10).fill('De: test@test.com\nAssumpte: Test email\nResum: This is a test email snippet\n---').join('\n');
    const r3 = await ai.models.generateContent({
      model: MODEL,
      contents: `Fes un resum breu d'aquests correus:\n${fakeEmails}`,
      config: { temperature: 0.3 }
    });
    console.log('✅ Resultat:', r3.text?.substring(0, 200));
  } catch (e) {
    console.log('❌ Error:', e.message?.substring(0, 200) || JSON.stringify(e).substring(0, 200));
  }
}

testCalls();
