import fs from 'fs/promises';
import path from 'path';

export class FileSystemService {
  /**
   * Reads a file and returns its content
   */
  static async readFile(filePath) {
    try {
      const fullPath = path.resolve(filePath);
      return await fs.readFile(fullPath, 'utf8');
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Writes content to a file
   */
  static async writeFile(filePath, content) {
    try {
      const fullPath = path.resolve(filePath);
      await fs.writeFile(fullPath, content, 'utf8');
      return true;
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Lists files in a directory
   */
  static async listFiles(dirPath = '.') {
    try {
      const fullPath = path.resolve(dirPath);
      return await fs.readdir(fullPath);
    } catch (error) {
      console.error(`Error listing directory ${dirPath}:`, error);
      throw error;
    }
  }
}
