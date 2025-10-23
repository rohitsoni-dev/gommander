const { EventEmitter } = require('events');
const { wasmLoader } = require('./wasm-loader');
const { Option } = require('./option');
const { Argument } = require('./argument');
const { CommanderError, InvalidArgumentError } = require('./errors');
const { Help } = require('./help');
const { OptionProcessor, OptionGroup, OptionParsers } = require('./option-processor');

class Command extends EventEmitter {
    constructor(name) {
        super();
        // Core properties matching Commander.js
        this.commands = [];
        this.options = [];
        this.parent = null;
        this.registeredArguments = [];
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        
        // Internal options array for compatibility
        this._options = [];
        
        // Private properties for internal state
        this._name = name || '';
        this._description = '';
        this._summary = '';
        this._aliases = [];
        this._hidden = false;
        this._version = null;
        this._usage = '';
        this._argsDescription = undefined;
        
        // Action and execution properties
        this._action = null;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        
        // Configuration properties
        this._allowUnknownOption = false;
        this._allowExcessArguments = false;
        this._storeOptionsAsProperties = false;
        this._combineFlagAndOptionalValue = true;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        
        // Option values and sources
        this._optionValues = {};
        this._optionValueSources = {};
        
        // Legacy support
        this._argsDescription = undefined;
        
        // Help configuration
        this._helpOption = undefined;
        this._helpCommand = undefined;
        this._helpConfiguration = {};
        this._addImplicitHelpCommand = undefined;
        this._helpGroupHeading = undefined;
        this._defaultCommandGroup = undefined;
        this._defaultOptionGroup = undefined;
        
        // Lifecycle hooks
        this._lifeCycleHooks = {};
        
        // Exit callback
        this._exitCallback = null;
        
        // Output configuration
        this._outputConfiguration = {
            writeOut: (str) => process.stdout.write(str),
            writeErr: (str) => process.stderr.write(str),
            outputError: (str, write) => write(str),
            getOutHelpWidth: () => process.stdout.isTTY ? process.stdout.columns : undefined,
            getErrHelpWidth: () => process.stderr.isTTY ? process.stderr.columns : undefined,
            getOutHasColors: () => process.stdout.isTTY && process.stdout.hasColors?.(),
            getErrHasColors: () => process.stderr.isTTY && process.stderr.hasColors?.(),
            stripColor: (str) => str
        };
        
        // WASM-specific properties
        this._wasmCommandId = null;
        this._optionProcessor = new OptionProcessor();
        
        // State management for multiple parse calls
        this._savedState = null;
        this._scriptPath = null;

        // Initialize WASM if name is provided
        if (name) {
            this._initializeWASM();
        }
    }

    async _initializeWASM() {
        try {
            await wasmLoader.loadWASM();
            const wasmInterface = wasmLoader.getInterface();

            const result = wasmInterface.createCommand(this._name, this._description);
            if (result.error) {
                throw new Error(result.error);
            }

            this._wasmCommandId = result.id;
        } catch (error) {
            // Fallback to JavaScript-only mode for development
            console.warn('WASM not available, using JavaScript fallback:', error.message);
            this._wasmCommandId = `js_${Math.random().toString(36).substring(2, 11)}`;
        }
    }

    async _ensureWASM() {
        if (!this._wasmCommandId) {
            await this._initializeWASM();
        }
    }

    // Core API methods matching Commander.js

    name(str) {
        if (str === undefined) return this._name;
        this._name = str;
        return this;
    }

    description(str, argsDescription) {
        if (str === undefined && argsDescription === undefined) return this._description;
        this._description = str;
        if (argsDescription) {
            this._argsDescription = argsDescription;
        }
        return this;
    }

    summary(str) {
        if (str === undefined) return this._summary;
        this._summary = str;
        return this;
    }

    alias(alias) {
        if (alias === undefined) return this._aliases[0];
        this._aliases.push(alias);
        return this;
    }

    aliases(aliases) {
        if (aliases === undefined) return this._aliases;
        this._aliases = aliases.slice();
        return this;
    }

    usage(str) {
        if (str === undefined) return this._usage;
        this._usage = str;
        return this;
    }

    nameFromFilename(filename) {
        this._name = require('path').basename(filename, require('path').extname(filename));
        return this;
    }

    executableDir(path) {
        this._executableDir = path;
        return this;
    }

    helpOption(flags, description) {
        // Disable help option if false is passed
        if (flags === false) {
            this._helpOption = null;
            return this;
        }

        // Use defaults if not provided
        flags = flags !== undefined ? flags : '-h, --help';
        description = description !== undefined ? description : 'display help for command';

        this._helpOption = this.createOption(flags, description);
        return this;
    }

    addHelpText(position, text) {
        const allowedValues = ['beforeAll', 'before', 'after', 'afterAll'];
        if (!allowedValues.includes(position)) {
            throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        
        const helpEvent = `${position}Help`;
        this.on(helpEvent, () => {
            let helpStr = text;
            if (typeof text === 'function') {
                helpStr = text({ error: false, command: this });
            }
            if (helpStr) {
                console.log(helpStr);
            }
        });
        return this;
    }

    createOption(flags, description) {
        return new Option(flags, description);
    }

    option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
    }

    requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
    }

    _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === 'object' && flags instanceof Option) {
            throw new Error(
                'To add an Option object use addOption() instead of option() or requiredOption()'
            );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === 'function') {
            option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
            // deprecated
            const regex = fn;
            fn = (val, def) => {
                const m = regex.exec(val);
                return m ? m[0] : def;
            };
            option.default(defaultValue).argParser(fn);
        } else {
            option.default(fn);
        }

        return this.addOption(option);
    }

    addOption(option) {
        this._registerOption(option);

        const oname = option.name();
        const name = option.attributeName();

        // Store default value
        if (option.negate) {
            const positiveLongFlag = option.long.replace(/^--no-/, '--');
            if (!this._findOption(positiveLongFlag)) {
                this.setOptionValueWithSource(
                    name,
                    option.defaultValue === undefined ? true : option.defaultValue,
                    'default'
                );
            }
        } else if (option.defaultValue !== undefined) {
            this.setOptionValueWithSource(name, option.defaultValue, 'default');
        }

        // Handler for cli and env supplied values
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
            if (val == null && option.presetArg !== undefined) {
                val = option.presetArg;
            }

            const oldValue = this.getOptionValue(name);
            if (val !== null && option.parseArg) {
                val = this._callParseArg(option, val, oldValue, invalidValueMessage);
            } else if (val !== null && option.variadic) {
                val = option._collectValue(val, oldValue);
            }

            if (val == null) {
                if (option.negate) {
                    val = false;
                } else if (option.isBoolean() || option.optional) {
                    val = true;
                } else {
                    val = '';
                }
            }
            this.setOptionValueWithSource(name, val, valueSource);
        };

        this.on('option:' + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, 'cli');
        });

        if (option.envVar) {
            this.on('optionEnv:' + oname, (val) => {
                const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
                handleOptionValue(val, invalidValueMessage, 'env');
            });
        }

        // Add to legacy arrays
        this._options.push(option);
        this.options.push(option);
        this._optionProcessor.addOption(option);

        // Add to WASM if available
        this._addOptionToWASM(option);

        return this;
    }

    _registerOption(option) {
        const matchingOption =
            (option.short && this._findOption(option.short)) ||
            (option.long && this._findOption(option.long));
        if (matchingOption) {
            const matchingFlag =
                option.long && this._findOption(option.long)
                    ? option.long
                    : option.short;
            throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
    }

    createArgument(name, description) {
        return new Argument(name, description);
    }

    argument(name, description, parseArg, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof parseArg === 'function') {
            argument.default(defaultValue).argParser(parseArg);
        } else {
            argument.default(parseArg);
        }
        this.addArgument(argument);
        return this;
    }

    arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
            this.argument(detail);
        });
        return this;
    }

    addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument?.variadic) {
            throw new Error(
                `only the last argument can be variadic '${previousArgument.name()}'`
            );
        }
        if (
            argument.required &&
            argument.defaultValue !== undefined &&
            argument.parseArg === undefined
        ) {
            throw new Error(
                `a default value for a required argument is never used: '${argument.name()}'`
            );
        }
        this.registeredArguments.push(argument);

        // Add to WASM if available
        this._addArgumentToWASM(argument);

        return this;
    }

    command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === 'object' && desc !== null) {
            opts = desc;
            desc = null;
        }
        opts = opts || {};
        
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        
        if (desc) {
            cmd.description(desc);
            cmd._executableHandler = true;
        }
        
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);

        if (desc) return this;
        return cmd;
    }

    createCommand(name) {
        return new Command(name);
    }

    addCommand(cmd, opts) {
        if (!cmd._name) {
            throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }

        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;

        this._registerCommand(cmd);
        cmd.parent = this;
        return this;
    }

    _registerCommand(command) {
        const knownBy = (cmd) => {
            return [cmd.name()].concat(cmd.aliases());
        };

        const alreadyUsed = knownBy(command).find((name) =>
            this._findCommand(name)
        );
        if (alreadyUsed) {
            const existingCmd = knownBy(this._findCommand(alreadyUsed)).join('|');
            const newCmd = knownBy(command).join('|');
            throw new Error(
                `cannot add command '${newCmd}' as already have command '${existingCmd}'`
            );
        }

        this._initCommandGroup(command);
        this.commands.push(command);
    }

    copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        this._defaultCommandGroup = sourceCommand._defaultCommandGroup;
        this._defaultOptionGroup = sourceCommand._defaultOptionGroup;
        return this;
    }

    action(fn) {
        const listener = (args) => {
            const expectedArgsCount = this.registeredArguments.length;
            const actionArgs = args.slice(0, expectedArgsCount);
            if (this._storeOptionsAsProperties) {
                actionArgs[expectedArgsCount] = this;
            } else {
                actionArgs[expectedArgsCount] = this.opts();
            }
            actionArgs.push(this);

            return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        this._action = fn;
        return this;
    }

    // Configuration methods
    allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
    }

    allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
    }

    enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
    }

    passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        return this;
    }

    storeOptionsAsProperties(storeAsProperties = true) {
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
    }

    combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
    }

    showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== 'string') displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
    }

    showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
    }

    configureHelp(configuration) {
        if (configuration === undefined) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
    }

    configureOutput(configuration) {
        if (configuration === undefined) return this._outputConfiguration;
        this._outputConfiguration = { ...this._outputConfiguration, ...configuration };
        return this;
    }

    helpGroup(heading) {
        if (heading === undefined) return this._helpGroupHeading ?? '';
        this._helpGroupHeading = heading;
        return this;
    }

    commandsGroup(heading) {
        if (heading === undefined) return this._defaultCommandGroup ?? '';
        this._defaultCommandGroup = heading;
        return this;
    }

    optionsGroup(heading) {
        if (heading === undefined) return this._defaultOptionGroup ?? '';
        this._defaultOptionGroup = heading;
        return this;
    }

    _initCommandGroup(cmd) {
        if (this._defaultCommandGroup && !cmd.helpGroup()) {
            cmd.helpGroup(this._defaultCommandGroup);
        }
    }

    // Lifecycle hooks
    hook(event, listener) {
        const allowedValues = ['preSubcommand', 'preAction', 'postAction'];
        if (!allowedValues.includes(event)) {
            throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
            this._lifeCycleHooks[event].push(listener);
        } else {
            this._lifeCycleHooks[event] = [listener];
        }
        return this;
    }

    exitOverride(fn) {
        if (fn) {
            this._exitCallback = fn;
        } else {
            this._exitCallback = (err) => {
                if (err.code !== 'commander.executeSubCommandAsync') {
                    throw err;
                }
            };
        }
        return this;
    }

    version(str, flags, description) {
        if (str === undefined) return this._version;

        this._version = str;

        // Add version option
        const versionFlags = flags || '-V, --version';
        const versionDesc = description || 'display version number';

        this.option(versionFlags, versionDesc);

        return this;
    }

    // Option value management
    setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, undefined);
    }

    setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
            this[key] = value;
        } else {
            this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
    }

    getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
            return this[key];
        }
        return this._optionValues[key];
    }

    getOptionValueSource(key) {
        return this._optionValueSources[key];
    }

    getOptionValueSourceWithGlobals(key) {
        // global overwrites local, like optsWithGlobals
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
            if (cmd.getOptionValueSource(key) !== undefined) {
                source = cmd.getOptionValueSource(key);
            }
        });
        return source;
    }

    opts() {
        if (this._storeOptionsAsProperties) {
            const result = {};
            const len = this.options.length;

            for (let i = 0; i < len; i++) {
                const key = this.options[i].attributeName();
                result[key] = key === this._versionOptionName ? this._version : this[key];
            }
            return result;
        }

        return this._optionValues;
    }

    optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
            (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
            {}
        );
    }

    _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
            result.push(command);
        }
        return result;
    }

    // Enhanced option methods for different types

    booleanOption(flags, description, defaultValue = false) {
        const option = Option.createBoolean(flags, description);
        option.default(defaultValue);
        
        return this.addOption(option);
    }

    negatableOption(flags, description) {
        const option = Option.createNegatable(flags, description);
        
        return this.addOption(option);
    }

    variadicOption(flags, description, defaultValue = []) {
        const option = Option.createVariadic(flags, description);
        option.default(defaultValue);
        
        return this.addOption(option);
    }

    choiceOption(flags, description, choices, defaultValue) {
        const option = Option.createChoice(flags, description, choices);
        if (defaultValue !== undefined) {
            option.default(defaultValue);
        }
        
        return this.addOption(option);
    }

    customOption(flags, description, parser, defaultValue) {
        const option = Option.createWithParser(flags, description, parser);
        if (defaultValue !== undefined) {
            option.default(defaultValue);
        }
        
        return this.addOption(option);
    }

    envOption(flags, description, envVar, defaultValue) {
        const option = new Option(flags, description);
        option.env(envVar);
        if (defaultValue !== undefined) {
            option.default(defaultValue);
        }
        
        return this.addOption(option);
    }

    optionalValueOption(flags, description, defaultValue) {
        const option = Option.createOptionalValue(flags, description, defaultValue);
        
        return this.addOption(option);
    }

    // Option group management

    addOptionGroup(group) {
        this._optionProcessor.addOptionGroup(group);
        
        // Add all options from the group to the command
        for (const option of group.options) {
            this.addOption(option);
        }
        
        return this;
    }

    createOptionGroup(name, description) {
        return new OptionGroup(name, description);
    }

    parse(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
    }

    async parseAsync(argv, parseOptions) {
        this._prepareForParse();
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
    }

    _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);

        if (operands && this._findCommand(operands[0])) {
            return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }

        // Check for help command
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
            return this._dispatchHelpCommand(operands[1]);
        }

        if (this._defaultCommandName) {
            return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
        }

        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
            this.help({ error: true });
        }

        if (this._actionHandler) {
            this._processArguments();
            return this._actionHandler(this.processedArgs);
        }

        // Fallback to JavaScript parsing if WASM not available
        return this._parseWithJS(this.args);
    }

    _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });

        if (subCommand._executableHandler) {
            // Handle executable subcommands
            console.warn('Executable subcommands not yet implemented in GoCommander');
            return;
        } else {
            return subCommand._parseCommand(operands, unknown);
        }
    }

    _processArguments() {
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
            let value = declaredArg.defaultValue;
            if (declaredArg.variadic) {
                if (index < this.args.length) {
                    value = this.args.slice(index);
                    if (declaredArg.parseArg) {
                        value = value.reduce((processed, v) => {
                            return this._callParseArg(declaredArg, v, processed, 
                                `error: command-argument value '${v}' is invalid for argument '${declaredArg.name()}'.`);
                        }, declaredArg.defaultValue);
                    }
                } else if (value === undefined) {
                    value = [];
                }
            } else if (index < this.args.length) {
                value = this.args[index];
                if (declaredArg.parseArg) {
                    value = this._callParseArg(declaredArg, value, declaredArg.defaultValue,
                        `error: command-argument value '${value}' is invalid for argument '${declaredArg.name()}'.`);
                }
            }
            processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
    }

    parseOptions(args) {
        const operands = [];
        const unknown = [];
        let dest = operands;

        function maybeOption(arg) {
            return arg.length > 1 && arg[0] === '-';
        }

        let i = 0;
        while (i < args.length) {
            const arg = args[i++];

            if (arg === '--') {
                if (dest === unknown) dest.push(arg);
                dest.push(...args.slice(i));
                break;
            }

            if (maybeOption(arg)) {
                const option = this._findOption(arg);
                if (option) {
                    if (option.required) {
                        const value = args[i++];
                        if (value === undefined) this.optionMissingArgument(option);
                        this.emit(`option:${option.name()}`, value);
                    } else if (option.optional) {
                        let value = null;
                        if (i < args.length && !maybeOption(args[i])) {
                            value = args[i++];
                        }
                        this.emit(`option:${option.name()}`, value);
                    } else {
                        this.emit(`option:${option.name()}`);
                    }
                    continue;
                }
            }

            if (dest === operands && maybeOption(arg) && !(this.commands.length === 0)) {
                dest = unknown;
            }

            dest.push(arg);
        }

        return { operands, unknown };
    }

    // Helper methods

    async _addOptionToWASM(option) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.addOption(
                this._wasmCommandId,
                option.flags,
                option.description,
                option.defaultValue,
                option.required
            );

            if (result.error) {
                console.warn('Failed to add option to WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error adding option to WASM:', error.message);
        }
    }

    async _addArgumentToWASM(argument) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.addArgument(
                this._wasmCommandId,
                argument.name,
                argument.description,
                argument.required
            );

            if (result.error) {
                console.warn('Failed to add argument to WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error adding argument to WASM:', error.message);
        }
    }

    async _parseWithWASM(argv) {
        const wasmInterface = wasmLoader.getInterface();
        const result = wasmInterface.parseArguments(this._wasmCommandId, argv);

        if (result.error) {
            throw new CommanderError(result.error);
        }

        // Execute action if available
        if (this._action) {
            await this._action(result.arguments, result.options);
        }

        return result;
    }

    _parseWithJS(argv) {
        // Enhanced JavaScript implementation using OptionProcessor
        const args = [];
        
        try {
            // Reset option processor for fresh parsing
            this._optionProcessor = new OptionProcessor();
            
            // Add all options to the processor with enhanced features
            for (const option of this.options) {
                this._optionProcessor.addOption(option);
                
                // Set up environment variable handling
                if (option.envVar && process.env[option.envVar]) {
                    const envValue = process.env[option.envVar];
                    // Process environment value through option parser if available
                    try {
                        const processedEnvValue = option.parseArg ? 
                            option.parseArg(envValue, option.defaultValue) : envValue;
                        this.setOptionValueWithSource(option.attributeName(), processedEnvValue, 'env');
                    } catch (error) {
                        throw new CommanderError(`Invalid environment variable value for ${option.flags}: ${error.message}`);
                    }
                }
                
                // Initialize default values
                const key = option.attributeName();
                if (option.defaultValue !== undefined && this.getOptionValue(key) === undefined) {
                    this.setOptionValueWithSource(key, option.defaultValue, 'default');
                }
            }

            // Parse arguments and options with enhanced processing
            for (let i = 0; i < argv.length; i++) {
                const arg = argv[i];

                if (arg.startsWith('-')) {
                    // Handle options with enhanced processing
                    const option = this._findOptionByFlag(arg);
                    
                    if (option) {
                        const flagName = this._extractFlagName(arg);
                        
                        if (option.requiresValue && !option.optionalValue) {
                            // Option requires a value
                            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                                this._processOptionWithEnhancements(flagName, argv[++i], option);
                            } else {
                                throw new CommanderError(`Option ${arg} requires a value`);
                            }
                        } else if (option.optionalValue && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                            // Option has optional value and next arg is not a flag
                            this._processOptionWithEnhancements(flagName, argv[++i], option);
                        } else if (option.optionalValue) {
                            // Optional value not provided, use preset or default
                            const presetValue = option.presetArg !== undefined ? option.presetArg : 
                                               (option.isBoolean() ? true : option.defaultValue);
                            this._processOptionWithEnhancements(flagName, presetValue, option);
                        } else {
                            // Boolean option - handle negation properly
                            const isNegated = option.negate && arg.includes('no-');
                            const value = isNegated ? false : true;
                            this._processOptionWithEnhancements(flagName, value, option);
                        }
                    } else if (!this._allowUnknownOption) {
                        throw new CommanderError(`Unknown option: ${arg}`);
                    } else {
                        // Store unknown option if allowed
                        args.push(arg);
                        if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                            args.push(argv[++i]);
                        }
                    }
                } else {
                    args.push(arg);
                }
            }

            // Enhanced validation with option groups and custom validators
            this._optionProcessor.validate();
            this._validateOptionConstraints();

            // Get processed options with environment variable fallback
            const processedOptions = this._optionProcessor.getValues();
            
            // Create final options object with proper precedence
            const options = this._buildFinalOptionsObject(processedOptions);

            // Execute action if available
            if (this._action) {
                this._action(args, options);
            }

            return { options, arguments: args };
        } catch (error) {
            if (error instanceof CommanderError) {
                throw error;
            }
            throw new CommanderError(error.message);
        }
    }

    // Utility methods
    _findCommand(name) {
        if (!name) return undefined;
        return this.commands.find(
            (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
    }

    _findOption(arg) {
        return this.options.find((option) => option.is(arg));
    }

    _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
            return target.parseArg(value, previous);
        } catch (err) {
            if (err.code === 'commander.invalidArgument') {
                const message = `${invalidArgumentMessage} ${err.message}`;
                this.error(message, { exitCode: err.exitCode, code: err.code });
            }
            throw err;
        }
    }

    // State management for multiple parse calls
    saveStateBeforeParse() {
        this._savedState = {
            _name: this._name,
            _optionValues: { ...this._optionValues },
            _optionValueSources: { ...this._optionValueSources }
        };
    }

    restoreStateBeforeParse() {
        if (this._storeOptionsAsProperties) {
            throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
        }

        this._name = this._savedState._name;
        this._scriptPath = null;
        this.rawArgs = [];
        this._optionValues = { ...this._savedState._optionValues };
        this._optionValueSources = { ...this._savedState._optionValueSources };
        this.args = [];
        this.processedArgs = [];
    }

    _prepareForParse() {
        if (this._savedState === null) {
            this.saveStateBeforeParse();
        } else {
            this.restoreStateBeforeParse();
        }
    }

    _prepareUserArgs(argv, parseOptions) {
        if (argv !== undefined && !Array.isArray(argv)) {
            throw new Error('first parameter to parse must be array or undefined');
        }
        parseOptions = parseOptions || {};

        if (argv === undefined && parseOptions.from === undefined) {
            if (process.versions?.electron) {
                parseOptions.from = 'electron';
            }
        }

        if (argv === undefined) {
            argv = process.argv;
        }
        this.rawArgs = argv.slice();

        let userArgs;
        switch (parseOptions.from) {
            case undefined:
            case 'node':
                this._scriptPath = argv[1];
                userArgs = argv.slice(2);
                break;
            case 'electron':
                if (process.defaultApp) {
                    this._scriptPath = argv[1];
                    userArgs = argv.slice(2);
                } else {
                    userArgs = argv.slice(1);
                }
                break;
            case 'user':
                userArgs = argv.slice(0);
                break;
            case 'eval':
                userArgs = argv.slice(1);
                break;
            default:
                throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
        }

        if (!this._name && this._scriptPath) {
            this.nameFromFilename(this._scriptPath);
        }
        this._name = this._name || 'program';

        return userArgs;
    }

    // Help methods
    createHelp() {
        return Object.assign(new Help(), this.configureHelp());
    }

    helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === 'boolean') {
            this._addImplicitHelpCommand = enableOrNameAndArgs;
            if (enableOrNameAndArgs && this._defaultCommandGroup) {
                // make the command to store the group
                this._initCommandGroup(this._getHelpCommand());
            }
            return this;
        }

        const nameAndArgs = enableOrNameAndArgs ?? 'help [command]';
        const [, helpName, helpArgs] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? 'display help for command';

        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);

        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;

        // init group unless lazy create
        if (enableOrNameAndArgs || description) this._initCommandGroup(helpCommand);

        return this;
    }

    addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== 'object') {
            this.helpCommand(helpCommand, deprecatedDescription);
            return this;
        }

        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        this._initCommandGroup(helpCommand);
        return this;
    }

    addHelpOption(option) {
        this._helpOption = option;
        this._initOptionGroup(option);
        return this;
    }

    _initOptionGroup(option) {
        if (this._defaultOptionGroup && !option.helpGroupHeading) {
            option.helpGroup(this._defaultOptionGroup);
        }
    }

    _getHelpCommand() {
        const hasImplicitHelpCommand =
            this._addImplicitHelpCommand ??
            (this.commands.length &&
                !this._actionHandler &&
                !this._findCommand('help'));

        if (hasImplicitHelpCommand) {
            if (this._helpCommand === undefined) {
                this.helpCommand(undefined, undefined); // use default name and description
            }
            return this._helpCommand;
        }
        return null;
    }

    _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
            this.help();
            return;
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand) {
            subCommand.help();
        } else {
            this.unknownCommand();
        }
    }

    help(options = {}) {
        const helper = this.createHelp();
        const helpWidth = helper.padWidth(this, helper);
        const helpInformation = helper.formatHelp(this, helper);
        
        if (options.error) {
            this._outputConfiguration.writeErr(helpInformation);
            this._exit(1, 'commander.help', '(outputHelp)');
        } else {
            this._outputConfiguration.writeOut(helpInformation);
        }
    }

    outputHelp(options) {
        this.help(options);
    }

    helpInformation() {
        const helper = this.createHelp();
        return helper.formatHelp(this, helper);
    }

    // Error handling methods
    error(message, errorOptions = {}) {
        this._outputConfiguration.outputError(`${message}\n`, this._outputConfiguration.writeErr);
        if (typeof this._showHelpAfterError === 'string') {
            this._outputConfiguration.writeErr(`${this._showHelpAfterError}\n`);
        } else if (this._showHelpAfterError) {
            this._outputConfiguration.writeErr('\n');
            this.outputHelp({ error: true });
        }
        
        const config = errorOptions.exitCode !== undefined ? errorOptions : { exitCode: 1 };
        this._exit(config.exitCode, config.code || 'commander.error', message);
    }

    _exit(exitCode, code, message) {
        if (this._exitCallback) {
            this._exitCallback(new CommanderError(exitCode, code, message));
            return;
        }
        process.exit(exitCode);
    }

    missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: 'commander.missingArgument' });
    }

    optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: 'commander.optionMissingArgument' });
    }

    missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: 'commander.missingMandatoryOptionValue' });
    }

    unknownOption(flag) {
        if (this._showSuggestionAfterError) {
            // Add suggestion logic here if needed
        }
        const message = `error: unknown option '${flag}'`;
        this.error(message, { code: 'commander.unknownOption' });
    }

    unknownCommand() {
        const unknownName = this.args[0];
        let message = `error: unknown command '${unknownName}'`;
        
        if (this._showSuggestionAfterError) {
            // Add suggestion logic here if needed
        }
        
        this.error(message, { code: 'commander.unknownCommand' });
    }

    _conflictingOption(option, conflictingOption) {
        const message = `error: option '${option.flags}' cannot be used with option '${conflictingOption.flags}'`;
        this.error(message, { code: 'commander.conflictingOption' });
    }

    _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;

        const expected = this.registeredArguments.length;
        const s = expected === 1 ? '' : 's';
        const forSubcommand = this.parent ? ` for '${this.name()}'` : '';
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: 'commander.excessArguments' });
    }

    // Enhanced option processing helper methods

    /**
     * Process an option with enhanced features including preprocessing and postprocessing
     * @private
     */
    _processOptionWithEnhancements(flagName, value, option) {
        try {
            // Handle variadic options specially
            if (option.variadic) {
                const currentValue = this.getOptionValue(option.attributeName());
                const newValue = option._collectValue(value, currentValue);
                this.setOptionValueWithSource(option.attributeName(), newValue, 'cli');
                this._optionProcessor.processOption(flagName, value);
            } else {
                // Process through option processor for validation and parsing
                this._optionProcessor.processOption(flagName, value);
                
                // Also update command's internal state
                const processedValue = option.parseArg ? 
                    option.parseArg(value, this.getOptionValue(option.attributeName())) : value;
                this.setOptionValueWithSource(option.attributeName(), processedValue, 'cli');
            }
        } catch (error) {
            throw new CommanderError(`Error processing option ${flagName}: ${error.message}`);
        }
    }

    /**
     * Extract clean flag name from argument
     * @private
     */
    _extractFlagName(arg) {
        if (arg.startsWith('--')) {
            return arg.substring(2);
        } else if (arg.startsWith('-')) {
            return arg.substring(1);
        }
        return arg;
    }

    /**
     * Find option by flag name (with proper matching)
     * @private
     */
    _findOptionByFlag(flag) {
        const cleanFlag = this._extractFlagName(flag);
        
        for (const option of this.options) {
            // Check if option matches the flag
            if (option.is(flag) || 
                option.long === `--${cleanFlag}` || 
                option.short === `-${cleanFlag}` ||
                (option.long && option.long.replace(/^--/, '') === cleanFlag) ||
                (option.short && option.short.replace(/^-/, '') === cleanFlag)) {
                return option;
            }
        }
        return null;
    }

    /**
     * Validate option constraints including conflicts and implications
     * @private
     */
    _validateOptionConstraints() {
        // Check for conflicting options
        for (const option of this.options) {
            const key = option.attributeName();
            const isSet = this.getOptionValue(key) !== undefined && 
                         this.getOptionValueSource(key) !== 'default';
            
            if (isSet && option.conflictsWith && option.conflictsWith.length > 0) {
                for (const conflictFlag of option.conflictsWith) {
                    const conflictOption = this._findOption(`--${conflictFlag}`) || this._findOption(`-${conflictFlag}`);
                    if (conflictOption) {
                        const conflictKey = conflictOption.attributeName();
                        const conflictIsSet = this.getOptionValue(conflictKey) !== undefined && 
                                            this.getOptionValueSource(conflictKey) !== 'default';
                        if (conflictIsSet) {
                            throw new CommanderError(`Option ${option.flags} cannot be used with option ${conflictOption.flags}`);
                        }
                    }
                }
            }
            
            // Handle option implications
            if (isSet && option.impliesOptions && option.impliesOptions.length > 0) {
                for (const impliedFlag of option.impliesOptions) {
                    const impliedOption = this._findOption(`--${impliedFlag}`) || this._findOption(`-${impliedFlag}`);
                    if (impliedOption) {
                        const impliedKey = impliedOption.attributeName();
                        if (this.getOptionValue(impliedKey) === undefined) {
                            const impliedValue = impliedOption.defaultValue !== undefined ? 
                                               impliedOption.defaultValue : true;
                            this.setOptionValueWithSource(impliedKey, impliedValue, 'implied');
                        }
                    }
                }
            }
        }
    }

    /**
     * Build final options object with proper precedence handling
     * @private
     */
    _buildFinalOptionsObject(processedOptions) {
        const options = {};
        
        for (const option of this.options) {
            const key = option.attributeName();
            
            // Precedence order: CLI > Environment > Default
            let value = this.getOptionValue(key);
            const source = this.getOptionValueSource(key);
            
            // If no value set through command, check processed options
            if (value === undefined) {
                value = processedOptions[key] || processedOptions[option.long] || processedOptions[option.short];
            }
            
            // Handle environment variables with proper precedence
            if (value === undefined && option.envVar && process.env[option.envVar]) {
                try {
                    value = option.parseArg ? 
                        option.parseArg(process.env[option.envVar], option.defaultValue) : 
                        process.env[option.envVar];
                } catch (error) {
                    throw new CommanderError(`Invalid environment variable value for ${option.flags}: ${error.message}`);
                }
            }
            
            // Fall back to default value
            if (value === undefined && option.defaultValue !== undefined) {
                value = option.defaultValue;
            }
            
            options[key] = value;
        }
        
        return options;
    }

    /**
     * Enhanced option group management
     */
    addOptionGroup(group) {
        if (!group || typeof group.name !== 'string') {
            throw new Error('Option group must have a name');
        }
        
        this._optionProcessor.addOptionGroup(group);
        
        // Add all options from the group to the command
        for (const option of group.options) {
            this.addOption(option);
        }
        
        return this;
    }

    /**
     * Create a new option group
     */
    createOptionGroup(name, description) {
        return new OptionGroup(name, description);
    }

    /**
     * Add preprocessing for an option
     */
    addOptionPreprocessor(optionKey, preprocessor) {
        this._optionProcessor.addPreprocessor(optionKey, preprocessor);
        return this;
    }

    /**
     * Add postprocessing for an option
     */
    addOptionPostprocessor(optionKey, postprocessor) {
        this._optionProcessor.addPostprocessor(optionKey, postprocessor);
        return this;
    }

    /**
     * Add custom validation for all options
     */
    addCustomOptionValidator(validator) {
        this._optionProcessor.addCustomValidator(validator);
        return this;
    }

    /**
     * Enhanced environment variable option creation
     */
    envOption(flags, description, envVar, defaultValue) {
        const option = new Option(flags, description);
        option.env(envVar);
        if (defaultValue !== undefined) {
            option.default(defaultValue);
        }
        
        return this.addOption(option);
    }

    /**
     * Create option with advanced validation
     */
    validatedOption(flags, description, validator, defaultValue) {
        const option = new Option(flags, description);
        
        // Create a parser that includes validation
        const validatingParser = (value, previous) => {
            const result = validator(value, previous);
            if (result === false || (typeof result === 'object' && result.valid === false)) {
                const message = typeof result === 'object' ? result.message : `Invalid value: ${value}`;
                throw new Error(message);
            }
            return typeof result === 'object' ? result.value : value;
        };
        
        option.argParser(validatingParser);
        
        if (defaultValue !== undefined) {
            option.default(defaultValue);
        }
        
        return this.addOption(option);
    }

    /**
     * Create option that conflicts with other options
     */
    conflictingOption(flags, description, conflictsWith, defaultValue) {
        const option = new Option(flags, description);
        option.conflicts(Array.isArray(conflictsWith) ? conflictsWith : [conflictsWith]);
        
        if (defaultValue !== undefined) {
            option.default(defaultValue);
        }
        
        return this.addOption(option);
    }

    /**
     * Create option that implies other options
     */
    implyingOption(flags, description, implies, defaultValue) {
        const option = new Option(flags, description);
        option.implies(Array.isArray(implies) ? implies : [implies]);
        
        if (defaultValue !== undefined) {
            option.default(defaultValue);
        }
        
        return this.addOption(option);
    }

    // Additional utility methods for enhanced compatibility

    _getHelpOption() {
        // Lazy create help option if not explicitly disabled
        if (this._helpOption === undefined) {
            this._helpOption = this.createOption('-h, --help', 'display help for command');
        }
        return this._helpOption;
    }

    _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
            this.outputHelp();
            // (Do not have all displayed text available so only passing placeholder.)
            this._exit(0, 'commander.helpDisplayed', '(outputHelp)');
        }
    }

    _checkForMissingMandatoryOptions() {
        // Walk up hierarchy so can call in subcommand after checking for displaying help.
        this._getCommandAndAncestors().forEach((cmd) => {
            cmd.options.forEach((anOption) => {
                if (
                    anOption.mandatory &&
                    cmd.getOptionValue(anOption.attributeName()) === undefined
                ) {
                    cmd.missingMandatoryOptionValue(anOption);
                }
            });
        });
    }

    _checkForConflictingOptions() {
        // Walk up hierarchy so can call in subcommand after checking for displaying help.
        this._getCommandAndAncestors().forEach((cmd) => {
            cmd._checkForConflictingLocalOptions();
        });
    }

    _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === undefined) {
                return false;
            }
            return this.getOptionValueSource(optionKey) !== 'default';
        });

        definedNonDefaultOptions.forEach((option) => {
            option.conflictsWith.forEach((conflictingOptionFlag) => {
                const conflictingOption = this._findOption(conflictingOptionFlag);
                if (
                    conflictingOption &&
                    this.getOptionValue(conflictingOption.attributeName()) !== undefined
                ) {
                    this._conflictingOption(option, conflictingOption);
                }
            });
        });
    }
}

// Export OptionParsers for convenience
Command.OptionParsers = OptionParsers;

module.exports = { Command };