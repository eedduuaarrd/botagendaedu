import { fetchRecentEmails } from '../services/gmail.js';
import { summarizeEmails, answerEmailQuery } from '../services/gemini.js';

export class MailAgent {
  static async getDailyEmailSummary() {
    try {
      const emails = await fetchRecentEmails(24);
      if (emails.length === 0) {
        return "📧 <b>Correus:</b> No tens correus nous de les últimes 24 hores.";
      }
      const emailsText = emails.map(e => `De: ${e.from}\nAssumpte: ${e.subject}\nResum: ${e.snippet}\n---`).join('\n');
      const summary = await summarizeEmails(emailsText);
      return `📧 Resum de correus:\n\n${summary}`;
    } catch (err) {
      console.error("Error al MailAgent (Daily):", err);
      throw new Error("Ei, no he pogut connectar amb el teu Gmail 😢 T'has autenticat bé?");
    }
  }

  static async handleEmailQuery(userText) {
    try {
      const emails = await fetchRecentEmails(72);
      if (emails.length === 0) {
        return "Ei! No tens cap correu en els últims dies.";
      }
      const emailsText = emails.map(e => `De: ${e.from}\nAssumpte: ${e.subject}\nResum: ${e.snippet}\n---`).join('\n');
      return await answerEmailQuery(emailsText, userText);
    } catch (err) {
      console.error("Error al MailAgent (Query):", err);
      throw new Error("Ostres, no he pogut buscar als teus correus. Torna-ho a provar!");
    }
  }
}
