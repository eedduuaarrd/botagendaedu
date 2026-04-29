import express from 'express';
import { config } from './config/env.js';
import { setupBot } from './bot/telegram.js';
import { getAuthUrl, loadSavedCredentialsIfExist, saveCredentials, oauth2Client } from './config/googleAuth.js';
import { createEvent, listUpcomingEvents, deleteEventById, updateEvent, searchEvent } from './services/calendar.js';
import { WeatherAgent } from './agents/WeatherAgent.js';
import { ManagerAgent } from './agents/ManagerAgent.js';
import { MailAgent } from './agents/MailAgent.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Paths for persistent data
const PREFS_FILE = path.join(__dirname, '../preferences.json');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/auth', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// --- API Routes for TMA ---

// 📅 Calendar Events
app.get('/api/events', async (req, res) => {
  try {
    const { start, end, max } = req.query;
    const events = await listUpcomingEvents(parseInt(max) || 20, start, end);
    res.json(events || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const { eventData, reminder } = req.body;
    const result = await createEvent(eventData, reminder);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await deleteEventById(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ⛅ Weather
app.get('/api/weather', async (req, res) => {
  try {
    const weather = await WeatherAgent.getWeather();
    res.json({ text: weather });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🌅 Daily Briefing
app.get('/api/briefing', async (req, res) => {
  try {
    const today = new Date().toLocaleString('en-CA', {timeZone: 'Europe/Madrid'}).substring(0, 10);
    const events = await listUpcomingEvents(20, today, today);
    let todayText = events && events.length > 0 
      ? events.map(ev => `${ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'Tot el dia'}: ${ev.summary}`).join('\n')
      : "Cap event avui 🎉";
    
    const greeting = await WeatherAgent.getMorningGreeting(todayText);
    res.json({ text: greeting });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🧠 AI Chat
app.post('/api/ai-chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    const currentDate = new Date().toLocaleString('ca-ES', { timeZone: 'Europe/Madrid' });
    const result = await ManagerAgent.processUserMessage(message, currentDate, history || "");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ⚙️ Preferences
app.get('/api/preferences', (req, res) => {
  try {
    let prefs = { summaryTime: '05:00', defaultDuration: 60 };
    if (fs.existsSync(PREFS_FILE)) {
      prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    }
    res.json(prefs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/preferences', (req, res) => {
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📧 Emails
app.get('/api/emails', async (req, res) => {
  try {
    const summary = await MailAgent.getDailyEmailSummary();
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔑 Google Auth Callback
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

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
  await loadSavedCredentialsIfExist();
  setupBot();
  app.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
  });
}

start();
