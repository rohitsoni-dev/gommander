import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

export interface ParseOptions {
  from?: 'node' | 'electron' | 'user' | 'eval' | 'pkg' | 'test';
}

export interface OutputConfiguration {
  writeOut?: (str: string) => void;
  writeErr?: (str: string) => void;
  getOutHelpWidth?: () => number | undefined;
  getErrHelpWidth?: () => number | undefined;
  getOutHasColors?: () => boolean;
  getErrHasColors?: () => boolean;
  outputError?: (str: string, write: (str: string) => void) => void;
  stripColor?: (str: string) => string;
}

export interface HelpConfiguration {
  sortSubcommands?: boolean;
  sortOptions?: boolean;
  helpWidth?: number;
  showGlobalOptions?: boolean;
  formatHelp?: (cmd: Command, helper: Help) => string;
  subcommandTerm?: (cmd: Command) => string;
  optionTerm?: (option: Option) => string;
  argumentTerm?: (argument: Argument) => string;
}

export interface ErrorConfiguration {
  showHelpAfterError?: boolean | string;
  showSuggestionAfterError?: boolean;
  exitOverride?: (err: CommanderError) => never | void;
  suggestionGenerator?: (unknownCommand: string, availableCommands: string[]) => string;
}

export interface StreamInterface {
  input: Readable;
  output: Writable;
  error: Writable;
  write(data: string): boolean;
  writeError(data: string): boolean;
  read(): Promise<string>;
  prompt(message?: string): Promise<string>;
  readonly isTTY: {
    input: boolean;
    output: boolean;
    error: boolean;
  };
  readonly dimensions: {
    output: { columns: number; rows: number } | null;
    error: { columns: number; rows: number } | null;
  };
  readonly hasColors: {
    output: boolean;
    error: boolean;
  };
}

export interface NodeJSInfo {
  scriptPath: string | null;
  userArgs: string[];
  rawArgs: string[];
  execPath: string;
  execArgv: string[];
  platform: string;
  arch: string;
  version: string;
  versions: NodeJS.ProcessVersions;
  env: NodeJS.ProcessEnv;
  cwd: string;
  pid: number;
  ppid: number;
  parseOptions: ParseOptions;
}

export interface DebuggingInfo {
  process: {
    pid: number;
    ppid: number;
    platform: string;
    arch: string;
    version: string;
    versions: NodeJS.ProcessVersions;
    execPath: string;
    execArgv: string[];
    argv: string[];
    cwd: string;
    uptime: number;
    hrtime: [number, number];
  };
  memory: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  resourceUsage: NodeJS.ResourceUsage | null;
  environment: Record<string, string>;
  features: {
    inspector: boolean;
    async_hooks: boolean;
    worker_threads: boolean;
    wasi: boolean;
  };
  debugging: {
    isDebugging: boolean;
    debugPort: number;
    hasInspector: boolean;
  };
}

export interface SpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'inherit' | 'pipe' | 'ignore';
  shell?: boolean;
  timeout?: number;
  killSignal?: NodeJS.Signals;
  windowsHide?: boolean;
  detached?: boolean;
  uid?: number;
  gid?: number;
  serialization?: 'json' | 'text';
  silent?: boolean;
  encoding?: BufferEncoding;
  maxBuffer?: number;
  async?: boolean;
  executableDir?: string;
  searchPath?: boolean;
}

export interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string | null;
  stderr: string | null;
  pid: number;
  spawnfile: string;
  spawnargs: string[];
  parsedOutput?: any;
  parseError?: string;
}

export interface VersionOptions {
  formatter?: (version: string, context: VersionContext) => string;
  validator?: (version: string) => boolean;
  source?: string;
  includeNodeVersion?: boolean;
  includePackageInfo?: boolean;
  includeBuildInfo?: boolean;
  customInfo?: Record<string, any>;
  exitCode?: number;
}

export interface VersionContext {
  node: DebuggingInfo;
  package: any;
  build: any;
  environment: any;
  runtime: any;
}

export interface EnvironmentVariableOptions {
  defaultValue?: any;
  type?: 'string' | 'number' | 'boolean' | 'json' | 'array';
  required?: boolean;
  transform?: (value: any) => any;
  validate?: (value: any) => boolean;
}

export interface ProfilingOptions {
  cpuProfile?: boolean;
  heapProfile?: boolean;
  outputDir?: string;
  prefix?: string;
}

export interface PerformanceMonitoringOptions {
  interval?: number;
  logMemory?: boolean;
  logCPU?: boolean;
  logEventLoop?: boolean;
  outputFile?: string | null;
}

export interface ParsingConfig {
  allowUnknownOption?: boolean;
  allowExcessArguments?: boolean;
  enablePositionalOptions?: boolean;
  passThroughOptions?: boolean;
  combineFlagAndOptionalValue?: boolean;
  storeOptionsAsProperties?: boolean;
  showHelpAfterError?: boolean | string;
  showSuggestionAfterError?: boolean;
}

export interface PlatformInfo {
  platform: string;
  arch: string;
  version: string;
  versions: NodeJS.ProcessVersions;
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
  isElectron: boolean;
  isPkg: boolean;
  isTest: boolean;
  isDebugging: boolean;
}

export class CommanderError extends Error {
  code: string;
  exitCode: number;
  nestedError?: string;
  
  constructor(exitCode: number, code: string, message: string);
  constructor(message: string);
}

export class InvalidArgumentError extends CommanderError {
  argument?: Argument;
  
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
  parseArg?: (value: string, previous?: any) => any;
  
  constructor(name: string, description?: string);
  
  name(): string;
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
  negate: boolean;
  optional: boolean;
  mandatory: boolean;
  envVar?: string;
  parseArg?: (value: string, previous?: any) => any;
  presetArg?: any;
  conflictsWith?: string[];
  impliesOptions?: string[];
  
  constructor(flags: string, description?: string);
  
  name(): string;
  attributeName(): string;
  is(arg: string): boolean;
  isBoolean(): boolean;
  default(value: any): this;
  preset(value: any): this;
  env(name: string): this;
  argParser<T>(fn: (value: string, previous: T) => T): this;
  makeOptionMandatory(mandatory?: boolean): this;
  hideHelp(hide?: boolean): this;
  conflicts(names: string | string[]): this;
  implies(names: string | string[]): this;
  choices(values: string[]): this;
  
  // Static factory methods
  static createBoolean(flags: string, description?: string): Option;
  static createNegatable(flags: string, description?: string): Option;
  static createVariadic(flags: string, description?: string): Option;
  static createChoice(flags: string, description?: string, choices?: string[]): Option;
  static createWithParser<T>(flags: string, description?: string, parser?: (value: string, previous: T) => T): Option;
  static createOptionalValue(flags: string, description?: string, defaultValue?: any): Option;
}

export class Help {
  helpWidth?: number;
  sortSubcommands: boolean;
  sortOptions: boolean;
  showGlobalOptions: boolean;
  
  constructor();
  
  configureHelp(configuration: HelpConfiguration): this;
  commandUsage(cmd: Command): string;
  commandDescription(cmd: Command): string;
  subcommandDescription(cmd: Command): string;
  optionDescription(option: Option): string;
  argumentDescription(argument: Argument): string;
  formatHelp(cmd: Command, helper: Help): string;
  wrap(str: string, width?: number, indent?: number): string;
  padWidth(cmd: Command, helper: Help): number;
  longestOptionTermLength(cmd: Command, helper: Help): number;
  longestSubcommandTermLength(cmd: Command, helper: Help): number;
  longestArgumentTermLength(cmd: Command, helper: Help): number;
}

export class Command extends EventEmitter {
  commands: Command[];
  options: Option[];
  parent: Command | null;
  registeredArguments: Argument[];
  args: any[];
  rawArgs: string[];
  processedArgs: any[];
  
  constructor(name?: string);
  
  // Configuration
  name(): string;
  name(str: string): this;
  description(): string;
  description(str: string, argsDescription?: Record<string, string>): this;
  summary(): string;
  summary(str: string): this;
  alias(alias: string): this;
  aliases(): string[];
  aliases(aliases: string[]): this;
  usage(): string;
  usage(str: string): this;
  nameFromFilename(filename: string): this;
  executableDir(): string;
  executableDir(path: string): this;
  
  // Options and arguments
  createOption(flags: string, description?: string): Option;
  option(flags: string, description?: string, parseArg?: ((value: string, previous?: any) => any) | RegExp, defaultValue?: any): this;
  requiredOption(flags: string, description?: string, parseArg?: ((value: string, previous?: any) => any) | RegExp, defaultValue?: any): this;
  addOption(option: Option): this;
  
  createArgument(name: string, description?: string): Argument;
  argument<T>(name: string, description?: string, parseArg?: (value: string, previous: T) => T, defaultValue?: T): this;
  arguments(names: string): this;
  addArgument(argument: Argument): this;
  
  // Enhanced option methods
  booleanOption(flags: string, description?: string, defaultValue?: boolean): this;
  negatableOption(flags: string, description?: string): this;
  variadicOption(flags: string, description?: string, defaultValue?: any[]): this;
  choiceOption(flags: string, description?: string, choices?: string[], defaultValue?: string): this;
  customOption(flags: string, description?: string, parser?: (value: string, previous?: any) => any, defaultValue?: any): this;
  envOption(flags: string, description?: string, envVar?: string, options?: EnvironmentVariableOptions): this;
  optionalValueOption(flags: string, description?: string, defaultValue?: any): this;
  
  // Commands
  createCommand(name?: string): Command;
  command(nameAndArgs: string, description?: string, opts?: { hidden?: boolean; isDefault?: boolean; executableFile?: string; noHelp?: boolean }): Command;
  addCommand(cmd: Command, opts?: { hidden?: boolean; isDefault?: boolean }): this;
  
  // Actions and lifecycle
  action(fn: (...args: any[]) => void | Promise<void>): this;
  asyncAction(fn: (...args: any[]) => Promise<void>): this;
  isAsyncAction(): boolean;
  hook(event: 'preAction' | 'postAction' | 'preSubcommand', listener: (thisCommand: Command, actionCommand: Command) => void | Promise<void>): this;
  addHook(event: 'preAction' | 'postAction' | 'preSubcommand', listener: (thisCommand: Command, actionCommand: Command) => void | Promise<void>): this;
  removeHook(event: 'preAction' | 'postAction' | 'preSubcommand'): this;
  getHooks(event?: 'preAction' | 'postAction' | 'preSubcommand'): any;
  hasHooks(event?: 'preAction' | 'postAction' | 'preSubcommand'): boolean;
  executeHooks(event: 'preAction' | 'postAction' | 'preSubcommand', actionCommand?: Command): Promise<void>;
  
  // Parsing
  parse(argv?: string[], options?: ParseOptions): this;
  parseAsync(argv?: string[], options?: ParseOptions): Promise<this>;
  
  // Configuration methods
  allowUnknownOption(allowUnknown?: boolean): this;
  allowExcessArguments(allowExcess?: boolean): this;
  enablePositionalOptions(positional?: boolean): this;
  passThroughOptions(passThrough?: boolean): this;
  storeOptionsAsProperties(storeAsProperties?: boolean): this;
  combineFlagAndOptionalValue(combine?: boolean): this;
  showHelpAfterError(displayHelp?: boolean | string): this;
  showSuggestionAfterError(displaySuggestion?: boolean): this;
  
  // Enhanced parsing configuration
  setPositionalOption(position: number, optionName: string): this;
  getPositionalOptions(): Map<number, string>;
  setUnknownOptionHandler(handler: (flag: string, value?: string) => void): this;
  setExcessArgumentHandler(handler: (args: string[]) => void): this;
  getParsingConfig(): ParsingConfig;
  setParsingConfig(config: Partial<ParsingConfig>): this;
  
  // Output and error configuration
  configureOutput(configuration?: OutputConfiguration): this | OutputConfiguration;
  configureHelp(configuration?: HelpConfiguration): this | HelpConfiguration;
  configureError(configuration?: ErrorConfiguration): this | ErrorConfiguration;
  setSuggestionGenerator(generator: (unknownCommand: string, availableCommands: string[]) => string): this;
  generateSuggestion(unknownCommand: string): string;
  
  // Stream methods
  writeOut(str: string): void;
  writeErr(str: string): void;
  outputError(str: string): void;
  
  // Help methods
  helpOption(): Option | null;
  helpOption(flags: string | boolean, description?: string): this;
  addHelpText(position: 'beforeAll' | 'before' | 'after' | 'afterAll', text: string | ((context: { error: boolean; command: Command }) => string)): this;
  helpCommand(): Command | null;
  helpCommand(enableOrNameAndArgs?: boolean | string, description?: string): this;
  addHelpCommand(helpCommand: Command | string, deprecatedDescription?: string): this;
  addHelpOption(option: Option): this;
  createHelp(): Help;
  help(options?: { error?: boolean }): void;
  outputHelp(options?: { error?: boolean }): void;
  helpInformation(): string;
  
  // Group management
  helpGroup(): string;
  helpGroup(heading: string): this;
  commandsGroup(): string;
  commandsGroup(heading: string): this;
  optionsGroup(): string;
  optionsGroup(heading: string): this;
  
  // Version methods
  version(): string;
  version(str: string, flags?: string, description?: string, options?: VersionOptions): this;
  versionFromPackage(flags?: string, description?: string, options?: VersionOptions): this;
  versionFromEnv(envVar: string, flags?: string, description?: string, options?: VersionOptions): this;
  setVersionFormatter(formatter: (version: string, context: VersionContext) => string): this;
  getVersionInfo(): { version: string; context: VersionContext; sources: Map<string, any> };
  
  // Option value management
  setOptionValue(key: string, value: any): this;
  setOptionValueWithSource(key: string, value: any, source?: string): this;
  getOptionValue(key: string): any;
  getOptionValueSource(key: string): string | undefined;
  getOptionValueSourceWithGlobals(key: string): string | undefined;
  opts(): { [key: string]: any };
  optsWithGlobals(): { [key: string]: any };
  
  // Error handling
  exitOverride(fn?: (err: CommanderError) => never | void): this;
  error(message: string, errorOptions?: { exitCode?: number; code?: string }): never;
  missingArgument(name: string): never;
  optionMissingArgument(option: Option): never;
  missingMandatoryOptionValue(option: Option): never;
  unknownOption(flag: string): never;
  unknownCommand(): never;
  
  // Node.js integration methods
  getNodeJSInfo(): NodeJSInfo;
  getDebuggingInfo(): DebuggingInfo;
  configureStreams(options?: Partial<StreamInterface>): this;
  getStreamInterface(): StreamInterface;
  
  // Environment variable methods
  envOptions(envVarMap: Record<string, { flags: string; description?: string } & EnvironmentVariableOptions>): this;
  loadEnvFile(filePath?: string, options?: { override?: boolean; encoding?: BufferEncoding; required?: boolean }): this;
  getEnvWithPrefix(prefix: string, options?: { stripPrefix?: boolean; transform?: (value: any) => any; type?: string }): Record<string, any>;
  setEnvVars(envVars: Record<string, any>, options?: EnvironmentVariableOptions): this;
  setEnv(name: string, value: any, options?: EnvironmentVariableOptions): this;
  getEnv(name: string, options?: EnvironmentVariableOptions): any;
  
  // Process management
  getSpawnedProcessInfo(): Array<{ pid: number; killed: boolean; exitCode: number | null; signalCode: NodeJS.Signals | null; spawnfile: string; spawnargs: string[]; connected: boolean }>;
  killSpawnedProcesses(signal?: NodeJS.Signals): this;
  exit(code?: number): never;
  
  // Platform detection
  isElectron(): boolean;
  isPkg(): boolean;
  isTest(): boolean;
  isDebugging(): boolean;
  getPlatformInfo(): PlatformInfo;
  
  // Debugging and profiling
  enableProfiling(options?: ProfilingOptions): this;
  enablePerformanceMonitoring(options?: PerformanceMonitoringOptions): this;
  hasDebuggingSupport(): { inspector: boolean; isDebugging: boolean; debugPort: number; hasAsyncHooks: boolean; hasWorkerThreads: boolean };
  enableDebugMode(options?: { verboseErrors?: boolean; stackTraces?: boolean; asyncStackTraces?: boolean; unhandledRejections?: boolean }): this;
  
  // Subcommand management
  setAsDefault(): this;
  setExecutable(executableFile?: string): this;
  getSubcommandInfo(): Promise<any>;
  findSubcommand(nameOrAlias: string): Command | undefined;
  getDefaultSubcommand(): Command | undefined;
  hasSubcommands(): boolean;
  getVisibleSubcommands(): Command[];
  isExecutableSubcommand(): boolean;
  
  // Utility methods
  copyInheritedSettings(sourceCommand: Command): this;
}

// Node.js Integration Classes
export class NodeJSIntegration extends EventEmitter {
  constructor();
  
  parseProcessArgv(argv?: string[] | null, options?: ParseOptions): NodeJSInfo;
  getEnvironmentVariable(name: string, options?: EnvironmentVariableOptions): any;
  setEnvironmentVariable(name: string, value: any, options?: EnvironmentVariableOptions): this;
  spawnExecutableSubcommand(executablePath: string, args?: string[], options?: SpawnOptions): Promise<SpawnResult> | SpawnResult;
  createStreamInterface(options?: Partial<StreamInterface>): StreamInterface;
  getDebuggingInfo(): DebuggingInfo;
  killAllSpawnedProcesses(signal?: NodeJS.Signals): void;
  getSpawnedProcessInfo(): Array<{ pid: number; killed: boolean; exitCode: number | null; signalCode: NodeJS.Signals | null; spawnfile: string; spawnargs: string[]; connected: boolean }>;
}

export class VersionSupport {
  constructor();
  
  createVersionOption(version: string, flags?: string, description?: string, options?: VersionOptions): { flags: string; description: string; action: () => void; version: string; options: VersionOptions };
  displayVersion(version: string, options?: VersionOptions): void;
  buildVersionContext(): VersionContext;
  formatVersionObject(versionData: Record<string, any>): string;
  getPackageInfo(): any;
  getBuildInfo(): any;
  getEnvironmentInfo(): any;
  getRuntimeInfo(): any;
  registerFormatter(name: string, formatter: (version: string, context: VersionContext) => string): this;
  registerValidator(name: string, validator: (version: string) => boolean): this;
  getFormatter(name: string): ((version: string, context: VersionContext) => string) | undefined;
  getValidator(name: string): ((version: string) => boolean) | undefined;
  validateSemVer(version: string): boolean;
  parseSemVer(version: string): { major: number; minor: number; patch: number; prerelease: string | null; build: string | null; raw: string };
  compareSemVer(version1: string, version2: string): number;
  getVersionFromEnv(envVar?: string, options?: EnvironmentVariableOptions): string | undefined;
  setVersionInEnv(version: string, envVar?: string, options?: EnvironmentVariableOptions): this;
  createVersionFromPackage(flags?: string, description?: string, options?: VersionOptions): { flags: string; description: string; action: () => void; version: string; options: VersionOptions };
  createVersionFromEnv(envVar: string, flags?: string, description?: string, options?: VersionOptions): { flags: string; description: string; action: () => void; version: string; options: VersionOptions };
  getVersionSources(): Map<string, any>;
  clearVersionSources(): this;
}

// Singleton instances
export const nodeJSIntegration: NodeJSIntegration;
export const versionSupport: VersionSupport;

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
  NodeJSIntegration: typeof NodeJSIntegration;
  VersionSupport: typeof VersionSupport;
  nodeJSIntegration: NodeJSIntegration;
  versionSupport: VersionSupport;
  program: Command;
  createCommand: typeof createCommand;
  createOption: typeof createOption;
  createArgument: typeof createArgument;
};

export default commander;