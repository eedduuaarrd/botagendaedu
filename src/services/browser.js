import puppeteer from 'puppeteer';
import fs from 'fs';

export class BrowserService {
  static async executeAction(url, instruction) {
    console.log(`Browser: Navigating to ${url} with instruction: ${instruction}`);
    
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      
      // Here we could use Gemini to decide what to do on the page based on 'instruction'
      // For now, let's just take a screenshot as proof of concept
      const screenshotPath = `screenshot_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
      
      await browser.close();
      return { 
        success: true, 
        screenshotPath, 
        title: await page.title() 
      };
    } catch (error) {
      console.error("Error in browser automation:", error);
      await browser.close();
      throw error;
    }
  }
}
