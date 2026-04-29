const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// -- STATE --
let currentTab = 'home';
let events = [];
let chatHistory = "Bot: Hola! Com et puc ajudar avui? 😊\n";

// -- THEME --
document.body.style.setProperty('--bg-color', tg.themeParams.bg_color || '#0d0f17');
document.body.style.setProperty('--text-primary', tg.themeParams.text_color || '#ffffff');
document.body.style.setProperty('--accent-primary', tg.themeParams.button_color || '#8b5cf6');

// -- INIT --
const user = tg.initDataUnsafe?.user;
if (user) {
    document.getElementById('greeting').innerText = `Hola, ${user.first_name}!`;
    if (user.photo_url) document.getElementById('user-photo').src = user.photo_url;
}

const dateOptions = { weekday: 'long', day: 'numeric', month: 'long' };
const dateStr = new Date().toLocaleDateString('ca-ES', dateOptions);
document.getElementById('date-display').innerText = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

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
    
    // UI Update
    document.querySelector('.nav-item.active').classList.remove('active');
    document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
    
    document.querySelector('.tab-content.active').classList.remove('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    currentTab = tab;
    
    // Refresh data if needed
    if (tab === 'calendar') loadFullAgenda();
    if (tab === 'home') loadHomeData();
}

// -- DATA LOADING (HOME) --
async function loadHomeData() {
    try {
        const [weatherRes, briefingRes, eventsRes] = await Promise.all([
            fetch('/api/weather'),
            fetch('/api/briefing'),
            fetch('/api/events?max=5')
        ]);

        const weather = await weatherRes.json();
        const briefing = await briefingRes.json();
        const homeEvents = await eventsRes.json();

        // Render Weather
        if (weather.text) {
            const tempMatch = weather.text.match(/(\d+)ºC/) || weather.text.match(/(\d+)°/);
            document.getElementById('temp-val').innerText = tempMatch ? `${tempMatch[1]}°` : '--°';
            const iconSpan = document.getElementById('weather-icon');
            const wText = weather.text.toLowerCase();
            if (wText.includes('sol') || wText.includes('clar')) iconSpan.innerText = '☀️';
            else if (wText.includes('núvol')) iconSpan.innerText = '⛅';
            else if (wText.includes('pluja')) iconSpan.innerText = '🌧️';
            else iconSpan.innerText = '🌡️';
        }

        // Render Briefing
        document.getElementById('summary-content').innerHTML = `<p>${briefing.text?.replace(/\n/g, '<br>') || 'Sense dades.'}</p>`;

        // Render Preview Agenda
        const list = document.getElementById('preview-list');
        list.innerHTML = '';
        if (homeEvents.length === 0) {
            list.innerHTML = '<li class="loading">No tens res per avui! ✨</li>';
        } else {
            homeEvents.forEach(ev => {
                const time = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'Tot el dia';
                const li = document.createElement('li');
                li.className = 'event-item';
                li.innerHTML = `<span class="event-time">${time}</span><span class="event-title">${ev.summary}</span>`;
                list.appendChild(li);
            });
        }
        
        // Render Mail Preview
        const mailRes = await fetch('/api/emails');
        const mailData = await mailRes.json();
        document.getElementById('mail-content-preview').innerHTML = `<p style="font-size: 0.9rem; opacity: 0.8;">${mailData.summary?.substring(0, 100)}...</p>`;

    } catch (err) {
        console.error(err);
    }
}

// -- DATA LOADING (CALENDAR) --
async function loadFullAgenda() {
    const list = document.getElementById('full-agenda-list');
    list.innerHTML = '<div class="loading"><div class="skeleton" style="height: 50px; margin-bottom: 10px;"></div><div class="skeleton" style="height: 50px;"></div></div>';
    
    try {
        const res = await fetch('/api/events?max=30');
        events = await res.json();
        renderFullAgenda(events);
    } catch (err) {
        list.innerHTML = '<p>Error carregant l\'agenda.</p>';
    }
}

function renderFullAgenda(items) {
    const container = document.getElementById('full-agenda-list');
    container.innerHTML = '';
    
    if (items.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.5; padding: 40px;">No hi ha esdeveniments propers.</p>';
        return;
    }

    // Group by date
    const groups = {};
    items.forEach(ev => {
        const d = new Date(ev.start.dateTime || ev.start.date);
        const dateKey = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(ev);
    });

    Object.keys(groups).forEach(date => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'agenda-day-group';
        groupDiv.innerHTML = `<h3 class="day-title">${date.toUpperCase()}</h3>`;
        
        groups[date].forEach(ev => {
            const time = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'Tot el dia';
            const item = document.createElement('div');
            item.className = 'agenda-item glass';
            item.innerHTML = `
                <div class="agenda-info">
                    <span class="agenda-time">${time}</span>
                    <span class="agenda-title">${ev.summary}</span>
                </div>
                <div class="agenda-actions">
                    <button onclick="deleteEvent('${ev.id}')">🗑️</button>
                </div>
            `;
            groupDiv.appendChild(item);
        });
        container.appendChild(groupDiv);
    });
}

window.deleteEvent = async (id) => {
    tg.showConfirm("Vols esborrar aquest esdeveniment?", async (ok) => {
        if (ok) {
            tg.HapticFeedback.notificationOccurred('warning');
            try {
                await fetch(`/api/events/${id}`, { method: 'DELETE' });
                loadFullAgenda();
            } catch (err) {
                tg.showAlert("No s'ha pogut esborrar.");
            }
        }
    });
};

// -- AI CHAT --
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

document.getElementById('send-msg').addEventListener('click', sendAiMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAiMessage(); });

async function sendAiMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    tg.HapticFeedback.impactOccurred('light');
    
    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'msg user';
    userMsg.innerText = text;
    chatMessages.appendChild(userMsg);
    chatInput.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    chatHistory += `Usuari: ${text}\n`;
    
    // Add loading bot message
    const botMsg = document.createElement('div');
    botMsg.className = 'msg bot';
    botMsg.innerText = '...';
    chatMessages.appendChild(botMsg);
    
    try {
        const res = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history: chatHistory })
        });
        const data = await res.json();
        
        botMsg.innerText = data.reply_message || "No he pogut respondre.";
        chatHistory += `Bot: ${botMsg.innerText}\n`;
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
    } catch (err) {
        botMsg.innerText = "Error de connexió.";
    }
}

// -- SETTINGS --
async function loadPrefs() {
    try {
        const res = await fetch('/api/preferences');
        const prefs = await res.json();
        document.getElementById('pref-summary-time').value = prefs.summaryTime;
        document.getElementById('pref-duration').value = prefs.defaultDuration;
    } catch (err) {}
}

document.getElementById('save-prefs').addEventListener('click', async () => {
    tg.HapticFeedback.notificationOccurred('success');
    const prefs = {
        summaryTime: document.getElementById('pref-summary-time').value,
        defaultDuration: parseInt(document.getElementById('pref-duration').value)
    };
    await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs)
    });
    tg.showAlert("Preferències guardades!");
});

document.getElementById('reauth-btn').addEventListener('click', () => {
    tg.openLink(window.location.origin + '/auth');
});

// -- MODAL ADD EVENT --
const modal = document.getElementById('event-modal');
document.querySelectorAll('.add-btn').forEach(b => b.addEventListener('click', () => {
    modal.classList.remove('hidden');
    // Set default date to today
    document.getElementById('ev-date').value = new Date().toISOString().split('T')[0];
}));

document.getElementById('close-modal').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('submit-event').addEventListener('click', async () => {
    const title = document.getElementById('ev-title').value;
    const date = document.getElementById('ev-date').value;
    const time = document.getElementById('ev-time').value;
    
    if (!title || !date) return tg.showAlert("Falta el títol o la data.");
    
    tg.HapticFeedback.notificationOccurred('success');
    
    try {
        await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventData: { title, date, time } })
        });
        modal.classList.add('hidden');
        if (currentTab === 'calendar') loadFullAgenda();
        else loadHomeData();
    } catch (err) {
        tg.showAlert("Error creant l'esdeveniment.");
    }
});

// -- STARTUP --
loadHomeData();
loadPrefs();

// Main Button
tg.MainButton.setText('TANCAR APP');
tg.MainButton.show();
tg.MainButton.onClick(() => tg.close());
