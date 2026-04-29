import { TerminalService } from '../services/terminal.js';
import { FileSystemService } from '../services/filesystem.js';
import { AIEditorService } from '../services/ai_editor.js';
import { BrowserService } from '../services/browser.js';
import { SSHService } from '../services/ssh.js';
import { config } from '../config/env.js';
import fs from 'fs';

export class SupremeAgent {
  static async handleAction(bot, chatId, data) {
    const { action, command, file_path, content, git_args, url, browser_instruction } = data;

    try {
      switch (action) {
        case 'shell':
          if (config.ssh.host) {
            await this.handleSSH(bot, chatId, command);
          } else {
            await this.handleShell(bot, chatId, command);
          }
          break;
        case 'ssh':
          await this.handleSSH(bot, chatId, command);
          break;
        case 'read_file':
          await this.handleReadFile(bot, chatId, file_path);
          break;
        case 'edit_file':
          await this.handleEditFile(bot, chatId, file_path, content);
          break;
        case 'list_files':
          await this.handleListFiles(bot, chatId, file_path || '.');
          break;
        case 'git':
          await this.handleGit(bot, chatId, git_args);
          break;
        case 'browser':
          await this.handleBrowser(bot, chatId, url, browser_instruction);
          break;
        default:
          bot.sendMessage(chatId, "Acció 'supreme' no reconeguda. 🤔");
      }
    } catch (error) {
      console.error("Error al SupremeAgent:", error);
      bot.sendMessage(chatId, `❌ Error en l'acció supreme: ${error.message}`);
    }
  }

  static async handleShell(bot, chatId, command) {
    bot.sendMessage(chatId, `💻 Executant: \`${command}\``, { parse_mode: 'Markdown' });
    const result = await TerminalService.execute(command);
    const output = result.stdout || result.stderr || "(sense sortida)";
    bot.sendMessage(chatId, `📤 **Sortida:**\n\`\`\`\n${output.substring(0, 3000)}\n\`\`\``, { parse_mode: 'Markdown' });
  }

  static async handleReadFile(bot, chatId, filePath) {
    const content = await FileSystemService.readFile(filePath);
    bot.sendMessage(chatId, `📄 **Contingut de ${filePath}:**\n\`\`\`\n${content.substring(0, 3000)}\n\`\`\``, { parse_mode: 'Markdown' });
  }

  static async handleListFiles(bot, chatId, dirPath) {
    const files = await FileSystemService.listFiles(dirPath);
    bot.sendMessage(chatId, `📁 **Fitxers a ${dirPath}:**\n${files.join('\n')}`);
  }

  static async handleEditFile(bot, chatId, filePath, instructions) {
    bot.sendMessage(chatId, `🛠️ Analitzant fitxer per fer els canvis: \`${filePath}\`...`, { parse_mode: 'Markdown' });
    
    try {
      // 1. Read current content
      const currentContent = await FileSystemService.readFile(filePath);
      
      // 2. Use Gemini to apply changes
      const newContent = await AIEditorService.applyChanges(currentContent, instructions);
      
      // 3. Save the new content
      await FileSystemService.writeFile(filePath, newContent);
      
      bot.sendMessage(chatId, `✅ Canvis aplicats i fitxer guardat!\n\nVols que faci un commit amb aquests canvis?`);
    } catch (error) {
      bot.sendMessage(chatId, `❌ Error editant el fitxer: ${error.message}`);
    }
  }

  static async handleGit(bot, chatId, args) {
    bot.sendMessage(chatId, `🐙 Git: \`git ${args}\``, { parse_mode: 'Markdown' });
    const result = await TerminalService.git(args);
    const output = result.stdout || result.stderr || "(fet)";
    bot.sendMessage(chatId, `📤 **Sortida Git:**\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  }

  static async handleBrowser(bot, chatId, url, instruction) {
    bot.sendMessage(chatId, `🌐 Obrint navegador cap a: ${url}...\n📋 Instrucció: ${instruction}`);
    
    try {
      const result = await BrowserService.executeAction(url, instruction);
      
      if (result.success) {
        bot.sendMessage(chatId, `✅ He entrat a la web: **${result.title}**`, { parse_mode: 'Markdown' });
        
        // Send screenshot
        await bot.sendPhoto(chatId, result.screenshotPath, { caption: "Aquí tens el que veig ara mateix 👀" });
        
        // Clean up screenshot
        fs.unlinkSync(result.screenshotPath);
      }
    } catch (error) {
      bot.sendMessage(chatId, `❌ Error al navegador: ${error.message}`);
    }
  }
  static async handleSSH(bot, chatId, command) {
    if (!config.ssh.host) {
      return bot.sendMessage(chatId, "⚠️ No has configurat les dades SSH al .env o a Render.");
    }
    bot.sendMessage(chatId, `🚀 Executant via SSH a **${config.ssh.host}**:\n\`${command}\``, { parse_mode: 'Markdown' });
    
    try {
      const result = await SSHService.execute(command, config.ssh);
      const output = result.stdout || result.stderr || "(fet)";
      bot.sendMessage(chatId, `📤 **Sortida SSH:**\n\`\`\`\n${output.substring(0, 3000)}\n\`\`\``, { parse_mode: 'Markdown' });
    } catch (error) {
      bot.sendMessage(chatId, `❌ Error SSH: ${error.message}`);
    }
  }
}
