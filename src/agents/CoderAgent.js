import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CoderAgent {
  /**
   * Executa una comanda al sistema.
   */
  static async runCommand(command) {
    try {
      console.log(`Executing command: ${command}`);
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      return {
        success: true,
        output: stdout,
        error: stderr
      };
    } catch (error) {
      return {
        success: false,
        output: error.stdout,
        error: error.stderr || error.message
      };
    }
  }

  /**
   * Llegeix un fitxer.
   */
  static async readFile(filePath) {
    try {
      const fullPath = path.resolve(filePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Escriu un fitxer.
   */
  static async writeFile(filePath, content) {
    try {
      const fullPath = path.resolve(filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Llista un directori.
   */
  static async listDir(dirPath = '.') {
    try {
      const fullPath = path.resolve(dirPath);
      const files = fs.readdirSync(fullPath);
      const stats = files.map(file => {
        const s = fs.statSync(path.join(fullPath, file));
        return `${s.isDirectory() ? '📁' : '📄'} ${file}`;
      });
      return { success: true, files: stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handler principal per a peticions de codi/sistema.
   */
  static async handleRequest(bot, chatId, data) {
    const { action, path: filePath, content, command } = data.code_params || {};
    
    let result;
    let responseText = "";

    switch (action) {
      case 'run_command':
        bot.sendMessage(chatId, `⏳ Executant: \`${command}\`...`, { parse_mode: 'Markdown' });
        result = await this.runCommand(command);
        responseText = result.success 
          ? `✅ **Comanda executada:**\n\`\`\`\n${result.output || '(sense sortida)'}\n\`\`\``
          : `❌ **Error en la comanda:**\n\`\`\`\n${result.error}\n\`\`\``;
        break;

      case 'read_file':
        result = await this.readFile(filePath);
        responseText = result.success
          ? `📄 **Contingut de ${filePath}:**\n\`\`\`\n${result.content}\n\`\`\``
          : `❌ **Error llegint fitxer:** ${result.error}`;
        break;

      case 'write_file':
        result = await this.writeFile(filePath, content);
        responseText = result.success
          ? `✅ Fitxer \`${filePath}\` guardat correctament.`
          : `❌ **Error escrivint fitxer:** ${result.error}`;
        break;

      case 'list_dir':
        result = await this.listDir(filePath || '.');
        responseText = result.success
          ? `📂 **Directori ${filePath || '.'}:**\n${result.files.join('\n')}`
          : `❌ **Error llistant directori:** ${result.error}`;
        break;

      default:
        responseText = "No he entès quina acció de sistema vols realitzar.";
    }

    // Si el text és massa llarg per a Telegram (4096 caràcters), el tallem
    if (responseText.length > 4000) {
      responseText = responseText.substring(0, 3990) + "... (tallat)";
    }

    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
  }
}
