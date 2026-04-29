import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { setupBot } from './bot/telegram.js';
import { getAuthUrl, loadSavedCredentialsIfExist, saveCredentials, oauth2Client } from './config/googleAuth.js';
import { createEvent, listUpcomingEvents, deleteEventById, updateEvent, searchEvent } from './services/calendar.js';
import { WeatherAgent } from './agents/WeatherAgent.js';
import { ManagerAgent } from './agents/ManagerAgent.js';
import { MailAgent } from './agents/MailAgent.js';
import { fetchRecentEmails } from './services/gmail.js';
import { fetchWeatherDetailed } from './services/weather.js';

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

// ⛅ Weather Detailed
app.get('/api/weather/detailed', async (req, res) => {
  try {
    const weather = await fetchWeatherDetailed();
    res.json(weather);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📊 Stats
app.get('/api/stats', async (req, res) => {
  try {
    const today = new Date();
    const in7Days = new Date();
    in7Days.setDate(today.getDate() + 7);
    
    const events = await listUpcomingEvents(100, today.toISOString().split('T')[0], in7Days.toISOString().split('T')[0]);
    
    const stats = {
      total: events.length,
      byDay: {},
      categories: {
        work: 0,
        personal: 0,
        leisure: 0,
        other: 0
      }
    };
    
    events.forEach(ev => {
      const day = new Date(ev.start.dateTime || ev.start.date).getDay();
      stats.byDay[day] = (stats.byDay[day] || 0) + 1;
      
      const title = (ev.summary || '').toLowerCase();
      if (title.includes('reunió') || title.includes('work') || title.includes('feina')) stats.categories.work++;
      else if (title.includes('gimnàs') || title.includes('esport') || title.includes('sopar')) stats.categories.leisure++;
      else stats.categories.personal++;
    });
    
    res.json(stats);
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
    const recent = await fetchRecentEmails(24);
    res.json({ summary, recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📝 Tasks (Local Persistence)
const TASKS_FILE = path.join(__dirname, '../tasks.json');
app.get('/api/tasks', (req, res) => {
  try {
    let tasks = [];
    if (fs.existsSync(TASKS_FILE)) tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    res.json(tasks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tasks', (req, res) => {
  try {
    const { task } = req.body;
    let tasks = [];
    if (fs.existsSync(TASKS_FILE)) tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    tasks.push({ id: Date.now(), text: task, completed: false });
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 💰 Finance (Local Persistence)
const FINANCE_FILE = path.join(__dirname, '../finance.json');
app.get('/api/finance', (req, res) => {
  try {
    let data = { balance: 0, transactions: [] };
    if (fs.existsSync(FINANCE_FILE)) data = JSON.parse(fs.readFileSync(FINANCE_FILE, 'utf8'));
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/finance', (req, res) => {
  try {
    const { amount, note, type } = req.body;
    let data = { balance: 0, transactions: [] };
    if (fs.existsSync(FINANCE_FILE)) data = JSON.parse(fs.readFileSync(FINANCE_FILE, 'utf8'));
    
    const val = parseFloat(amount);
    data.balance += (type === 'income' ? val : -val);
    data.transactions.unshift({ id: Date.now(), amount: val, note, type, date: new Date().toISOString() });
    data.transactions = data.transactions.slice(0, 50); // Keep last 50
    
    fs.writeFileSync(FINANCE_FILE, JSON.stringify(data, null, 2));
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ✅ Habits (Local Persistence)
const HABITS_FILE = path.join(__dirname, '../habits.json');
app.get('/api/habits', (req, res) => {
  try {
    let habits = [];
    if (fs.existsSync(HABITS_FILE)) habits = JSON.parse(fs.readFileSync(HABITS_FILE, 'utf8'));
    res.json(habits);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/habits', (req, res) => {
  try {
    const { name } = req.body;
    let habits = [];
    if (fs.existsSync(HABITS_FILE)) habits = JSON.parse(fs.readFileSync(HABITS_FILE, 'utf8'));
    habits.push({ id: Date.now(), name, history: {} });
    fs.writeFileSync(HABITS_FILE, JSON.stringify(habits, null, 2));
    res.json(habits);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/habits/toggle', (req, res) => {
  try {
    const { id, date } = req.body;
    let habits = JSON.parse(fs.readFileSync(HABITS_FILE, 'utf8'));
    habits = habits.map(h => {
      if (h.id === id) {
        h.history[date] = !h.history[date];
      }
      return h;
    });
    fs.writeFileSync(HABITS_FILE, JSON.stringify(habits, null, 2));
    res.json(habits);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
