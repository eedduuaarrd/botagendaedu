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
  "intent": "create_event" | "update_event" | "delete_event" | "query_agenda" | "query_free_time" | "update_preferences" | "general_chat",
  "target_event_reference": "Nom de l'esdeveniment a modificar/esborrar (si aplica)",
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

Regles CRÍTIQUES de funcionament:
1. TÍTOLS RICS: El camp "title" ha de ser altament descriptiu. Si l'usuari menciona una empresa, departament o persona, format-ho com un títol professional (Ex: "Reunió RRHH - Teixidó Associats").
2. Per l'intent "query_agenda":
   - Si pregunta en general ("propers", "quins tinc"), posa "date" i "date_end" a null.
   - Si demana un rang ("aquesta setmana", "entre avui i el 2035"), omple "date" i "date_end".
3. PREFERÈNCIES: Si l'usuari vol canviar l'hora del resum diari ("avisa'm als matins a les 8") o la duració per defecte de les reunions ("que les reunions durin 30 minuts"), utilitza l'intent "update_preferences" i omple el bloc "preferences" amb els valors corresponents (summaryTime en "HH:MM" i defaultDuration en minuts).
4. Sigues tolerant amb faltes d'ortografia o llenguatge col·loquial. Dona un confidence alt sempre que entenguis la idea. Si reps un ÀUDIO, transcriu i dedueix la intenció.
5. Utilitza l'HISTORIAL RECENT per entendre el context. Si diu "mou-ho a les 6", busca a l'historial de quin esdeveniment estava parlant i utilitza l'intent "update_event" omplint el target_event_reference corresponent.
6. El "time" sempre en 24h. Si no especifica hora, null. "duration_minutes" és recomanable deduir-lo de la conversa o deixar-lo en null.
7. Respon sempre en català.

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
        model: 'gemini-2.5-flash',
        contents: parts,
        config: { temperature: 0.1 }
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
        reply_message: '⚠️ <b>Google Gemini està temporalment saturat</b>.\nCom que fem servir la versió gratuïta, només permet un nombre limitat de missatges per minut. Espera 60 segons i torna-ho a intentar!' 
      };
    }
    return null;
  }
}
