// Logger service for structured logging
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export class Logger {
  private logDir: string;
  private logLevel: LogLevel;
  private logFile: string;

  constructor(logDir: string = 'logs', logLevel: LogLevel = LogLevel.INFO) {
    this.logDir = logDir;
    this.logLevel = logLevel;
    this.logFile = path.join(this.logDir, `execution-${Date.now()}.log`);

    // Create log directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [${level}] ${message}`;
    if (data) {
      logMessage += ` ${JSON.stringify(data, null, 2)}`;
    }
    return logMessage;
  }

  private writeToFile(message: string): void {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formatted = this.formatMessage(LogLevel.DEBUG, message, data);
      console.log(formatted);
      this.writeToFile(formatted);
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const formatted = this.formatMessage(LogLevel.INFO, message, data);
      console.log(formatted);
      this.writeToFile(formatted);
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const formatted = this.formatMessage(LogLevel.WARN, message, data);
      console.warn(formatted);
      this.writeToFile(formatted);
    }
  }

  error(message: string, error?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorData = error instanceof Error ? error.message : error;
      const formatted = this.formatMessage(LogLevel.ERROR, message, errorData);
      console.error(formatted);
      this.writeToFile(formatted);
    }
  }

  getLogFile(): string {
    return this.logFile;
  }
}
