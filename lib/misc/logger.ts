/**
 * Setup the winston logger.
 *
 * Documentation: https://github.com/winstonjs/winston
 */

import {format, Logger} from 'winston';
import fs from "fs";
import path from "path";
import * as winston from 'winston';

export { Logger } from 'winston';

export enum LogLevel {
  error = 'error',
  warn = 'warn',
  info = 'info',
  http = 'http',
  verbose = 'verbose',
  debug = 'debug',
  silly = 'silly'
}

export interface ILoggingHandler {
  logger: Logger;
  setLogLevel(level: LogLevel): void;
}

export class LoggingHandler implements ILoggingHandler {
  private logging_root_dir: string | null;
  private logger_label: string;
  private level: LogLevel;
  private transports: any;
  public logger: Logger;

  constructor(logging_root_dir: string | null, logger_label: string = 'scheduler', level: LogLevel = LogLevel.info) {
    if (!logger_label) {
      console.error('logger_label must be a valid string');
      logger_label = 'dummy';
    }
    this.logging_root_dir = logging_root_dir;
    this.logger_label = logger_label;
    this.level = level;
    this.transports = {};
    this.logger = this.createLogger();
  }

  /**
   * Set the loglevel on all transports.
   *
   * @param level
   */
  public setLogLevel(level: LogLevel) {
    if (level) {
      this.level = level;
      for (let transport in this.transports) {
        this.transports[transport].level = level;
      }
    }
  }

  private createLogger(): Logger {
    const myFormat = winston.format.printf(({level, message, label, timestamp}) => {
      return `${timestamp} [${label}] ${level}: ${message}`;
    });

    let logger: Logger = winston.createLogger({
      level: this.level,
      format: winston.format.combine(
        winston.format.label({label: this.logger_label}),
        winston.format.timestamp(),
        myFormat
      ),
      defaultMeta: {service: this.logger_label},
      transports: []
    });

    if (this.logging_root_dir) {
      let logging_dir_created: boolean = false;
      if (!fs.existsSync(this.logging_root_dir)) {
        try {
          fs.mkdirSync(this.logging_root_dir, {recursive: true});
          logging_dir_created = true;
        } catch (err) {
          console.error('Cannot create logging root directory: ' + err.toString());
        }
      }

      if (logging_dir_created) {
        let error_logfile = path.join(this.logging_root_dir, `${this.logger_label}_error.log`);
        let combined_logfile = path.join(this.logging_root_dir, `${this.logger_label}_combined.log`);
        // Write to all logs with level `info` and below to `combined.log`
        // Write all logs error (and below) to `error.log`.
        this.transports.error_file = new winston.transports.File({filename: error_logfile, level: 'error'});
        this.transports.combined_file = new winston.transports.File({filename: combined_logfile});
        logger.add(this.transports.error_file);
        logger.add(this.transports.combined_file);
      }
    }

    this.transports.console = new winston.transports.Console({
      format: winston.format.combine(
        winston.format.label({label: this.logger_label}),
        format.colorize(),
        format.timestamp(),
        myFormat
      ),
    });

    logger.add(this.transports.console);

    return logger;
  }
}

export function getLogger(logging_root_dir: string | null, logger_label: string = 'scheduler', level: LogLevel = LogLevel.info): Logger {
  return (new LoggingHandler(logging_root_dir, logger_label, level)).logger;
}