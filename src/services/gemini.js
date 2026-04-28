import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

let ai;
if (config.geminiApiKey) {
    ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

export async function parseNaturalLanguage(text, currentDateString, historyStr = "", audioData = null) {
  if (!ai) throw new Error("Gemini API key is not configured");

  const prompt = `Ets un assistent virtual d'agenda intel·ligent, amable i natiu en català. La teva feina és interpretar la intenció de l'usuari i retornar un JSON.
Data i hora actual local: ${currentDateString}

Has de retornar ÚNICAMENT un JSON vàlid amb aquesta estructura exacta:
{
  "intent": "create_event" | "update_event" | "delete_event" | "query_agenda" | "query_free_time" | "update_preferences" | "query_emails" | "query_weather" | "general_chat",
  "target_event_reference": "Nom de l'esdeveniment a modificar/esborrar (si aplica)",
  "email_query": "De qui o sobre què està preguntant (p.ex. 'Edu', 'factura', 'Amazon'). Null si no especifica.",
  "title": "Títol descriptiu i complet de l'esdeveniment",
  "description": "Descripció o detalls addicionals",
  "date": "YYYY-MM-DD",
  "date_end": "YYYY-MM-DD",
  "time": "HH:MM",
  "end_time": "HH:MM",
  "duration_minutes": 60,
  "location": "Lloc",
  "participants": ["emails/noms"],
  "preferences": {
     "summaryTime": "HH:MM",
     "defaultDuration": 30
  },
  "confidence": 0.9,
  "reply_message": "Missatge d'ajuda o resposta conversacional"
}

Regles CRÍTIQUES per ESTALVIAR TOKENS:
- OMET qualsevol clau del JSON que sigui null, buida o no necessària per a la intenció actual. Si una clau no fa falta, no la incloguis.

Altres regles:
1. TÍTOLS RICS: El camp "title" ha de ser altament descriptiu. Si l'usuari menciona una empresa, departament o persona, format-ho com un títol professional (Ex: "Reunió RRHH - Teixidó Associats").
2. Per l'intent "query_agenda":
   - Si pregunta en general ("propers", "quins tinc"), posa "date" i "date_end" a null.
   - Si demana un rang ("aquesta setmana", "entre avui i el 2035"), omple "date" i "date_end".
4. PREFERÈNCIES: Si l'usuari vol canviar l'hora del resum diari ("avisa'm als matins a les 8") o la duració per defecte de les reunions, utilitza l'intent "update_preferences".
5. TEMPS: Si l'usuari pregunta quin temps fa o farà (avui, demà, etc.), utilitza SEMPRE l'intent "query_weather", independentment de si abans vas dir que no podies. Ara SÍ tens accés al clima.
6. Sigues tolerant amb faltes d'ortografia o llenguatge col·loquial. Dona un confidence alt sempre que entenguis la idea. Si reps un ÀUDIO, transcriu i dedueix la intenció.
7. Utilitza l'HISTORIAL RECENT per entendre el context. Si diu "mou-ho a les 6", busca a l'historial de quin esdeveniment estava parlant i utilitza l'intent "update_event" omplint el target_event_reference corresponent.
8. El "time" sempre en 24h. Si no especifica hora, null. "duration_minutes" és recomanable deduir-lo de la conversa o deixar-lo en null.
9. Respon sempre en català.
10. Totes les teves respostes a "reply_message" han de ser en llenguatge SÚPER col·loquial, natural, amigable, súper breus i concises (com un missatge de WhatsApp a un amic). Fes servir algun emoji.
11. Per l'intent "query_emails", utilitza "email_query" per guardar la paraula clau que l'usuari vol buscar als correus (p. ex: si diu "tinc correus del Pere?", email_query: "Pere").

HISTORIAL RECENT DE CONVERSA:
${historyStr || "(No hi ha historial)"}

Missatge actual de l'usuari (pot estar buit si només t'ha enviat un àudio): "${text || ''}"`;

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
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: parts,
        config: { 
            temperature: 0.1
        }
    });

    let rawJson = response.text;
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
        reply_message: 'Uf! Estic processant massa coses de cop i necessito una petita pausa 😅 Dona\'m uns 30 segons i torna-m\'ho a demanar!' 
      };
    }
    return null;
  }
}

export async function summarizeEmails(emailsText) {
  if (!ai) throw new Error("Gemini API key is not configured");
  
  const prompt = `Ets el meu assistent personal super enrollat.
Aquí tens els meus correus de les últimes 24 hores.
Fes-ne un resum SÚPER breu, directe, natural i molt col·loquial. Com si m'ho diguessis per WhatsApp.
Destaca només el més rellevant, agrupant la morralla en una sola frase. Fes servir emojis sense passar-te.
Si no hi ha res, digues-m'ho ràpid: "Ei, res de nou avui als correus!".
No facis llistes eternes, fes-ho fàcil de llegir en un cop d'ull.

CORREUS:
${emailsText}`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt,
        config: { temperature: 0.2 }
    });
    return response.text;
  } catch (error) {
    console.error('Error resumint correus:', error);
    return "Hi ha hagut un error en generar el resum dels correus.";
  }
}

export async function answerEmailQuery(emailsText, userQuestion) {
  if (!ai) throw new Error("Gemini API key is not configured");
  
  const prompt = `Ets el meu assistent personal. T'he preguntat el següent sobre els meus correus recents: "${userQuestion}"

Aquí tens la llista dels correus recents per si et serveixen per respondre:
${emailsText}

Respon a la meva pregunta de forma SÚPER breu, col·loquial, directa i natural, com si fos un missatge de WhatsApp.
Si trobes el que busco, digues-m'ho ràpid. Si no ho trobes, digues "No he vist res sobre això".
Només en català i usa algun emoji.`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt,
        config: { temperature: 0.2 }
    });
    return response.text;
  } catch (error) {
    console.error('Error responent consulta correus:', error);
    return "Ostres, m'he liat buscant els correus. Torna-ho a provar!";
  }
}

export async function generateMorningGreeting(eventsText, weatherText) {
  if (!ai) return `Bon dia! Això és el que tens avui:\n\n${eventsText}\n\n${weatherText}`;
  
  const prompt = `Ets el meu assistent personal súper enrollat i el meu millor amic.
Escriu el missatge de "Bon dia" que m'enviaràs per WhatsApp cada matí.
Has de dir-me el resum de l'agenda d'avui i, molt important, fer-me una recomanació de roba o de si agafar paraigua basant-te en el temps que farà avui.

AGENDA D'AVUI:
${eventsText}

TEMPS A BALAGUER:
${weatherText}

Regles:
- Llenguatge SÚPER col·loquial, natural, directe, com un col·lega de veritat. Usa emojis.
- Respon directament amb el missatge, no diguis "Aquí tens el teu missatge:" ni coses així.
- Si l'agenda està lliure, celebra-ho!
- Diga'm com he de sortir de casa (samarreta, jaqueta, bufanda, paraigua, etc.).`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt,
        config: { temperature: 0.4 }
    });
    return response.text;
  } catch (error) {
    console.error('Error generant salutació diària:', error);
    return `Bon dia rei! Ha fallat una mica el meu cervell, però aquí tens el teu dia:\n${eventsText}\n\nTemps: ${weatherText}`;
  }
}
