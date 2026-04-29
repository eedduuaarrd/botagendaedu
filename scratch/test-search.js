import { searchEvent } from '../src/services/calendar.js';
import { loadSavedCredentials } from '../src/config/googleAuth.js';

async function testSearch() {
  await loadSavedCredentials();
  const events = await searchEvent("padel");
  console.log("Padel:", events.map(e => e.summary));
  const events2 = await searchEvent("pàdel");
  console.log("Pàdel:", events2.map(e => e.summary));
  const events3 = await searchEvent("partit de padel");
  console.log("partit de padel:", events3.map(e => e.summary));
}

testSearch().catch(console.error);
