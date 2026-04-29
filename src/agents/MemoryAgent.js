import { MemoryService } from '../services/memory.js';
import { ai } from '../services/gemini.js';

export class MemoryAgent {
  static async handleSave(bot, chatId, content) {
    try {
      const memory = await MemoryService.save(content, ['auto']);
      bot.sendMessage(chatId, `🧠 Ho he guardat a la meva memòria a llarg termini: "${content}"`);
    } catch (error) {
      console.error("Error saving memory:", error);
      bot.sendMessage(chatId, "Ho sento, no he pogut guardar-ho a la memòria. 😢");
    }
  }

  static async handleQuery(bot, chatId, query) {
    try {
      bot.sendChatAction(chatId, 'typing');
      const answer = await MemoryService.search(query, ai);
      bot.sendMessage(chatId, `🧠 ${answer}`);
    } catch (error) {
      console.error("Error querying memory:", error);
      bot.sendMessage(chatId, "Ostres, m'he fet un lio buscant en els meus records. 😅");
    }
  }
}
