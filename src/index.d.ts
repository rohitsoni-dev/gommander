import { EventEmitter } from 'events';

export interface ParseOptions {
  from?: 'node' | 'electron' | 'user';
}

export interface OutputConfiguration {
  writeOut?: (str: string) => void;
  writeErr?: (str: string) => void;
  getOutHelpWidth?: () => number;
  getErrHelpWidth?: () => number;
  outputError?: (str: string, write: (str: string) => void) => void;
}

export interface HelpConfiguration {
  sortSubcommands?: boolean;
  sortOptions?: boolean;
  helpWidth?: number;
}

export class CommanderError extends Error {
  code: string;
  exitCode: number;
  nestedError?: string;
  
  constructor(exitCode: number, code: string, message: string);
}

export class InvalidArgumentError extends CommanderError {
  constructor(message: string);
}

export class InvalidOptionArgumentError extends CommanderError {
  option: Option;
  
  constructor(message: string, option: Option);
}

export class Argument {
  description: string;
  required: boolean;
  variadic: boolean;
  defaultValue?: any;
  choices?: string[];
  
  constructor(name: string, description?: string);
  
  default(value: any): this;
  argParser<T>(fn: (value: string, previous: T) => T): this;
  choices(values: string[]): this;
  argRequired(): this;
  argOptional(): this;
}

export class Option {
  flags: string;
  description: string;
  required: boolean;
  variadic: boolean;
  defaultValue?: any;
  choices?: string[];
  hidden: boolean;
  short?: string;
  long?: string;
  
  constructor(flags: string, description?: string);
  
  default(value: any): this;
  preset(value: any): this;
  env(name: string): this;
  argParser<T>(fn: (value: string, previous: T) => T): this;
  makeOptionMandatory(mandatory?: boolean): this;
  hideHelp(hide?: boolean): this;
  conflicts(names: string | string[]): this;
  implies(names: string | string[]): this;
  choices(values: string[]): this;
}

export class Help {
  helpWidth?: number;
  sortSubcommands: boolean;
  sortOptions: boolean;
  
  constructor();
  
  configureHelp(configuration: HelpConfiguration): this;
  commandUsage(cmd: Command): string;
  commandDescription(cmd: Command): string;
  subcommandDescription(cmd: Command): string;
  optionDescription(option: Option): string;
  argumentDescription(argument: Argument): string;
  formatHelp(cmd: Command, helper: Help): string;
  wrap(str: string, width?: number, indent?: number): string;
}

export class Command extends EventEmitter {
  constructor(name?: string);
  
  // Configuration
  name(): string;
  name(str: string): this;
  description(): string;
  description(str: string): this;
  alias(alias: string): this;
  aliases(): string[];
  aliases(aliases: string[]): this;
  usage(): string;
  usage(str: string): this;
  
  // Options and arguments
  option(flags: string, description?: string, defaultValue?: any): this;
  requiredOption(flags: string, description?: string, defaultValue?: any): this;
  argument<T>(name: string, description?: string): this;
  
  // Commands
  command(nameAndArgs: string, description?: string, opts?: { hidden?: boolean; isDefault?: boolean }): Command;
  addCommand(cmd: Command): this;
  
  // Actions
  action(fn: (...args: any[]) => void | Promise<void>): this;
  
  // Parsing
  parse(argv?: string[], options?: ParseOptions): this;
  parseAsync(argv?: string[], options?: ParseOptions): Promise<this>;
  
  // Version
  version(): string;
  version(str: string, flags?: string, description?: string): this;
  
  // Help
  outputHelp(): void;
  helpInformation(): string;
  
  // Configuration methods
  configureOutput(configuration: OutputConfiguration): this;
  configureHelp(configuration: HelpConfiguration): this;
  
  // Utility methods
  opts(): { [key: string]: any };
  args: any[];
}

// Factory functions
export function createCommand(name?: string): Command;
export function createOption(flags: string, description?: string): Option;
export function createArgument(name: string, description?: string): Argument;

// Main program instance
export const program: Command;

// Default export for compatibility
declare const commander: {
  Command: typeof Command;
  Option: typeof Option;
  Argument: typeof Argument;
  CommanderError: typeof CommanderError;
  InvalidArgumentError: typeof InvalidArgumentError;
  InvalidOptionArgumentError: typeof InvalidOptionArgumentError;
  Help: typeof Help;
  program: Command;
  createCommand: typeof createCommand;
  createOption: typeof createOption;
  createArgument: typeof createArgument;
};

export default commander;