import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

export let ai;
if (config.geminiApiKey) {
    ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

const MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash'
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function callGemini(prompt, cfg = {}) {
  let lastError;
  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.3, ...cfg }
      });
      return response.text;
    } catch (error) {
      lastError = error;
      // Extraiem el codi d'error del missatge (pot venir com JSON o com status)
      const codeFromMsg = error?.message?.match(/"code":(\d+)/)?.[1];
      const httpStatus = error?.status || error?.code || codeFromMsg;
      console.warn(`⚠️  Model ${model} ha fallat (status: ${httpStatus}) →`, error?.message?.substring(0, 120));
      if (httpStatus === 429 || httpStatus === '429' || httpStatus === 503 || httpStatus === '503') {
        // Esperem 3 segons abans de provar el següent model
        await sleep(3000);
        continue;
      }
      // Qualsevol altre error (401, 400...) no té sentit reintentar amb un altre model
      throw error;
    }
  }
  console.error('❌ Tots els models de Gemini han fallat. Últim error:', lastError?.message);
  throw new Error(`Tots els models de Gemini han fallat: ${lastError?.message}`);
}

export async function parseNaturalLanguage(text, currentDateString, historyStr = "", audioData = null) {
  if (!ai) throw new Error("Gemini API key is not configured");

  const prompt = `Ets en Bot, l'assistent personal de l'Edu. Parles català col·loquial com un amic de confiança. Ara t'arriba un missatge i has d'identificar la intenció i retornar un JSON.
Data i hora actual: ${currentDateString}

Retorna ÚNICAMENT un JSON vàlid:
{
  "intent": "create_event" | "update_event" | "delete_event" | "query_agenda" | "query_free_time" | "update_preferences" | "query_emails" | "query_weather" | "save_memory" | "query_memory" | "general_chat",
  "target_event_reference": "títol o referència de l'event a modificar/esborrar",
  "email_query": "paraula clau per buscar als correus (null si no aplica)",
  "title": "Títol descriptiu de l'event",
  "description": "Detalls addicionals",
  "date": "YYYY-MM-DD",
  "date_end": "YYYY-MM-DD",
  "time": "HH:MM",
  "end_time": "HH:MM",
  "duration_minutes": 60,
  "location": "Lloc",
  "participants": ["noms o emails"],
  "preferences": { "summaryTime": "HH:MM", "defaultDuration": 30 },
  "confidence": 0.9,
  "reply_message": "Resposta breu i col·loquial per enviar a l'Edu"
}

REGLES (segueix-les sempre):
- OMET les claus que no facin falta per a la intenció actual.
- TÍTOLS: Fes el títol de l'event descriptiu. Si menciona persona o empresa, inclou-ho (ex: "Reunió RRHH - Teixidó").
- AGENDA: Si pregunta "quins tinc" o "propers", date i date_end a null. Si demana un rang ("aquesta setmana"), emplena'ls.
- PREFERÈNCIES: Si vol canviar l'hora del resum o la durada de les reunions → intent "update_preferences".
- TEMPS: Si pregunta el temps (avui, demà, cap de setmana...) → intent "query_weather" SEMPRE. Tens accés al clima.
- CORREUS: Si demana resum, buscar correus o demana què diuen els emails → intent "query_emails".
- MEMÒRIA: Si l'Edu vol que recordis alguna cosa ("recorda que...", "guarda que...") → intent "save_memory".
- MEMÒRIA: Si l'Edu et pregunta quelcom que t'havia dit abans ("on vaig guardar...", "què em va dir...", "recordes que...") → intent "query_memory".
- Tolera errors ortogràfics, dialectes i llengua col·loquial.
- Si rep un ÀUDIO, transcriu i dedueix la intenció.
- Usa l'historial per entendre context. Si diu "mou-ho", referencia l'event del que parlava.
- Hores sempre en format 24h.
- reply_message: curt, directe, emojis, com un WhatsApp entre amics. En català sempre.

HISTORIAL:
${historyStr || "(cap)"}

Missatge de l'Edu: "${text || ''}"`;

  let contents;
  if (audioData) {
    contents = [
      { inlineData: { data: audioData.base64, mimeType: audioData.mimeType } },
      { text: prompt }
    ];
  } else {
    contents = prompt;
  }

  try {
    const rawJson = await callGemini(contents, {
      temperature: 0.1,
      responseMimeType: 'application/json'
    });

    console.log('Gemini raw response:', rawJson);
    return JSON.parse(rawJson);
  } catch (error) {
    console.error('Error cridant a Gemini:', error?.message || error);
    return null;
  }
}

export async function summarizeEmails(emailsText) {
  if (!ai) throw new Error("Gemini API key is not configured");
  
  // Limitar text per evitar excedir tokens (5000 chars ~= ~1250 tokens, segur per al free tier)
  const truncatedEmails = emailsText.substring(0, 5000);
  
  const prompt = `Resumeix aquests correus en català col·loquial, com un WhatsApp entre amics. MOLT breu.
Agrupa la publicitat/alertes en una frase. Destaca el que realment importa. Màxim 5-6 línies.

CORREUS:\n${truncatedEmails}`;

  try {
    return await callGemini(prompt, { temperature: 0.3 });
  } catch (error) {
    console.error('Error resumint correus:', error?.message || error);
    const isQuota = error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.toLowerCase().includes('rate');
    if (isQuota) {
      return "📧 Resum de correus:\n\nOstres, la IA té la quota plena ara mateix 😅 Torna-ho a provar en uns minuts o usa /correus.";
    }
    return `📧 Resum de correus:\n\nNo he pogut resumir els correus: ${error?.message?.substring(0, 100) || 'Error desconegut'}.`;
  }
}

export async function answerEmailQuery(emailsText, userQuestion) {
  if (!ai) throw new Error("Gemini API key is not configured");
  
  const truncatedEmails = emailsText.substring(0, 5000);
  const prompt = `L'Edu t'ha preguntat això sobre els seus correus recents: "${userQuestion}"

Aquí tens els correus recents:
${truncatedEmails}

Respon de forma MOLT breu i directa en català col·loquial. Si no ho trobes, digues "No he vist res sobre això als teus correus".`;

  try {
    return await callGemini(prompt, { temperature: 0.2 });
  } catch (error) {
    console.error('Error responent consulta correus:', error?.message || error);
    const isQuota = error?.message?.includes('429') || error?.message?.includes('quota');
    if (isQuota) return "Ostres, no he pogut analitzar els correus perquè la IA està saturada ara mateix 😅";
    return "Ostres, no he pogut analitzar els correus en aquest moment.";
  }
}

export async function generateMorningGreeting(eventsText, weatherText) {
  if (!ai) return `Bon dia! Aquí tens el teu dia:\n\n${eventsText}\n\n${weatherText}`;
  
  const prompt = `Ets el millor amic de l'Edu i cada matí li envies un missatge de WhatsApp per arrancar el dia.
Ha de ser MOLT col·loquial, amb confiança total, energètic i positiu però sense ser pesat.
Inclou: un salut original (no sempre "bon dia"), el resum de l'agenda d'avui i una recomanació pràctica sobre la roba o si agafar paraigua.

AGENDA D'AVUI:
${eventsText}

TEMPS A BALAGUER:
${weatherText}

Normes:
- Escriu com si li enviessis un WhatsApp de veritat, no un email formal.
- Varia el salut cada dia (pot ser "ei tio!", "va, espavila!", "ostres ja és de dia!", etc.)
- Si l'agenda és buida, celebra-ho com cal! 🎉
- El consell de roba ha de ser concret i pràctic (samarreta, jaqueta, bufanda, paraigua, etc.)
- Emojis sí, però que quedin naturals.
- Màxim 5-6 línies en total. Breu però complet.`;

  try {
    return await callGemini(prompt, { temperature: 0.6 });
  } catch (error) {
    console.error('Error generant salutació diària:', error?.message || error);
    const isQuota = error?.message?.includes('429') || error?.message?.includes('quota');
    const quotaMsg = isQuota ? "\n\n(Sembla que tinc la quota de la IA plena, així que seré més breu! 😅)" : "";
    return `Ei Edu! Ha fallat el meu cervell digital però aquí tens el teu dia:${quotaMsg}\n\n${eventsText}\n\n${weatherText}`;
  }
}

export async function generateWeatherResponse(weatherText) {
  if (!ai) return weatherText;
  
  const prompt = `L'Edu et pregunta quin temps farà. Tens aquesta informació:
${weatherText}

Respon-li com li explicaries el temps a un amic en un WhatsApp. Breu, directe i col·loquial.
Digue-li si ha d'agafar jaqueta, paraigua, o si pot anar en màniga curta. Català i emojis.`;

  try {
    return await callGemini(prompt, { temperature: 0.4 });
  } catch (error) {
    console.error('Error generant resposta temps:', error?.message || error);
    const isQuota = error?.message?.includes('429') || error?.message?.includes('quota');
    if (isQuota) return `☁️ ${weatherText}\n\n(Perdona, la IA està saturada i no puc fer el resum bonic!)`;
    return `☁️ ${weatherText}`;
  }
}
