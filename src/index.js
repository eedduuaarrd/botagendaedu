import express from 'express';
import { config } from './config/env.js';
import { setupBot } from './bot/telegram.js';
import { getAuthUrl, loadSavedCredentialsIfExist, saveCredentials, oauth2Client } from './config/googleAuth.js';
import { listUpcomingEvents } from './services/calendar.js';
import { WeatherAgent } from './agents/WeatherAgent.js';
import { MailAgent } from './agents/MailAgent.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/auth', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// API Routes for TMA
app.get('/api/today-events', async (req, res) => {
  try {
    const today = new Date().toLocaleString('en-CA', {timeZone: 'Europe/Madrid'}).substring(0, 10);
    const events = await listUpcomingEvents(20, today, today);
    res.json(events || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/weather', async (req, res) => {
  try {
    const weather = await WeatherAgent.getWeather();
    res.json(weather);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/briefing', async (req, res) => {
  try {
    const today = new Date().toLocaleString('en-CA', {timeZone: 'Europe/Madrid'}).substring(0, 10);
    const events = await listUpcomingEvents(20, today, today);
    let todayText = events && events.length > 0 
      ? events.map(ev => `${ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'Tot el dia'}: ${ev.summary}`).join('\n')
      : "Cap event avui 🎉";
    
    const greeting = await WeatherAgent.getMorningGreeting(todayText);
    res.json(greeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.port}`;
    console.log(`\n⚠️ Google Calendar not authorized.`);
    console.log(`Please visit ${baseUrl}/auth to authorize the application.\n`);
  } else {
    console.log('✅ Google Calendar is authorized.');
  }

  setupBot();

  app.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
  });
}

start();
