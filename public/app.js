const tg = window.Telegram.WebApp;
tg.expand();

// -- STATE --
let currentView = 'home';
let financeData = { balance: 0, transactions: [] };
let habits = [];
let weatherHistory = [18, 19, 17, 21, 22, 20, 19]; // Simulated for chart

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
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('date-display').innerText = now.toLocaleDateString('ca-ES', options).toUpperCase();
}

// -- NAVIGATION --
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
        });
    });
}

function switchView(view) {
    if (view === currentView) return;
    tg.HapticFeedback.selectionChanged();
    
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.nav-item[data-view="${view}"]`).classList.add('active');
    
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
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
                backgroundColor: 'rgba(255,255,255,0.05)',
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
        container.innerHTML = '<p style="opacity:0.5; font-size:0.8rem;">No hi ha activitat programada.</p>';
        return;
    }
    items.forEach(ev => {
        const time = ev.start.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('ca-ES', {hour:'2-digit', minute:'2-digit'}) : 'Dia sencer';
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
            <div style="min-width: 50px; font-weight: 800; font-size: 0.75rem; color: var(--text-muted);">${time}</div>
            <div style="flex: 1; font-weight: 600; font-size: 0.9rem;">${ev.summary}</div>
            <i data-lucide="chevron-right" style="width: 14px; opacity: 0.3;"></i>
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
        div.className = 'habit-row';
        div.innerHTML = `
            <span>${h.name}</span>
            <div class="habit-check ${isDone ? 'done' : ''}" onclick="toggleHabit(${h.id})">
                ${isDone ? '<i data-lucide="check" style="width:12px;"></i>' : ''}
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
        <div class="item-row">
            <div style="flex: 1;">
                <p style="font-weight: 600; font-size: 0.85rem;">${t.note}</p>
                <p style="font-size: 0.7rem; color: var(--text-muted);">${new Date(t.date).toLocaleDateString()}</p>
            </div>
            <div class="${t.type === 'income' ? 'success-text' : 'danger-text'}" style="font-weight: 700;">
                ${t.type === 'income' ? '+' : '-'}${t.amount}€
            </div>
        </div>
    `).join('') || '<p style="opacity:0.5; padding:20px;">Sense transaccions.</p>';

    // Emails in vault
    const emailList = document.getElementById('email-list-container');
    const emailsRes = await fetch('/api/emails').then(r => r.json());
    emailList.innerHTML = emailsRes.recent?.map(m => `
        <div class="item-row">
            <div style="flex: 1;">
                <p style="font-weight: 600; font-size: 0.85rem;">${m.from.split('<')[0]}</p>
                <p style="font-size: 0.75rem; color: var(--text-muted);">${m.subject}</p>
            </div>
        </div>
    `).join('') || '<p style="opacity:0.5;">No hi ha correus.</p>';
    lucide.createIcons();
}

document.getElementById('add-expense').addEventListener('click', async () => {
    const amount = document.getElementById('finance-amount').value;
    if (!amount) return;
    const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note: 'Despesa manual', type: 'expense' })
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
    const botDiv = appendMsg('bot', 'Processant consulta...');
    
    try {
        const res = await fetch('/api/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        botDiv.innerText = data.reply_message;
        
        // Contextual actions
        if (data.intent === 'create_event') {
            const action = document.createElement('div');
            action.className = 'ai-action-card';
            action.innerHTML = `
                <span style="font-size: 0.8rem; font-weight: 600;">Vols afegir "${data.title}"?</span>
                <button class="btn-primary" style="width: auto; padding: 6px 12px; font-size: 0.7rem;" onclick="confirmAiEvent('${data.title}', '${data.date}', '${data.time}')">Confirmar</button>
            `;
            botDiv.appendChild(action);
        }
    } catch (err) { botDiv.innerText = 'Error de connexió.'; }
}

function appendMsg(role, text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-bubble ${role === 'user' ? 'user' : 'bot'}`;
    div.innerText = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

window.quickAi = (text) => {
    document.getElementById('chat-input').value = text;
    sendAiMessage();
};

window.confirmAiEvent = async (title, date, time) => {
    await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventData: { title, date, time } })
    });
    tg.showAlert('Esdeveniment sincronitzat');
    loadDashboard();
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
    container.innerHTML = '<p style="padding: 40px; opacity: 0.5;">Sincronitzant línia de temps...</p>';
    const res = await fetch('/api/events?max=50').then(r => r.json());
    container.innerHTML = '';
    res.forEach(ev => {
        const d = new Date(ev.start.dateTime || ev.start.date);
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
            <div style="min-width: 80px; font-size: 0.7rem; color: var(--text-muted);">
                ${d.toLocaleDateString('ca-ES', {day:'2-digit', month:'2-digit'})}<br>
                <b>${ev.start.dateTime ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'Dia sencer'}</b>
            </div>
            <div style="flex: 1; border-left: 2px solid var(--border); padding-left: 15px;">
                <p style="font-weight: 700; font-size: 0.9rem;">${ev.summary}</p>
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

// Start
init();
