import { ai } from './gemini.js';

export class AIEditorService {
  static async applyChanges(currentContent, instructions) {
    if (!ai) throw new Error("Gemini API key is not configured");
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `Ets un expert en programació. Aquí tens el contingut actual d'un fitxer:

\`\`\`
${currentContent}
\`\`\`

L'usuari vol fer aquests canvis: "${instructions}"

Torna EL FITXER SENCER amb els canvis aplicats. No incloguis explicacions, només el codi complet.
Assegura't de mantenir el mateix estil i format.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let newCode = response.text();
      
      // Clean up markdown if present
      if (newCode.startsWith('```')) {
        newCode = newCode.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
      }
      
      return newCode.trim();
    } catch (error) {
      console.error("Error aplicant canvis amb AI:", error);
      throw new Error("No he pogut generar el codi nou.");
    }
  }
}
