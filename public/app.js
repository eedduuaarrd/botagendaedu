const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// -- STATE --
let currentTab = 'home';
let events = [];
let stats = null;
let chatHistory = "Bot: Hola! Com et puc ajudar avui? 😊\n";
let isRecording = false;

// -- THEME --
document.body.style.setProperty('--accent-primary', tg.themeParams.button_color || '#a855f7');

// -- INIT --
const user = tg.initDataUnsafe?.user;
if (user) {
    document.getElementById('greeting').innerText = `Hola, ${user.first_name}!`;
    if (user.photo_url) document.getElementById('user-photo').src = user.photo_url;
}

function updateClock() {
    const now = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    const dateStr = now.toLocaleDateString('ca-ES', options);
    document.getElementById('date-display').innerText = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}
setInterval(updateClock, 1000);
updateClock();

// -- TAB NAVIGATION --
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === currentTab) return;
        switchTab(tab);
    });
});

function switchTab(tab) {
    tg.HapticFeedback.selectionChanged();
    document.querySelector('.nav-item.active').classList.remove('active');
    document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
    document.querySelector('.tab-content.active').classList.remove('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    currentTab = tab;
    
    if (tab === 'home') loadHomeData();
    if (tab === 'calendar') loadFullAgenda();
}

// -- DATA LOADING --
async function loadHomeData() {
    try {
        const [weatherRes, briefingRes, eventsRes, statsRes] = await Promise.all([
            fetch('/api/weather/detailed'),
            fetch('/api/briefing'),
            fetch('/api/events?max=3'),
            fetch('/api/stats')
        ]);

        const weather = await weatherRes.json();
        const briefing = await briefingRes.json();
        const homeEvents = await eventsRes.json();
        stats = await statsRes.json();

        renderWeather(weather);
        renderStats(stats);
        
        document.getElementById('summary-content').innerHTML = `<p>${briefing.text?.replace(/\n/g, '<br>') || 'No summary today.'}</p>`;

        const list = document.getElementById('preview-list');
        list.innerHTML = '';
        if (homeEvents.length === 0) {
            list.innerHTML = '<p style="opacity:0.5; font-size:0.9rem;">No upcoming events.</p>';
        } else {
            homeEvents.forEach(ev => {
                const time = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'All day';
                const row = document.createElement('div');
                row.className = 'event-row';
                const cat = getCategoryClass(ev.summary);
                row.innerHTML = `
                    <div class="event-meta"><span class="time-tag">${time}</span><div class="category-dot ${cat}"></div></div>
                    <div class="event-main"><h4>${ev.summary}</h4></div>
                `;
                list.appendChild(row);
            });
        }
    } catch (err) { console.error(err); }
}

function renderWeather(data) {
    if (data.error) return;
    document.getElementById('temp-val').innerText = `${data.current.temp}°`;
    document.getElementById('humidity').innerText = data.current.humidity;
    document.getElementById('wind').innerText = data.current.wind;
    document.getElementById('weather-desc').innerText = data.current.desc;
    
    const icon = document.getElementById('weather-icon-large');
    const desc = data.current.desc.toLowerCase();
    if (desc.includes('sun') || desc.includes('clear')) icon.innerText = '☀️';
    else if (desc.includes('cloud')) icon.innerText = '⛅';
    else if (desc.includes('rain')) icon.innerText = '🌧️';
    else if (desc.includes('snow')) icon.innerText = '❄️';
}

function renderStats(s) {
    document.getElementById('stat-total').innerText = s.total;
    document.getElementById('stat-work').innerText = s.categories.work;
}

function getCategoryClass(title) {
    title = title.toLowerCase();
    if (title.includes('reunió') || title.includes('work') || title.includes('feina')) return 'cat-work';
    if (title.includes('gimnàs') || title.includes('esport') || title.includes('sopar') || title.includes('cine')) return 'cat-leisure';
    return 'cat-personal';
}

// -- CALENDAR & SEARCH --
async function loadFullAgenda(query = '') {
    const container = document.getElementById('full-agenda-list');
    if (!query) container.innerHTML = '<div class="loading"><div class="skeleton" style="height:100px;"></div></div>';
    
    try {
        const res = await fetch(`/api/events?max=50`);
        let allEvents = await res.json();
        
        if (query) {
            allEvents = allEvents.filter(ev => ev.summary.toLowerCase().includes(query.toLowerCase()));
        }
        
        renderFullAgenda(allEvents);
    } catch (err) { container.innerHTML = '<p>Error.</p>'; }
}

function renderFullAgenda(items) {
    const container = document.getElementById('full-agenda-list');
    container.innerHTML = '';
    
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align:center; opacity:0.5; padding:40px;">No events found.</p>';
        return;
    }

    const groups = {};
    items.forEach(ev => {
        const d = new Date(ev.start.dateTime || ev.start.date);
        const dateKey = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(ev);
    });

    Object.keys(groups).forEach(date => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'glass-card';
        groupDiv.style.marginBottom = '24px';
        groupDiv.innerHTML = `<h3 class="day-title" style="margin-bottom:15px; color:var(--accent-primary); font-size:0.9rem;">${date.toUpperCase()}</h3>`;
        
        groups[date].forEach(ev => {
            const time = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'All day';
            const item = document.createElement('div');
            item.className = 'event-row';
            item.innerHTML = `
                <div class="event-meta"><span class="time-tag">${time}</span></div>
                <div class="event-main"><h4>${ev.summary}</h4></div>
                <button onclick="deleteEvent('${ev.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer;"><i class="lucide-trash-2"></i></button>
            `;
            groupDiv.appendChild(item);
        });
        container.appendChild(groupDiv);
    });
}

window.deleteEvent = async (id) => {
    tg.showConfirm("Delete this event?", async (ok) => {
        if (ok) {
            tg.HapticFeedback.notificationOccurred('warning');
            await fetch(`/api/events/${id}`, { method: 'DELETE' });
            loadFullAgenda();
        }
    });
};

// -- SEARCH TOGGLE --
document.getElementById('search-toggle').addEventListener('click', () => {
    const area = document.getElementById('search-area');
    area.classList.toggle('hidden');
    if (!area.classList.contains('hidden')) document.getElementById('global-search').focus();
});

document.getElementById('global-search').addEventListener('input', (e) => {
    if (currentTab === 'calendar') loadFullAgenda(e.target.value);
});

// -- AI CHAT --
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

document.getElementById('send-msg').addEventListener('click', sendAiMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAiMessage(); });

async function sendAiMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    appendMessage('user', text);
    chatInput.value = '';
    
    const botMsgDiv = appendMessage('bot', 'Typing...');
    
    try {
        const res = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history: chatHistory })
        });
        const data = await res.json();
        botMsgDiv.innerText = data.reply_message;
        chatHistory += `User: ${text}\nBot: ${data.reply_message}\n`;
    } catch (err) { botMsgDiv.innerText = "Error."; }
}

function appendMessage(role, text) {
    const msg = document.createElement('div');
    msg.className = `msg ${role}`;
    msg.innerText = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    tg.HapticFeedback.impactOccurred('light');
    return msg;
}

// -- VOICE RECORDING (SIMULATED) --
document.getElementById('record-voice').addEventListener('click', () => {
    isRecording = !isRecording;
    const btn = document.getElementById('record-voice');
    if (isRecording) {
        btn.parentElement.parentElement.classList.add('recording');
        tg.HapticFeedback.notificationOccurred('success');
    } else {
        btn.parentElement.parentElement.classList.remove('recording');
        tg.HapticFeedback.impactOccurred('medium');
        tg.showAlert("Voice analysis is being processed...");
        // In a real app, we'd use MediaRecorder here.
    }
});

// -- MODAL --
const modal = document.getElementById('event-modal');
document.querySelector('.add-btn').addEventListener('click', () => {
    modal.classList.remove('hidden');
    document.getElementById('ev-date').value = new Date().toISOString().split('T')[0];
});
document.getElementById('close-modal').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('submit-event').addEventListener('click', async () => {
    const title = document.getElementById('ev-title').value;
    const date = document.getElementById('ev-date').value;
    const time = document.getElementById('ev-time').value;
    
    if (!title || !date) return tg.showAlert("Title and date required.");
    
    await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventData: { title, date, time } })
    });
    modal.classList.add('hidden');
    tg.HapticFeedback.notificationOccurred('success');
    if (currentTab === 'calendar') loadFullAgenda();
    else loadHomeData();
});

// -- STARTUP --
loadHomeData();

tg.MainButton.setParams({ text: 'EXIT', color: '#ff4d4d' });
tg.MainButton.show();
tg.MainButton.onClick(() => tg.close());
