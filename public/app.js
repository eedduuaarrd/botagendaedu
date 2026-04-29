const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// -- STATE --
let currentTab = 'home';
let tasks = [];
let chatHistory = "Bot: Hola! Sóc el teu assistent. Com et puc ajudar?\n";

// -- INIT --
const user = tg.initDataUnsafe?.user;
if (user) document.getElementById('greeting').innerText = `Hola, ${user.first_name}`;

function updateDate() {
    const now = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('date-display').innerText = now.toLocaleDateString('ca-ES', options).toUpperCase();
}
updateDate();

// -- NAVIGATION --
document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === currentTab) return;
        switchTab(tab);
    });
});

function switchTab(tab) {
    tg.HapticFeedback.selectionChanged();
    document.querySelector('.nav-link.active').classList.remove('active');
    document.querySelector(`.nav-link[data-tab="${tab}"]`).classList.add('active');
    document.querySelector('.tab-content.active').classList.remove('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    currentTab = tab;
    
    if (tab === 'home') loadHomeData();
    if (tab === 'calendar') loadFullAgenda();
}

// -- DATA LOADING --
async function loadHomeData() {
    try {
        const [weatherRes, briefingRes, eventsRes, emailsRes, tasksRes] = await Promise.all([
            fetch('/api/weather/detailed'),
            fetch('/api/briefing'),
            fetch('/api/events?max=3'),
            fetch('/api/emails'),
            fetch('/api/tasks')
        ]);

        renderWeather(await weatherRes.json());
        renderBriefing(await briefingRes.json());
        renderEvents(await eventsRes.json());
        renderEmails(await emailsRes.json());
        renderTasks(await tasksRes.json());
    } catch (err) { console.error(err); }
}

function renderWeather(data) {
    if (data.error) return;
    document.getElementById('temp-val').innerText = `${data.current.temp}°`;
    document.getElementById('weather-desc').innerText = data.current.desc;
    document.getElementById('wind-val').innerText = `Vent: ${data.current.wind} km/h`;
    document.getElementById('humidity-val').innerText = `Humitat: ${data.current.humidity}%`;
}

function renderBriefing(data) {
    document.getElementById('summary-content').innerHTML = data.text?.replace(/\n/g, '<br>') || 'Sense resum.';
}

function renderEvents(items) {
    const list = document.getElementById('preview-list');
    list.innerHTML = '';
    if (items.length === 0) {
        list.innerHTML = '<p style="opacity:0.5; font-size:0.8rem;">No hi ha esdeveniments avui.</p>';
        return;
    }
    items.forEach(ev => {
        const time = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'Tot el dia';
        const div = document.createElement('div');
        div.className = 'event-item';
        div.innerHTML = `
            <div class="time-slot">${time}</div>
            <div class="event-info"><h4>${ev.summary}</h4></div>
        `;
        list.appendChild(div);
    });
}

function renderEmails(data) {
    const container = document.getElementById('email-list-container');
    container.innerHTML = '';
    const recent = data.recent || [];
    if (recent.length === 0) {
        container.innerHTML = '<p style="opacity:0.5; font-size:0.8rem;">No hi ha correus nous.</p>';
        return;
    }
    recent.slice(0, 5).forEach(m => {
        const div = document.createElement('div');
        div.className = 'mail-item';
        div.innerHTML = `
            <span class="mail-sender">${m.from.split('<')[0]}</span>
            <span class="mail-subject">${m.subject}</span>
        `;
        container.appendChild(div);
    });
}

// -- TASKS LOGIC --
async function renderTasks(items) {
    tasks = items;
    const container = document.getElementById('task-list-container');
    container.innerHTML = '';
    if (tasks.length === 0) {
        container.innerHTML = '<p style="opacity:0.5; font-size:0.8rem;">No hi ha tasques.</p>';
        return;
    }
    tasks.forEach(t => {
        const div = document.createElement('div');
        div.className = `task-item ${t.completed ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="checkbox" onclick="toggleTask(${t.id})">${t.completed ? '✓' : ''}</div>
            <span style="flex:1;">${t.text}</span>
            <button onclick="deleteTask(${t.id})" style="background:none; border:none; color:var(--text-secondary); cursor:pointer;">×</button>
        `;
        container.appendChild(div);
    });
}

window.toggleTask = async (id) => {
    tg.HapticFeedback.impactOccurred('light');
    await fetch(`/api/tasks/${id}`, { method: 'PUT' });
    const res = await fetch('/api/tasks');
    renderTasks(await res.json());
};

window.deleteTask = async (id) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    const res = await fetch('/api/tasks');
    renderTasks(await res.json());
};

document.getElementById('add-task-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-task-input');
    const val = input.value.trim();
    if (!val) return;
    tg.HapticFeedback.notificationOccurred('success');
    await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: val })
    });
    input.value = '';
    const res = await fetch('/api/tasks');
    renderTasks(await res.json());
});

// -- CALENDAR --
async function loadFullAgenda() {
    const container = document.getElementById('full-agenda-list');
    container.innerHTML = '<div class="text-center" style="padding:40px; opacity:0.5;">Carregant línia de temps...</div>';
    try {
        const res = await fetch('/api/events?max=50');
        const items = await res.json();
        container.innerHTML = '';
        const groups = {};
        items.forEach(ev => {
            const d = new Date(ev.start.dateTime || ev.start.date);
            const key = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            if (!groups[key]) groups[key] = [];
            groups[key].push(ev);
        });
        Object.keys(groups).forEach(date => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `<h3 style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; margin-bottom:12px;">${date}</h3>`;
            groups[date].forEach(ev => {
                const time = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'Tot el dia';
                div.innerHTML += `
                    <div class="event-item">
                        <div class="time-slot">${time}</div>
                        <div class="event-info" style="flex:1;"><h4>${ev.summary}</h4></div>
                        <button onclick="deleteEvent('${ev.id}')" style="background:none; border:none; color:var(--text-secondary); cursor:pointer;">🗑️</button>
                    </div>
                `;
            });
            container.appendChild(div);
        });
    } catch (err) { container.innerHTML = 'Error.'; }
}

window.deleteEvent = async (id) => {
    tg.showConfirm("Eliminar aquest esdeveniment?", async (ok) => {
        if (ok) {
            await fetch(`/api/events/${id}`, { method: 'DELETE' });
            loadFullAgenda();
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
    appendMsg('user', text);
    chatInput.value = '';
    const botDiv = appendMsg('bot', 'Processant...');
    try {
        const res = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history: chatHistory })
        });
        const data = await res.json();
        botDiv.innerText = data.reply_message;
        chatHistory += `Usuari: ${text}\nBot: ${data.reply_message}\n`;
    } catch (err) { botDiv.innerText = 'Error.'; }
}

function appendMsg(role, text) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    div.innerText = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    tg.HapticFeedback.impactOccurred('light');
    return div;
}

// -- SETTINGS --
async function loadPrefs() {
    try {
        const res = await fetch('/api/preferences');
        const p = await res.json();
        document.getElementById('pref-summary-time').value = p.summaryTime;
        document.getElementById('pref-duration').value = p.defaultDuration;
    } catch (err) {}
}

document.getElementById('save-prefs').addEventListener('click', async () => {
    const p = {
        summaryTime: document.getElementById('pref-summary-time').value,
        defaultDuration: parseInt(document.getElementById('pref-duration').value)
    };
    await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
    });
    tg.showAlert("Canvis guardats.");
});

document.getElementById('reauth-btn').addEventListener('click', () => tg.openLink(window.location.origin + '/auth'));

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
    if (!title || !date) return;
    await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventData: { title, date, time } })
    });
    modal.classList.add('hidden');
    loadHomeData();
});

// -- STARTUP --
loadHomeData();
loadPrefs();
tg.MainButton.setText('TANCAR').show();
tg.MainButton.onClick(() => tg.close());
