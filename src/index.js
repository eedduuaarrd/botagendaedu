import express from 'express';
import { config } from './config/env.js';
import { setupBot } from './bot/telegram.js';
import { getAuthUrl, loadSavedCredentialsIfExist, saveCredentials, oauth2Client } from './config/googleAuth.js';

const app = express();

app.get('/', (req, res) => {
  res.send('AI Calendar Assistant is running.');
});

app.get('/auth', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    await saveCredentials(oauth2Client);
    res.send('Authentication successful! You can close this window and use the bot.');
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.status(500).send('Authentication failed');
  }
});

async function start() {
  console.log('Starting AI Calendar Assistant...');
  
  const isAuthorized = await loadSavedCredentialsIfExist();
  if (!isAuthorized) {
    console.log(`\n⚠️ Google Calendar not authorized.`);
    console.log(`Please visit http://localhost:${config.port}/auth to authorize the application.\n`);
  } else {
    console.log('✅ Google Calendar is authorized.');
  }

  setupBot();

  app.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
  });
}

start();
