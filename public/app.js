const tg = window.Telegram.WebApp;
tg.expand();

// -- STATE --
let currentView = 'home';
let financeData = { balance: 0, transactions: [] };
let habits = [];
let weatherHistory = [18, 19, 21, 23, 22, 24, 23]; 

// -- INIT --
function init() {
    lucide.createIcons();
    updateDate();
    loadDashboard();
    setupNavigation();
    setupListeners();
}

function updateDate() {
    const now = new Date();
    document.getElementById('date-display').innerText = "SISTEMA OPERATIU ACTIU | " + now.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'}).toUpperCase();
}

// -- NAVIGATION --
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(view) {
    if (view === currentView) return;
    tg.HapticFeedback.selectionChanged();
    
    document.querySelectorAll('.nav-btn').forEach(i => i.classList.remove('active'));
    document.querySelector(`.nav-btn[data-view="${view}"]`).classList.add('active');
    
    document.querySelectorAll('.view-layer').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    
    currentView = view;
    window.scrollTo(0,0);
    
    if (view === 'calendar') loadFullAgenda();
    if (view === 'vault') loadVault();
}

// -- DATA LOADING --
async function loadDashboard() {
    try {
        const [weather, briefing, events, finance, habitsRes] = await Promise.all([
            fetch('/api/weather/detailed').then(r => r.json()),
            fetch('/api/briefing').then(r => r.json()),
            fetch('/api/events?max=3').then(r => r.json()),
            fetch('/api/finance').then(r => r.json()),
            fetch('/api/habits').then(r => r.json())
        ]);

        renderWeather(weather);
        renderBriefing(briefing);
        renderEvents(events);
        renderFinance(finance);
        renderHabits(habitsRes);
        lucide.createIcons();
    } catch (err) { console.error("Load error:", err); }
}

function renderWeather(data) {
    if (data.error) return;
    document.getElementById('temp-val').innerText = `${data.current.temp}°`;
    document.getElementById('weather-desc').innerText = data.current.desc.toUpperCase();
    
    const ctx = document.getElementById('weather-mini-chart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['', '', '', '', '', '', ''],
            datasets: [{
                data: weatherHistory,
                borderColor: '#ffffff',
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                backgroundColor: 'rgba(255,255,255,0.03)',
                tension: 0.4
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { display: false } },
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderBriefing(data) {
    document.getElementById('summary-content').innerHTML = data.text?.replace(/\n/g, '<br>') || 'Sense briefing disponible.';
}

function renderEvents(items) {
    const container = document.getElementById('preview-list');
    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = '<p style="opacity:0.3; font-size:0.8rem; padding: 20px;">No hi ha activitat programada.</p>';
        return;
    }
    items.forEach(ev => {
        const time = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'TODO EL DIA';
        const div = document.createElement('div');
        div.className = 'activity-card';
        div.innerHTML = `
            <div class="activity-time">${time}</div>
            <div class="activity-info"><h4>${ev.summary}</h4></div>
            <i data-lucide="chevron-right" style="width: 16px; margin-left: auto; opacity: 0.2;"></i>
        `;
        container.appendChild(div);
    });
}

function renderFinance(data) {
    financeData = data;
    document.getElementById('balance-display').innerText = `${data.balance.toFixed(2)}€`;
}

function renderHabits(items) {
    habits = items;
    const preview = document.getElementById('habits-preview');
    preview.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    
    items.slice(0, 2).forEach(h => {
        const isDone = h.history[today];
        const div = document.createElement('div');
        div.className = 'habit-item';
        div.innerHTML = `
            <span class="habit-name">${h.name}</span>
            <div class="habit-toggle ${isDone ? 'done' : ''}" onclick="toggleHabit(${h.id})">
                ${isDone ? '<i data-lucide="check" style="width:14px;"></i>' : ''}
            </div>
        `;
        preview.appendChild(div);
    });
    lucide.createIcons();
}

window.toggleHabit = async (id) => {
    const today = new Date().toISOString().split('T')[0];
    tg.HapticFeedback.impactOccurred('light');
    const res = await fetch('/api/habits/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, date: today })
    });
    renderHabits(await res.json());
};

// -- VAULT LOGIC --
async function loadVault() {
    const financeHistory = document.getElementById('finance-history');
    financeHistory.innerHTML = financeData.transactions.map(t => `
        <div class="activity-card" style="padding: 12px 16px;">
            <div style="flex: 1;">
                <p style="font-weight: 700; font-size: 0.85rem;">${t.note}</p>
                <p style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">${new Date(t.date).toLocaleDateString()}</p>
            </div>
            <div style="font-weight: 800; font-size: 1rem; color: ${t.type === 'income' ? 'var(--success)' : 'white'}">
                ${t.type === 'income' ? '+' : '-'}${t.amount}€
            </div>
        </div>
    `).join('') || '<p style="opacity:0.3; padding:20px;">Sense transaccions recents.</p>';

    const emailList = document.getElementById('email-list-container');
    const emailsRes = await fetch('/api/emails').then(r => r.json());
    emailList.innerHTML = emailsRes.recent?.map(m => `
        <div class="activity-card" style="padding: 12px 16px;">
            <div style="flex: 1;">
                <p style="font-weight: 700; font-size: 0.85rem;">${m.from.split('<')[0]}</p>
                <p style="font-size: 0.75rem; color: var(--text-secondary);">${m.subject}</p>
            </div>
            <i data-lucide="mail" style="width: 14px; opacity: 0.3;"></i>
        </div>
    `).join('') || '<p style="opacity:0.3;">No hi ha comunicacions recents.</p>';
    lucide.createIcons();
}

document.getElementById('add-expense').addEventListener('click', async () => {
    const amount = document.getElementById('finance-amount').value;
    if (!amount) return;
    const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note: 'DESPESA MANUAL', type: 'expense' })
    });
    renderFinance(await res.json());
    document.getElementById('finance-amount').value = '';
    tg.HapticFeedback.notificationOccurred('success');
    loadVault();
});

// -- AI LOGIC --
async function sendAiMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    appendMsg('user', text);
    input.value = '';
    const botDiv = appendMsg('bot', 'ANALITZANT...');
    
    try {
        const res = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        botDiv.innerText = data.reply_message;
    } catch (err) { botDiv.innerText = 'ERROR DE CONNEXIÓ.'; }
}

function appendMsg(role, text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg msg-${role}`;
    div.innerText = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

window.quickAi = (text) => {
    document.getElementById('chat-input').value = text;
    sendAiMessage();
};

// -- MODAL --
const modal = document.getElementById('event-modal');
document.getElementById('open-modal-btn').addEventListener('click', () => modal.classList.remove('hidden'));
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
    loadDashboard();
});

// -- TIMELINE --
async function loadFullAgenda() {
    const container = document.getElementById('full-agenda-list');
    container.innerHTML = '<p style="padding: 40px; opacity: 0.3; font-size: 0.8rem;">SINCRONITZANT LÍNIA DE TEMPS...</p>';
    const res = await fetch('/api/events?max=50').then(r => r.json());
    container.innerHTML = '';
    res.forEach(ev => {
        const d = new Date(ev.start.dateTime || ev.start.date);
        const div = document.createElement('div');
        div.className = 'activity-card';
        div.innerHTML = `
            <div class="activity-time">
                ${d.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'})}<br>
                <b>${ev.start.dateTime ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'SENCER'}</b>
            </div>
            <div style="flex: 1; border-left: 2px solid var(--border); padding-left: 15px; margin-left: 10px;">
                <p style="font-weight: 800; font-size: 0.9rem;">${ev.summary}</p>
            </div>
        `;
        container.appendChild(div);
    });
}

function setupListeners() {
    document.getElementById('send-msg').addEventListener('click', sendAiMessage);
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAiMessage();
    });
}

init();
