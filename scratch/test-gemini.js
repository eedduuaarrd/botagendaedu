import { summarizeEmails } from '../src/services/gemini.js';

async function run() {
  const text = await summarizeEmails("De: Test\nAssumpte: Hola\nResum: Hola què tal\n---");
  console.log(text);
}
run();
