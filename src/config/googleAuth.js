import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { config } from './env.js';

const TOKEN_PATH = path.join(process.cwd(), 'token.json');

export const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

export async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf-8');
    const credentials = JSON.parse(content);
    oauth2Client.setCredentials(credentials);
    return true;
  } catch (err) {
    return false;
  }
}

export async function saveCredentials(client) {
  const payload = JSON.stringify(client.credentials);
  await fs.writeFile(TOKEN_PATH, payload);
}

export function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
  });
}
