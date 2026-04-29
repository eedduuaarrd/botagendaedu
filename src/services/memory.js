import fs from 'fs/promises';
import path from 'path';

const MEMORIES_FILE = path.resolve('data/memories.json');

export class MemoryService {
  static async ensureFile() {
    try {
      await fs.mkdir(path.dirname(MEMORIES_FILE), { recursive: true });
      try {
        await fs.access(MEMORIES_FILE);
      } catch {
        await fs.writeFile(MEMORIES_FILE, JSON.stringify([]));
      }
    } catch (err) {
      console.error("Error ensuring memories file:", err);
    }
  }

  static async getAll() {
    await this.ensureFile();
    const data = await fs.readFile(MEMORIES_FILE, 'utf8');
    return JSON.parse(data);
  }

  static async save(content, tags = []) {
    const memories = await this.getAll();
    const newMemory = {
      id: Math.random().toString(36).substring(2, 9),
      content,
      tags,
      timestamp: new Date().toISOString()
    };
    memories.push(newMemory);
    await fs.writeFile(MEMORIES_FILE, JSON.stringify(memories, null, 2));
    return newMemory;
  }

  static async search(query, ai) {
    const memories = await this.getAll();
    if (memories.length === 0) return null;

    const memoriesText = memories.map((m, i) => `[${i}] ${m.content} (Tags: ${m.tags.join(',')})`).join('\n');
    
    const prompt = `Aquí tens una llista de memòries de l'Edu:
${memoriesText}

L'Edu pregunta: "${query}"

Troba la memòria més rellevant i respon de forma natural. Si no n'hi ha cap de rellevant, digues que no ho recordes.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0.3 }
    });
    return response.text;
  }

  static async delete(id) {
    let memories = await this.getAll();
    memories = memories.filter(m => m.id !== id);
    await fs.writeFile(MEMORIES_FILE, JSON.stringify(memories, null, 2));
  }
}
