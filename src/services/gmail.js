import { google } from 'googleapis';
import { oauth2Client } from '../config/googleAuth.js';

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

export async function fetchRecentEmails(hours = 24) {
  try {
    const dateLimit = Math.floor((Date.now() - hours * 60 * 60 * 1000) / 1000);
    const query = `newer:${dateLimit} -category:promotions -category:social`;
    
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    });

    const messages = res.data.messages;
    if (!messages || messages.length === 0) {
      return [];
    }

    const emailDetails = [];
    for (const msg of messages) {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date']
      });
      
      const headers = msgRes.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '(Sense Assumpte)';
      const from = headers.find(h => h.name === 'From')?.value || '(Desconegut)';
      const snippet = msgRes.data.snippet || '';
      
      emailDetails.push({ subject, from, snippet });
    }
    
    return emailDetails;
  } catch (error) {
    console.error('Error al recuperar els correus de Gmail:', error);
    throw error;
  }
}
