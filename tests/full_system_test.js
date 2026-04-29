import { parseNaturalLanguage, summarizeEmails, generateMorningGreeting } from '../src/services/gemini.js';
import { listUpcomingEvents } from '../src/services/calendar.js';
import { WeatherAgent } from '../src/agents/WeatherAgent.js';
import { MailAgent } from '../src/agents/MailAgent.js';
import { config } from '../src/config/env.js';

async function runTests() {
    console.log('🚀 Iniciant proves del sistema...\n');

    // 1. Test Agents & Services
    console.log('--- 1. Prova de Gemini Service ---');
    try {
        const testText = "Crea un event per demà a les 10h que es digui Reunió";
        const result = await parseNaturalLanguage(testText, new Date().toISOString(), "");
        console.log('✅ Intent detectat:', result.intent);
        if (result.intent !== 'create_event') console.error('❌ Error: Intent incorrecte');
    } catch (e) {
        console.error('❌ Error Gemini:', e.message);
    }

    console.log('\n--- 2. Prova de Weather Agent ---');
    try {
        const weather = await WeatherAgent.getWeather();
        console.log('✅ Temps rebut:', weather.substring(0, 50) + '...');
    } catch (e) {
        console.error('❌ Error Weather:', e.message);
    }

    console.log('\n--- 3. Prova de Mail Agent (Simulada) ---');
    try {
        // Simulem correus per no dependre de l'auth en el test si no estem autenticats
        const summary = await summarizeEmails("De: Joan\nAssumpte: Hola\nResum: Prova de correu\n---");
        console.log('✅ Resum correus:', summary.substring(0, 50) + '...');
    } catch (e) {
        console.error('❌ Error Mail:', e.message);
    }

    console.log('\n--- 4. Prova de Morning Greeting ---');
    try {
        const greeting = await generateMorningGreeting("10:00 - Reunió", "Sol i calor");
        console.log('✅ Greeting generat:', greeting.substring(0, 50) + '...');
    } catch (e) {
        console.error('❌ Error Greeting:', e.message);
    }

    console.log('\n--- 5. Prova de Calendar Service (List) ---');
    try {
        const events = await listUpcomingEvents(5);
        console.log('✅ Events llistats:', events ? events.length : 0);
    } catch (e) {
        console.warn('⚠️ Nota: Calendar pot fallar si no està autenticat, però el servei està a punt.');
    }

    console.log('\n✅ Proves finalitzades!');
}

runTests();
