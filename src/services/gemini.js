import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

export let ai;
if (config.geminiApiKey) {
    ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
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
- reply_message: curt, directe, emojis, com un WhatsApp entre amics. En català sempre.

HISTORIAL:
${historyStr || "(cap)"}

Missatge de l'Edu: "${text || ''}"`;

  let parts = [{ text: prompt }];
  if (audioData) {
    parts.unshift({
      inlineData: {
        data: audioData.base64,
        mimeType: audioData.mimeType
      }
    });
  }

  try {
    const model = ai.getGenerativeModel({ 
      model: 'gemini-3.1-flash-lite',
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent({ contents: parts });
    const response = await result.response;
    const rawJson = response.text();
    if (rawJson.startsWith('\`\`\`json')) {
      rawJson = rawJson.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '');
    } else if (rawJson.startsWith('\`\`\`')) {
      rawJson = rawJson.replace(/\`\`\`/g, '');
    }

    return JSON.parse(rawJson.trim());
  } catch (error) {
    console.error('Error cridant a Gemini:', error);
    if (error.status === 429) {
      return { 
        intent: 'general_chat', 
        confidence: 1, 
        reply_message: 'Ei, estic una mica saturat ara mateix! 😅 Dona\'m 30 segonets i torna a intentar-ho, va!' 
      };
    }
    return null;
  }
}

export async function summarizeEmails(emailsText) {
  if (!ai) throw new Error("Gemini API key is not configured");
  
  const prompt = `Ets el meu amic de confiança que llegeix els meus correus i me'ls explica en 2 minuts.
Fes un resum MOLT breu i col·loquial dels correus de les últimes 24h, com si m'ho expliquessis de paraula.
Agrupa els que no importin en una frase ("molta publicitat i alertes de feina de sempre, res especial").
Destaca el que de veritat necessito saber.
Usa emojis però sense passar-te.
Si no hi ha res interessant, digues-m'ho directament sense floritures.
Resposta en català col·loquial, super breu i fàcil de llegir d'un cop d'ull.

CORREUS:
${emailsText}`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error resumint correus:', error);
    return "Ostres, m'he liat amb els correus. Torna-ho a provar!";
  }
}

export async function answerEmailQuery(emailsText, userQuestion) {
  if (!ai) throw new Error("Gemini API key is not configured");
  
  const prompt = `L'Edu t'ha preguntat això sobre els seus correus recents: "${userQuestion}"

Aquí tens els correus recents:
${emailsText}

Respon de forma MOLT breu i directa, com si li ho expliquessis de viva veu a un amic.
Si trobes el que busca, digues-ho clar. Si no, digues "No he vist res sobre això als teus correus".
Català col·loquial, usa algun emoji, màxim 2-3 frases.`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error responent consulta correus:', error);
    return "Ostres, m'he liat buscant els correus. Torna-ho a provar!";
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
    const model = ai.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generant salutació diària:', error);
    return `Ei Edu! Ha fallat el meu cervell digital però aquí tens el teu dia:\n${eventsText}\n\nTemps: ${weatherText}`;
  }
}

export async function generateWeatherResponse(weatherText) {
  if (!ai) return weatherText;
  
  const prompt = `L'Edu et pregunta quin temps farà. Tens aquesta informació:
${weatherText}

Respon-li com li explicaries el temps a un amic en un WhatsApp. Breu, directe i col·loquial.
Digue-li si ha d'agafar jaqueta, paraigua, o si pot anar en màniga curta. Català i emojis.`;

  try {
    const model = ai.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generant resposta temps:', error);
    return `☁️ ${weatherText}`;
  }
}
