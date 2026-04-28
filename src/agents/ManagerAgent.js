import { parseNaturalLanguage } from '../services/gemini.js';

export class ManagerAgent {
  /**
   * Router Agent: takes the raw text and contextual history, and returns the parsed JSON Intent
   */
  static async processUserMessage(text, currentDateString, historyStr, audioData) {
    try {
      const data = await parseNaturalLanguage(text, currentDateString, historyStr, audioData);
      return data;
    } catch (err) {
      console.error("Error al ManagerAgent:", err);
      throw new Error("No he pogut entendre o analitzar el teu missatge.");
    }
  }
}
