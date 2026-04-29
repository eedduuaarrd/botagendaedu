import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export class TerminalService {
  /**
   * Executes a shell command and returns the output
   * @param {string} command 
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  static async execute(command) {
    try {
      console.log(`Executing command: ${command}`);
      const { stdout, stderr } = await execPromise(command, { timeout: 30000 }); // 30s timeout
      return { stdout, stderr };
    } catch (error) {
      console.error(`Error executing command: ${command}`, error);
      return { 
        stdout: error.stdout || '', 
        stderr: error.stderr || error.message,
        error: true 
      };
    }
  }

  /**
   * Specifically for Git operations to ensure they are run in the right context
   */
  static async git(args) {
    const command = `git ${args}`;
    return this.execute(command);
  }
}
