const { EventEmitter } = require('events');
const { wasmLoader } = require('./wasm-loader');
const { Option } = require('./option');
const { Argument } = require('./argument');
const { CommanderError, InvalidArgumentError } = require('./errors');
const { Help } = require('./help');
const { OptionProcessor, OptionGroup, OptionParsers } = require('./option-processor');
const { nodeJSIntegration } = require('./nodejs-integration');
const { versionSupport } = require('./version-support');

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
        this._lifeCycleHooks = {
            preAction: [],
            postAction: [],
            preSubcommand: []
        };
        
        // Exit callback
        this._exitCallback = null;
        
        // Output configuration with Node.js stream integration
        this._streamInterface = nodeJSIntegration.createStreamInterface();
        this._outputConfiguration = {
            writeOut: (str) => this._streamInterface.write(str),
            writeErr: (str) => this._streamInterface.writeError(str),
            outputError: (str, write) => write(str),
            getOutHelpWidth: () => this._streamInterface.dimensions.output?.columns,
            getErrHelpWidth: () => this._streamInterface.dimensions.error?.columns,
            getOutHasColors: () => this._streamInterface.hasColors.output,
            getErrHasColors: () => this._streamInterface.hasColors.error,
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
        this._addAliasToWASM(alias);
        return this;
    }

    aliases(aliases) {
        if (aliases === undefined) return this._aliases;
        this._aliases = aliases.slice();
        this._setAliasesInWASM(aliases);
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
        // Check if this exact option is already added
        const existingIndex = this.options.findIndex(existing => existing === option);
        if (existingIndex !== -1) {
            // Option already exists, just return
            return this;
        }
        
        // Check if an option with the same flags already exists
        const existingByFlags = this.options.find(existing => 
            existing.flags === option.flags || 
            (existing.long && option.long && existing.long === option.long) ||
            (existing.short && option.short && existing.short === option.short)
        );
        
        if (existingByFlags) {
            // Replace the existing option with the new one
            const index = this.options.indexOf(existingByFlags);
            this.options[index] = option;
            this._options[index] = option;
            
            // Update option processor
            this._optionProcessor = new (require('./option-processor').OptionProcessor)();
            for (const opt of this.options) {
                this._optionProcessor.addOption(opt);
            }
            
            return this;
        }
        
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

        // Handler for cli and env supplied values with enhanced precedence
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
            // Check precedence: CLI > Environment > Default
            const currentSource = this.getOptionValueSource(name);
            
            // Don't override CLI values with environment values
            if (valueSource === 'env' && currentSource === 'cli') {
                return;
            }
            
            // Don't override CLI or env values with defaults
            if (valueSource === 'default' && (currentSource === 'cli' || currentSource === 'env')) {
                return;
            }

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

        // Enhanced environment variable handling
        if (option.envVar) {
            // Check environment variable immediately and set if present
            if (process.env[option.envVar] !== undefined) {
                const envValue = process.env[option.envVar];
                const invalidValueMessage = `error: option '${option.flags}' value '${envValue}' from env '${option.envVar}' is invalid.`;
                
                try {
                    handleOptionValue(envValue, invalidValueMessage, 'env');
                } catch (error) {
                    // Store the error but don't throw immediately - let validation handle it
                    this._envVarErrors = this._envVarErrors || [];
                    this._envVarErrors.push({
                        option: option.flags,
                        envVar: option.envVar,
                        value: envValue,
                        error: error.message
                    });
                }
            }
            
            this.on('optionEnv:' + oname, (val) => {
                const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
                handleOptionValue(val, invalidValueMessage, 'env');
            });
        }

        // Add to legacy arrays
        this._options.push(option);
        this.options.push(option);
        this._optionProcessor.addOption(option);

        // Auto-generate environment variable if enabled
        if (this._autoEnv && !option.envVar) {
            const envName = this._generateEnvVarName(option, this._envPrefix);
            option.env(envName);
        }

        // Add to WASM if available
        this._addOptionToWASM(option);

        return this;
    }

    _registerOption(option) {
        // Check if this exact option is already registered
        const existingOption = this.options.find(existing => existing === option);
        if (existingOption) {
            // Same option instance is already registered, skip validation
            return;
        }
        
        // Check for direct flag conflicts, but allow if it's the exact same option being re-added
        const shortConflict = option.short && this._findOption(option.short);
        const longConflict = option.long && this._findOption(option.long);
        
        if (shortConflict && shortConflict !== option) {
            throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting short flag '${option.short}'
-  already used by option '${shortConflict.flags}'`);
        }
        
        if (longConflict && longConflict !== option) {
            throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting long flag '${option.long}'
-  already used by option '${longConflict.flags}'`);
        }
        
        // Check for negatable option conflicts - allow complementary negatable options
        if (option.long) {
            const baseName = option.long.replace(/^--/, '');
            
            if (baseName.startsWith('no-')) {
                // This is a --no-xxx option, check for positive version
                const positiveName = baseName.substring(3);
                const positiveConflict = this._findOption(`--${positiveName}`);
                // Only conflict if both are explicitly negatable and different instances
                if (positiveConflict && positiveConflict !== option && 
                    option.negatable && positiveConflict.negatable) {
                    // Allow complementary negatable options (--color and --no-color)
                    // Only throw error if they're not complementary
                    if (!this._areComplementaryNegatableOptions(option, positiveConflict)) {
                        throw new Error(`Cannot add negatable option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflict with existing negatable option '${positiveConflict.flags}'`);
                    }
                }
            } else {
                // This is a positive option, check for --no-xxx version
                const negativeConflict = this._findOption(`--no-${baseName}`);
                // Only conflict if both are explicitly negatable and different instances
                if (negativeConflict && negativeConflict !== option && 
                    option.negatable && negativeConflict.negatable) {
                    // Allow complementary negatable options (--color and --no-color)
                    // Only throw error if they're not complementary
                    if (!this._areComplementaryNegatableOptions(option, negativeConflict)) {
                        throw new Error(`Cannot add negatable option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflict with existing negatable option '${negativeConflict.flags}'`);
                    }
                }
            }
        }
        
        // Check for attribute name conflicts (for option value storage), but allow same option
        const attributeName = option.attributeName();
        const attributeConflict = this.options.find(existingOption => 
            existingOption.attributeName() === attributeName && existingOption !== option
        );
        
        if (attributeConflict) {
            throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting attribute name '${attributeName}'
-  already used by option '${attributeConflict.flags}'`);
        }
    }

    _areComplementaryNegatableOptions(option1, option2) {
        // Check if two options are complementary negatable options (e.g., --color and --no-color)
        if (!option1.long || !option2.long) return false;
        
        const name1 = option1.long.replace(/^--/, '');
        const name2 = option2.long.replace(/^--/, '');
        
        // Check if one is the negated version of the other
        if (name1.startsWith('no-')) {
            return name1.substring(3) === name2;
        } else if (name2.startsWith('no-')) {
            return name2.substring(3) === name1;
        }
        
        return false;
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
        
        if (opts.isDefault) {
            this._defaultCommandName = cmd._name;
            cmd._isDefault = true;
            this._setDefaultSubcommandInWASM(cmd);
        }
        
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        
        // Handle executable subcommands
        if (opts.executableFile || cmd._executableHandler) {
            cmd._executableHandler = true;
            cmd._executableFile = opts.executableFile || `${this._name}-${name}`;
            this._setExecutableSubcommandInWASM(cmd, cmd._executableFile);
        }
        
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

    // Enhanced action methods for async support
    asyncAction(fn) {
        const listener = async (args) => {
            const expectedArgsCount = this.registeredArguments.length;
            const actionArgs = args.slice(0, expectedArgsCount);
            if (this._storeOptionsAsProperties) {
                actionArgs[expectedArgsCount] = this;
            } else {
                actionArgs[expectedArgsCount] = this.opts();
            }
            actionArgs.push(this);

            return await fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        this._action = fn;
        this._asyncAction = true;
        
        // Set async action in WASM if available
        this._setAsyncActionInWASM(fn);
        
        return this;
    }

    isAsyncAction() {
        return !!this._asyncAction;
    }

    // Configuration methods
    allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        this._updateParsingConfigInWASM();
        return this;
    }

    allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        this._updateParsingConfigInWASM();
        return this;
    }

    enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        this._updateParsingConfigInWASM();
        return this;
    }

    passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._updateParsingConfigInWASM();
        return this;
    }

    // Enhanced parsing configuration methods

    /**
     * Set a positional option mapping
     */
    setPositionalOption(position, optionName) {
        if (!this._positionalOptions) {
            this._positionalOptions = new Map();
        }
        this._positionalOptions.set(position, optionName);
        this._setPositionalOptionInWASM(position, optionName);
        return this;
    }

    /**
     * Get positional option mapping
     */
    getPositionalOptions() {
        return this._positionalOptions || new Map();
    }

    /**
     * Clear all positional option mappings
     */
    clearPositionalOptions() {
        this._positionalOptions = null;
        return this;
    }

    /**
     * Remove a specific positional option mapping
     */
    removePositionalOption(position) {
        if (this._positionalOptions) {
            this._positionalOptions.delete(position);
            if (this._positionalOptions.size === 0) {
                this._positionalOptions = null;
            }
        }
        return this;
    }

    /**
     * Set multiple positional options at once
     */
    setPositionalOptions(mappings) {
        if (typeof mappings === 'object' && mappings !== null) {
            this._positionalOptions = new Map();
            for (const [position, optionName] of Object.entries(mappings)) {
                this._positionalOptions.set(parseInt(position), optionName);
                this._setPositionalOptionInWASM(parseInt(position), optionName);
            }
        }
        return this;
    }

    /**
     * Set custom handler for unknown options
     */
    setUnknownOptionHandler(handler) {
        if (typeof handler !== 'function') {
            throw new Error('Unknown option handler must be a function');
        }
        this._unknownOptionHandler = handler;
        this._setUnknownOptionHandlerInWASM();
        return this;
    }

    /**
     * Set custom handler for excess arguments
     */
    setExcessArgumentHandler(handler) {
        if (typeof handler !== 'function') {
            throw new Error('Excess argument handler must be a function');
        }
        this._excessArgumentHandler = handler;
        this._setExcessArgumentHandlerInWASM();
        return this;
    }

    /**
     * Remove custom handler for unknown options
     */
    removeUnknownOptionHandler() {
        this._unknownOptionHandler = null;
        return this;
    }

    /**
     * Remove custom handler for excess arguments
     */
    removeExcessArgumentHandler() {
        this._excessArgumentHandler = null;
        return this;
    }

    /**
     * Get current unknown option handler
     */
    getUnknownOptionHandler() {
        return this._unknownOptionHandler;
    }

    /**
     * Get current excess argument handler
     */
    getExcessArgumentHandler() {
        return this._excessArgumentHandler;
    }

    /**
     * Set custom option value processor
     */
    setOptionValueProcessor(processor) {
        if (typeof processor !== 'function') {
            throw new Error('Option value processor must be a function');
        }
        this._optionValueProcessor = processor;
        return this;
    }

    /**
     * Process option value through custom processor if available
     * @private
     */
    _processOptionValue(option, value, source = 'cli') {
        if (this._optionValueProcessor) {
            try {
                return this._optionValueProcessor(option, value, source);
            } catch (error) {
                throw new CommanderError(`Option value processor failed for ${option.flags}: ${error.message}`);
            }
        }
        return value;
    }

    /**
     * Get current parsing configuration
     */
    getParsingConfig() {
        return {
            allowUnknownOption: this._allowUnknownOption,
            allowExcessArguments: this._allowExcessArguments,
            enablePositionalOptions: this._enablePositionalOptions,
            passThroughOptions: this._passThroughOptions,
            combineFlagAndOptionalValue: this._combineFlagAndOptionalValue,
            storeOptionsAsProperties: this._storeOptionsAsProperties,
            showHelpAfterError: this._showHelpAfterError,
            showSuggestionAfterError: this._showSuggestionAfterError,
            positionalOptions: this._positionalOptions ? Object.fromEntries(this._positionalOptions) : {},
            hasUnknownOptionHandler: !!this._unknownOptionHandler,
            hasExcessArgumentHandler: !!this._excessArgumentHandler
        };
    }

    /**
     * Set multiple parsing configuration options at once
     */
    setParsingConfig(config) {
        if (typeof config !== 'object' || config === null) {
            throw new Error('Parsing config must be an object');
        }

        if ('allowUnknownOption' in config) {
            this._allowUnknownOption = !!config.allowUnknownOption;
        }
        if ('allowExcessArguments' in config) {
            this._allowExcessArguments = !!config.allowExcessArguments;
        }
        if ('enablePositionalOptions' in config) {
            this._enablePositionalOptions = !!config.enablePositionalOptions;
        }
        if ('passThroughOptions' in config) {
            this._passThroughOptions = !!config.passThroughOptions;
        }
        if ('combineFlagAndOptionalValue' in config) {
            this._combineFlagAndOptionalValue = !!config.combineFlagAndOptionalValue;
        }
        if ('storeOptionsAsProperties' in config) {
            this._storeOptionsAsProperties = !!config.storeOptionsAsProperties;
        }
        if ('showHelpAfterError' in config) {
            this._showHelpAfterError = config.showHelpAfterError;
        }
        if ('showSuggestionAfterError' in config) {
            this._showSuggestionAfterError = !!config.showSuggestionAfterError;
        }

        this._updateParsingConfigInWASM();
        return this;
    }

    /**
     * Reset parsing configuration to defaults
     */
    resetParsingConfig() {
        this._allowUnknownOption = false;
        this._allowExcessArguments = false;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._combineFlagAndOptionalValue = true;
        this._storeOptionsAsProperties = false;
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._positionalOptions = null;
        this._unknownOptionHandler = null;
        this._excessArgumentHandler = null;
        
        this._updateParsingConfigInWASM();
        return this;
    }

    /**
     * Enable strict parsing mode (no unknown options, no excess arguments)
     */
    enableStrictParsing() {
        this._allowUnknownOption = false;
        this._allowExcessArguments = false;
        this._passThroughOptions = false;
        this._unknownOptionHandler = null;
        this._excessArgumentHandler = null;
        
        this._updateParsingConfigInWASM();
        return this;
    }

    /**
     * Enable permissive parsing mode (allow unknown options and excess arguments)
     */
    enablePermissiveParsing() {
        this._allowUnknownOption = true;
        this._allowExcessArguments = true;
        this._passThroughOptions = true;
        
        this._updateParsingConfigInWASM();
        return this;
    }

    /**
     * Configure argument separator handling
     */
    configureArgumentSeparator(options = {}) {
        const {
            stopOnDoubleDash = true,
            treatAsArguments = true,
            includeInArgs = false
        } = options;
        
        this._argumentSeparatorConfig = {
            stopOnDoubleDash,
            treatAsArguments,
            includeInArgs
        };
        
        return this;
    }

    /**
     * Get argument separator configuration
     */
    getArgumentSeparatorConfig() {
        return this._argumentSeparatorConfig || {
            stopOnDoubleDash: true,
            treatAsArguments: true,
            includeInArgs: false
        };
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
        this._configureOutputInWASM(configuration);
        return this;
    }

    // Enhanced output and error configuration methods

    /**
     * Configure error handling behavior
     */
    configureError(configuration) {
        if (configuration === undefined) return this._errorConfiguration || {};
        
        this._errorConfiguration = { ...this._errorConfiguration, ...configuration };
        
        // Apply configuration to internal properties
        if ('showHelpAfterError' in configuration) {
            this._showHelpAfterError = configuration.showHelpAfterError;
        }
        if ('showSuggestionAfterError' in configuration) {
            this._showSuggestionAfterError = configuration.showSuggestionAfterError;
        }
        if ('exitOverride' in configuration) {
            this._exitCallback = configuration.exitOverride;
        }
        if ('suggestionGenerator' in configuration) {
            this._suggestionGenerator = configuration.suggestionGenerator;
        }
        if ('errorPrefix' in configuration) {
            this._errorPrefix = configuration.errorPrefix;
        }
        if ('errorSuffix' in configuration) {
            this._errorSuffix = configuration.errorSuffix;
        }
        
        this._configureErrorInWASM(configuration);
        return this;
    }

    /**
     * Get error configuration
     */
    getErrorConfiguration() {
        return { ...this._errorConfiguration };
    }

    /**
     * Reset error configuration to defaults
     */
    resetErrorConfiguration() {
        this._errorConfiguration = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._exitCallback = null;
        this._suggestionGenerator = null;
        this._errorPrefix = '';
        this._errorSuffix = '';
        return this;
    }

    /**
     * Set error message formatting
     */
    setErrorFormat(options = {}) {
        const {
            prefix = 'error: ',
            suffix = '',
            includeCommand = false,
            includeTimestamp = false
        } = options;
        
        this._errorPrefix = prefix;
        this._errorSuffix = suffix;
        this._errorIncludeCommand = includeCommand;
        this._errorIncludeTimestamp = includeTimestamp;
        
        return this;
    }

    /**
     * Format error message according to configuration
     * @private
     */
    _formatErrorMessage(message) {
        let formatted = message;
        
        if (this._errorPrefix) {
            formatted = this._errorPrefix + formatted;
        }
        
        if (this._errorIncludeCommand && this._name) {
            formatted = `[${this._name}] ${formatted}`;
        }
        
        if (this._errorIncludeTimestamp) {
            const timestamp = new Date().toISOString();
            formatted = `${timestamp} ${formatted}`;
        }
        
        if (this._errorSuffix) {
            formatted = formatted + this._errorSuffix;
        }
        
        return formatted;
    }

    /**
     * Set custom suggestion generator for unknown commands
     */
    setSuggestionGenerator(generator) {
        if (typeof generator !== 'function') {
            throw new Error('Suggestion generator must be a function');
        }
        this._suggestionGenerator = generator;
        return this;
    }

    /**
     * Generate suggestion for unknown command
     */
    generateSuggestion(unknownCommand) {
        if (this._suggestionGenerator) {
            const availableCommands = this.commands.map(cmd => cmd._name);
            return this._suggestionGenerator(unknownCommand, availableCommands);
        }
        
        // Default suggestion logic
        return this._generateDefaultSuggestion(unknownCommand);
    }

    /**
     * Generate suggestion for unknown option
     */
    generateOptionSuggestion(unknownOption) {
        if (this.options.length === 0) {
            return '';
        }

        const cleanOption = unknownOption.replace(/^-+/, '');
        
        // Find options that start with the same letter or are similar
        for (const option of this.options) {
            const longName = option.long ? option.long.replace(/^--/, '') : '';
            const shortName = option.short ? option.short.replace(/^-/, '') : '';
            
            if (longName && (longName.startsWith(cleanOption) || cleanOption.startsWith(longName[0]))) {
                return `Did you mean '${option.long}'?`;
            }
            if (shortName && cleanOption === shortName) {
                return `Did you mean '${option.short}'?`;
            }
        }

        // If no similar option found, suggest available options
        if (this.options.length <= 5) {
            const optionNames = this.options
                .filter(opt => !opt.hidden)
                .map(opt => opt.long || opt.short)
                .filter(Boolean);
            return `Available options: ${optionNames.join(', ')}`;
        }

        return 'Use --help to see available options';
    }

    /**
     * Default suggestion generation logic
     */
    _generateDefaultSuggestion(unknownCommand) {
        if (this.commands.length === 0) {
            return '';
        }

        // Simple similarity check - find commands that start with the same letter
        for (const cmd of this.commands) {
            if (cmd._name.length > 0 && unknownCommand.length > 0 && 
                cmd._name[0].toLowerCase() === unknownCommand[0].toLowerCase()) {
                return `Did you mean '${cmd._name}'?`;
            }
        }

        // If no similar command found, suggest available commands
        if (this.commands.length <= 3) {
            const names = this.commands.map(cmd => cmd._name);
            return `Available commands: ${names.join(', ')}`;
        }

        return 'Use --help to see available commands';
    }

    /**
     * Write output using configured output writer
     */
    writeOut(str) {
        this._outputConfiguration.writeOut(str);
    }

    /**
     * Write error output using configured error writer
     */
    writeErr(str) {
        this._outputConfiguration.writeErr(str);
    }

    /**
     * Output error message using configured error output
     */
    outputError(str) {
        this._outputConfiguration.outputError(str, this._outputConfiguration.writeErr);
    }

    /**
     * Get output configuration
     */
    getOutputConfiguration() {
        return { ...this._outputConfiguration };
    }

    /**
     * Reset output configuration to defaults
     */
    resetOutputConfiguration() {
        this._outputConfiguration = {
            writeOut: (str) => this._streamInterface.write(str),
            writeErr: (str) => this._streamInterface.writeError(str),
            outputError: (str, write) => write(str),
            getOutHelpWidth: () => this._streamInterface.dimensions.output?.columns,
            getErrHelpWidth: () => this._streamInterface.dimensions.error?.columns,
            getOutHasColors: () => this._streamInterface.hasColors.output,
            getErrHasColors: () => this._streamInterface.hasColors.error,
            stripColor: (str) => str
        };
        return this;
    }

    /**
     * Configure output streams
     */
    configureStreams(options = {}) {
        const {
            stdout = process.stdout,
            stderr = process.stderr,
            stdin = process.stdin
        } = options;
        
        this._streamInterface = nodeJSIntegration.createStreamInterface({
            stdout,
            stderr,
            stdin
        });
        
        // Update output configuration to use new streams
        this._outputConfiguration.writeOut = (str) => this._streamInterface.write(str);
        this._outputConfiguration.writeErr = (str) => this._streamInterface.writeError(str);
        
        return this;
    }

    /**
     * Enable or disable color output
     */
    configureColors(options = {}) {
        const {
            stdout = true,
            stderr = true,
            forceColor = false,
            noColor = false
        } = options;
        
        if (noColor) {
            this._outputConfiguration.getOutHasColors = () => false;
            this._outputConfiguration.getErrHasColors = () => false;
        } else if (forceColor) {
            this._outputConfiguration.getOutHasColors = () => true;
            this._outputConfiguration.getErrHasColors = () => true;
        } else {
            this._outputConfiguration.getOutHasColors = () => stdout && this._streamInterface.hasColors.output;
            this._outputConfiguration.getErrHasColors = () => stderr && this._streamInterface.hasColors.error;
        }
        
        return this;
    }

    /**
     * Set custom color stripping function
     */
    setColorStripper(stripperFn) {
        if (typeof stripperFn !== 'function') {
            throw new Error('Color stripper must be a function');
        }
        this._outputConfiguration.stripColor = stripperFn;
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
        
        // Add hook to WASM if available
        this._addHookToWASM(event, listener);
        
        return this;
    }

    // Enhanced lifecycle hook management
    addHook(event, listener) {
        return this.hook(event, listener);
    }

    removeHook(event) {
        const allowedValues = ['preSubcommand', 'preAction', 'postAction'];
        if (!allowedValues.includes(event)) {
            throw new Error(`Unexpected value for event passed to removeHook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        
        this._lifeCycleHooks[event] = [];
        this._removeHookFromWASM(event);
        
        return this;
    }

    getHooks(event) {
        if (event) {
            return this._lifeCycleHooks[event] || [];
        }
        return { ...this._lifeCycleHooks };
    }

    hasHooks(event) {
        if (event) {
            return (this._lifeCycleHooks[event] || []).length > 0;
        }
        return Object.values(this._lifeCycleHooks).some(hooks => hooks.length > 0);
    }

    async executeHooks(event, actionCommand = this) {
        const hooks = this._lifeCycleHooks[event] || [];
        
        // Emit lifecycle event for external listeners
        this.emit(event, this, actionCommand);
        
        for (const hook of hooks) {
            try {
                if (typeof hook === 'function') {
                    await hook(this, actionCommand);
                }
            } catch (error) {
                throw new Error(`${event} hook failed: ${error.message}`);
            }
        }
        
        // Also execute hooks in WASM if available
        await this._executeHooksInWASM(event, actionCommand);
    }

    /**
     * Execute hooks synchronously (for compatibility with synchronous parsing)
     * @private
     */
    _executeHooksSync(event, actionCommand = this) {
        const hooks = this._lifeCycleHooks[event] || [];
        
        // Emit lifecycle event for external listeners
        this.emit(event, this, actionCommand);
        
        for (const hook of hooks) {
            try {
                if (typeof hook === 'function') {
                    // Call hook synchronously - if it returns a promise, we ignore it
                    const result = hook(this, actionCommand);
                    // If the hook is async but we're in sync mode, warn the user
                    if (result && typeof result.then === 'function') {
                        console.warn(`Warning: Async hook detected in synchronous context for event '${event}'. Use parseAsync() for async hooks.`);
                    }
                }
            } catch (error) {
                throw new Error(`${event} hook failed: ${error.message}`);
            }
        }
    }

    /**
     * Enhanced event emission for command lifecycle events
     */
    emitLifecycleEvent(event, data = {}) {
        this.emit(event, {
            command: this,
            timestamp: new Date(),
            ...data
        });
    }

    /**
     * Add event listener for command lifecycle events
     */
    onLifecycleEvent(event, listener) {
        this.on(event, listener);
        return this;
    }

    /**
     * Remove event listener for command lifecycle events
     */
    offLifecycleEvent(event, listener) {
        this.off(event, listener);
        return this;
    }

    /**
     * Get all registered event listeners for a specific event
     */
    getEventListeners(event) {
        return this.listeners(event);
    }

    /**
     * Check if there are any listeners for a specific event
     */
    hasEventListeners(event) {
        return this.listenerCount(event) > 0;
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
        
        // Update WASM configuration
        this._setExitOverrideInWASM();
        
        return this;
    }

    version(str, flags, description, options = {}) {
        if (str === undefined) return this._version;

        this._version = str;

        // Create enhanced version option using version support
        const versionOption = versionSupport.createVersionOption(
            str,
            flags || '-V, --version',
            description || 'display version number',
            options
        );

        // Add version option with custom action
        const option = this.createOption(versionOption.flags, versionOption.description);
        option.action = versionOption.action;
        
        // Override the option handling to call version display
        this.on(`option:${option.name()}`, () => {
            versionOption.action();
        });

        this.addOption(option);
        return this;
    }

    /**
     * Enhanced version methods with different sources
     */
    versionFromPackage(flags, description, options = {}) {
        const versionOption = versionSupport.createVersionFromPackage(
            flags || '-V, --version',
            description || 'display version number',
            options
        );

        this._version = versionOption.version;
        
        const option = this.createOption(versionOption.flags, versionOption.description);
        this.on(`option:${option.name()}`, versionOption.action);
        this.addOption(option);
        
        return this;
    }

    versionFromEnv(envVar, flags, description, options = {}) {
        const versionOption = versionSupport.createVersionFromEnv(
            envVar,
            flags || '-V, --version',
            description || 'display version number',
            options
        );

        this._version = versionOption.version;
        
        const option = this.createOption(versionOption.flags, versionOption.description);
        this.on(`option:${option.name()}`, versionOption.action);
        this.addOption(option);
        
        return this;
    }

    /**
     * Set custom version formatter
     */
    setVersionFormatter(formatter) {
        if (typeof formatter !== 'function') {
            throw new Error('Version formatter must be a function');
        }
        this._versionFormatter = formatter;
        return this;
    }

    /**
     * Get version information with context
     */
    getVersionInfo() {
        return {
            version: this._version,
            context: versionSupport.buildVersionContext(),
            sources: versionSupport.getVersionSources()
        };
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

    negatableOption(flags, description, defaultValue = true) {
        const option = Option.createNegatable(flags, description);
        option.default(defaultValue);
        
        return this.addOption(option);
    }

    variadicOption(flags, description, defaultValue = []) {
        const option = Option.createVariadic(flags, description);
        option.default(defaultValue);
        
        return this.addOption(option);
    }

    /**
     * Create a variadic option with custom separator
     */
    variadicOptionWithSeparator(flags, description, separator = ',', defaultValue = []) {
        const option = Option.createVariadic(flags, description);
        option.default(defaultValue);
        
        // Add custom parser to handle separator
        const originalParser = option.parseArg;
        option.argParser((value, previous) => {
            // Split by separator if it's a string
            if (typeof value === 'string' && value.includes(separator)) {
                const values = value.split(separator).map(v => v.trim()).filter(v => v.length > 0);
                
                // Apply original parser to each value if it exists
                if (originalParser) {
                    return values.map(v => originalParser(v, undefined));
                }
                
                return values;
            }
            
            // Single value - apply original parser if it exists
            if (originalParser) {
                return originalParser(value, previous);
            }
            
            return value;
        });
        
        return this.addOption(option);
    }

    /**
     * Create a variadic option with min/max count validation
     */
    variadicOptionWithCount(flags, description, minCount = 0, maxCount = Infinity, defaultValue = []) {
        const option = Option.createVariadic(flags, description);
        option.default(defaultValue);
        
        // Add validation for count
        const originalParser = option.parseArg;
        option.argParser((value, previous) => {
            let result = value;
            
            // Apply original parser if it exists
            if (originalParser) {
                result = originalParser(value, previous);
            }
            
            // Ensure result is an array for count validation
            const finalArray = Array.isArray(result) ? result : [result];
            
            if (finalArray.length < minCount) {
                throw new Error(`Option ${flags} requires at least ${minCount} value(s), got ${finalArray.length}`);
            }
            
            if (finalArray.length > maxCount) {
                throw new Error(`Option ${flags} accepts at most ${maxCount} value(s), got ${finalArray.length}`);
            }
            
            return result;
        });
        
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

    /**
     * Create option with validation function
     */
    validatedOption(flags, description, validator, defaultValue) {
        const option = new Option(flags, description);
        
        // Create a parser that includes validation
        const validatingParser = (value, previous) => {
            try {
                const result = validator(value, previous);
                
                if (result === false) {
                    throw new Error(`Validation failed for value: ${value}`);
                }
                
                if (typeof result === 'object' && result !== null) {
                    if (result.valid === false) {
                        throw new Error(result.message || `Validation failed for value: ${value}`);
                    }
                    return result.value !== undefined ? result.value : value;
                }
                
                return typeof result === 'undefined' ? value : result;
            } catch (error) {
                throw new Error(`Validation failed for option ${flags}: ${error.message}`);
            }
        };
        
        option.argParser(validatingParser);
        
        if (defaultValue !== undefined) {
            option.default(defaultValue);
        }
        
        return this.addOption(option);
    }

    /**
     * Create option with transformation function
     */
    transformedOption(flags, description, transformer, defaultValue) {
        const option = new Option(flags, description);
        
        const transformingParser = (value, previous) => {
            try {
                return transformer(value, previous);
            } catch (error) {
                throw new Error(`Transformation failed for option ${flags}: ${error.message}`);
            }
        };
        
        option.argParser(transformingParser);
        
        if (defaultValue !== undefined) {
            option.default(defaultValue);
        }
        
        return this.addOption(option);
    }

    /**
     * Create option with async validation (for parseAsync)
     */
    asyncValidatedOption(flags, description, asyncValidator, defaultValue) {
        const option = new Option(flags, description);
        
        const asyncValidatingParser = async (value, previous) => {
            try {
                const result = await asyncValidator(value, previous);
                
                if (result === false) {
                    throw new Error(`Async validation failed for value: ${value}`);
                }
                
                if (typeof result === 'object' && result !== null) {
                    if (result.valid === false) {
                        throw new Error(result.message || `Async validation failed for value: ${value}`);
                    }
                    return result.value !== undefined ? result.value : value;
                }
                
                return typeof result === 'undefined' ? value : result;
            } catch (error) {
                throw new Error(`Async validation failed for option ${flags}: ${error.message}`);
            }
        };
        
        option.argParser(asyncValidatingParser);
        option._isAsync = true; // Mark as async for special handling
        
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
        await this._parseCommandAsync([], userArgs);
        return this;
    }

    async _parseCommandAsync(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);

        if (operands && this._findCommand(operands[0])) {
            return await this._dispatchSubcommandAsync(operands[0], operands.slice(1), unknown);
        }

        // Check for help command
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
            return this._dispatchHelpCommand(operands[1]);
        }

        if (this._defaultCommandName) {
            return await this._dispatchSubcommandAsync(this._defaultCommandName, operands, unknown);
        }

        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
            this.help({ error: true });
        }

        if (this._actionHandler) {
            this._processArguments();
            
            // Execute pre-action hooks
            await this.executeHooks('preAction', this);
            
            try {
                // Execute the action
                const result = await this._actionHandler(this.processedArgs);
                
                // Execute post-action hooks
                await this.executeHooks('postAction', this);
                
                return result;
            } catch (error) {
                // Still execute post-action hooks even if action failed
                try {
                    await this.executeHooks('postAction', this);
                } catch (hookError) {
                    // Log hook error but throw original action error
                    console.warn('Post-action hook failed:', hookError.message);
                }
                throw error;
            }
        }

        // Fallback to JavaScript parsing if WASM not available
        return this._parseWithJS(this.args);
    }

    async _dispatchSubcommandAsync(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) {
            // Check for default subcommand
            const defaultCmd = this.getDefaultSubcommand();
            if (defaultCmd) {
                // Prepend the command name back to operands for default command
                return await defaultCmd._parseCommandAsync([commandName, ...operands], unknown);
            }
            this.help({ error: true });
            return;
        }

        // Execute pre-subcommand hooks
        await this.executeHooks('preSubcommand', subCommand);

        if (subCommand._executableHandler) {
            // Handle executable subcommands
            return await this._executeSubcommandAsync(subCommand, operands, unknown);
        } else {
            return await subCommand._parseCommandAsync(operands, unknown);
        }
    }

    async _executeSubcommandAsync(subCommand, operands, unknown) {
        if (subCommand._executableHandler && subCommand._executableFile) {
            // Execute as external process using Node.js integration
            try {
                const args = [...operands, ...unknown];
                const options = {
                    cwd: process.cwd(),
                    env: process.env,
                    stdio: 'inherit',
                    executableDir: this._executableDir,
                    async: true
                };

                const result = await nodeJSIntegration.spawnExecutableSubcommand(
                    subCommand._executableFile,
                    args,
                    options
                );

                return result;
            } catch (error) {
                throw new CommanderError(`Failed to execute subcommand ${subCommand._name}: ${error.message}`);
            }
        } else if (subCommand._action) {
            // Execute as internal action
            if (subCommand._asyncAction) {
                return await subCommand._action(operands, this.opts());
            } else {
                return subCommand._action(operands, this.opts());
            }
        }
        
        return Promise.resolve();
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
            
            // Execute pre-action hooks
            try {
                this._executeHooksSync('preAction', this);
            } catch (error) {
                this.error(`Pre-action hook failed: ${error.message}`);
            }
            
            try {
                // Execute the action
                const result = this._actionHandler(this.processedArgs);
                
                // Execute post-action hooks
                try {
                    this._executeHooksSync('postAction', this);
                } catch (hookError) {
                    // Log hook error but don't fail the action
                    console.warn('Post-action hook failed:', hookError.message);
                }
                
                return result;
            } catch (error) {
                // Still execute post-action hooks even if action failed
                try {
                    this._executeHooksSync('postAction', this);
                } catch (hookError) {
                    // Log hook error but throw original action error
                    console.warn('Post-action hook failed:', hookError.message);
                }
                throw error;
            }
        }

        // Fallback to JavaScript parsing if WASM not available
        return this._parseWithJS(this.args);
    }

    _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) {
            // Check for default subcommand
            const defaultCmd = this.getDefaultSubcommand();
            if (defaultCmd) {
                // Prepend the command name back to operands for default command
                return defaultCmd._parseCommand([commandName, ...operands], unknown);
            }
            this.help({ error: true });
            return;
        }

        // Execute pre-subcommand hooks
        try {
            // Use synchronous version of executeHooks for consistency
            this._executeHooksSync('preSubcommand', subCommand);
        } catch (error) {
            this.error(`Pre-subcommand hook failed: ${error.message}`);
        }

        if (subCommand._executableHandler) {
            // Handle executable subcommands
            return this._executeSubcommand(subCommand, operands, unknown);
        } else {
            return subCommand._parseCommand(operands, unknown);
        }
    }

    _executeSubcommand(subCommand, operands, unknown) {
        if (subCommand._executableHandler && subCommand._executableFile) {
            // Execute as external process using Node.js integration (synchronous)
            try {
                const args = [...operands, ...unknown];
                const options = {
                    cwd: process.cwd(),
                    env: process.env,
                    stdio: 'inherit',
                    executableDir: this._executableDir,
                    async: false
                };

                const result = nodeJSIntegration.spawnExecutableSubcommand(
                    subCommand._executableFile,
                    args,
                    options
                );

                return result;
            } catch (error) {
                throw new CommanderError(`Failed to execute subcommand ${subCommand._name}: ${error.message}`);
            }
        } else if (subCommand._action) {
            // Execute as internal action
            return subCommand._action(operands, this.opts());
        }
        
        return Promise.resolve();
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
            // Validate required arguments
            if (declaredArg.required && (value === undefined || value === null)) {
                this.missingArgument(declaredArg.name());
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
            let stopOptionParsing = false;
            
            for (let i = 0; i < argv.length; i++) {
                const arg = argv[i];

                // Handle double dash (--) separator - stop parsing options after this
                if (arg === '--') {
                    const separatorConfig = this.getArgumentSeparatorConfig();
                    
                    if (separatorConfig.stopOnDoubleDash) {
                        stopOptionParsing = true;
                        
                        if (separatorConfig.includeInArgs) {
                            args.push(arg);
                        }
                        
                        if (separatorConfig.treatAsArguments) {
                            // Add all remaining arguments as regular arguments
                            args.push(...argv.slice(i + 1));
                        }
                        break;
                    } else {
                        // Treat -- as a regular argument
                        args.push(arg);
                        continue;
                    }
                }

                // If we've seen --, treat everything as regular arguments
                if (stopOptionParsing) {
                    args.push(arg);
                    continue;
                }

                if (arg.startsWith('-') && arg.length > 1) {
                    // Handle options with enhanced processing
                    let processed = false;

                    // Check for option with equals sign (--port=8080)
                    if (arg.includes('=')) {
                        const [flagPart, valuePart] = arg.split('=', 2);
                        const option = this._findOptionByFlag(flagPart);
                        
                        if (option) {
                            this._processOptionWithEnhancements(this._extractFlagName(flagPart), valuePart, option);
                            processed = true;
                        }
                    }
                    
                    // Handle combined short options (-abc)
                    else if (arg.startsWith('-') && !arg.startsWith('--') && arg.length > 2) {
                        const flags = arg.slice(1); // Remove the leading '-'
                        let allProcessed = true;
                        
                        for (let j = 0; j < flags.length; j++) {
                            const flag = `-${flags[j]}`;
                            const option = this._findOptionByFlag(flag);
                            
                            if (option) {
                                if (option.requiresValue && !option.optionalValue) {
                                    // If this option requires a value and it's the last flag in the group
                                    if (j === flags.length - 1) {
                                        // Check if next argument is the value
                                        if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                                            this._processOptionWithEnhancements(flags[j], argv[++i], option);
                                        } else {
                                            throw new CommanderError(`Option ${flag} requires a value`);
                                        }
                                    } else {
                                        throw new CommanderError(`Option ${flag} requires a value but is combined with other flags`);
                                    }
                                } else {
                                    // Boolean option or optional value
                                    const value = option.isBoolean() ? true : (option.presetArg !== undefined ? option.presetArg : true);
                                    this._processOptionWithEnhancements(flags[j], value, option);
                                }
                            } else {
                                allProcessed = false;
                                break;
                            }
                        }
                        
                        if (allProcessed) {
                            processed = true;
                        }
                    }
                    
                    // Handle regular options (single flag)
                    if (!processed) {
                        const option = this._findOptionByFlag(arg);
                        
                        if (option) {
                            const flagName = this._extractFlagName(arg);
                            
                            // Handle negated boolean options (--no-color)
                            if (option.negatable && arg.includes('no-')) {
                                this._processOptionWithEnhancements(flagName, false, option);
                            } else if (option.requiresValue && !option.optionalValue) {
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
                                // Boolean option
                                this._processOptionWithEnhancements(flagName, true, option);
                            }
                            processed = true;
                        }
                    }
                    
                    // Handle unknown options
                    if (!processed) {
                        let handled = false;
                        
                        if (this._unknownOptionHandler) {
                            // Use custom handler for unknown options
                            try {
                                let value = null;
                                if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                                    value = argv[i + 1];
                                    i++; // Consume the value
                                }
                                this._unknownOptionHandler(arg, value);
                                handled = true;
                            } catch (error) {
                                throw new CommanderError(`Unknown option handler failed for ${arg}: ${error.message}`);
                            }
                        } else if (this._passThroughOptions) {
                            // Pass through unknown options
                            args.push(arg);
                            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                                args.push(argv[++i]);
                            }
                            handled = true;
                        } else if (this._allowUnknownOption) {
                            // Store unknown option if allowed
                            args.push(arg);
                            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                                args.push(argv[++i]);
                            }
                            handled = true;
                        }
                        
                        if (!handled) {
                            throw new CommanderError(`error: unknown option '${arg}'`);
                        }
                    }
                } else {
                    // Check for positional options first
                    if (this._enablePositionalOptions && this._positionalOptions) {
                        const position = args.length;
                        const optionName = this._positionalOptions.get(position);
                        
                        if (optionName) {
                            // Treat this argument as a positional option
                            const option = this._findOption(`--${optionName}`) || this._findOption(`-${optionName}`);
                            if (option) {
                                this._processOptionWithEnhancements(optionName, arg, option);
                                continue;
                            }
                        }
                    }
                    
                    args.push(arg);
                }
            }

            // Enhanced validation with option groups and custom validators
            this._optionProcessor.validate();
            this._validateOptionConstraints();
            this._validateEnvironmentVariables();

            // Handle excess arguments if needed
            if (args.length > this.registeredArguments.length && !this._allowExcessArguments) {
                if (this._excessArgumentHandler) {
                    try {
                        this._excessArgumentHandler(args.slice(this.registeredArguments.length));
                    } catch (error) {
                        throw new CommanderError(`Excess argument handler failed: ${error.message}`);
                    }
                } else {
                    const expected = this.registeredArguments.length;
                    const s = expected === 1 ? '' : 's';
                    const forSubcommand = this.parent ? ` for '${this.name()}'` : '';
                    throw new CommanderError(`error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${args.length}.`);
                }
            }

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

        // Use enhanced Node.js integration for argument parsing
        const nodeJSInfo = nodeJSIntegration.parseProcessArgv(argv, parseOptions);
        
        this.rawArgs = nodeJSInfo.rawArgs;
        this._scriptPath = nodeJSInfo.scriptPath;
        this._nodeJSInfo = nodeJSInfo;

        if (!this._name && this._scriptPath) {
            this.nameFromFilename(this._scriptPath);
        }
        this._name = this._name || 'program';

        return nodeJSInfo.userArgs;
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
        const formattedMessage = this._formatErrorMessage(message);
        this.outputError(`${formattedMessage}\n`);
        
        if (typeof this._showHelpAfterError === 'string') {
            this.writeErr(`${this._showHelpAfterError}\n`);
        } else if (this._showHelpAfterError) {
            this.writeErr('\n');
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
        let message = `error: unknown option '${flag}'`;
        
        if (this._showSuggestionAfterError) {
            const suggestion = this.generateOptionSuggestion(flag);
            if (suggestion) {
                message += `\n${suggestion}`;
            }
        }
        
        this.error(message, { code: 'commander.unknownOption' });
    }

    unknownCommand() {
        const unknownName = this.args[0];
        let message = `error: unknown command '${unknownName}'`;
        
        if (this._showSuggestionAfterError) {
            const suggestion = this.generateSuggestion(unknownName);
            if (suggestion) {
                message += `\n${suggestion}`;
            }
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
            // Handle negatable options - determine if this is the negated form
            let finalValue = value;
            if (option.negatable) {
                // Check if the flag name indicates negation
                if (flagName.includes('no-') || value === false) {
                    finalValue = false;
                } else if (option.isBoolean()) {
                    finalValue = true;
                }
            }
            
            // Initialize processedValue early to avoid initialization errors
            let processedValue = finalValue;
            
            // Handle variadic options specially
            if (option.variadic) {
                const currentValue = this.getOptionValue(option.attributeName());
                processedValue = option._collectValue(finalValue, currentValue);
                
                // Process through option processor if available
                // Skip option processor for variadic options with custom parsers to avoid conflicts
                if (this._optionProcessor && this._optionProcessor.processOption && !option.parseArg) {
                    try {
                        this._optionProcessor.processOption(flagName, finalValue);
                        // Get the processed value from the option processor for variadic options
                        const processorValue = this._optionProcessor.getValue(option.attributeName());
                        if (processorValue !== undefined) {
                            processedValue = processorValue;
                        }
                    } catch (error) {
                        // For variadic options, continue with local processing if processor fails
                        console.warn(`Option processor warning for ${flagName}: ${error.message}`);
                    }
                }
                
                this.setOptionValueWithSource(option.attributeName(), processedValue, 'cli');
            } else {
                // Process through option processor for validation and parsing if available
                // Skip option processor if the option has a custom parser to avoid conflicts
                if (this._optionProcessor && this._optionProcessor.processOption && !option.parseArg) {
                    try {
                        this._optionProcessor.processOption(flagName, finalValue);
                        // Get the processed value from the option processor
                        const processorValue = this._optionProcessor.getValue(option.attributeName());
                        if (processorValue !== undefined) {
                            processedValue = processorValue;
                        }
                    } catch (error) {
                        // Continue with local processing if processor fails
                        console.warn(`Option processor warning for ${flagName}: ${error.message}`);
                    }
                }
                
                // Apply custom parser if available (after processor)
                if (option.parseArg && processedValue !== undefined && processedValue !== null) {
                    const currentValue = this.getOptionValue(option.attributeName());
                    try {
                        // Ensure we pass a string to the custom parser
                        const valueToProcess = typeof processedValue === 'string' ? processedValue : String(processedValue);
                        processedValue = option.parseArg(valueToProcess, currentValue);
                    } catch (error) {
                        throw new CommanderError(`Invalid value for option ${flagName}: ${error.message}`);
                    }
                }
                
                // Update command's internal state
                this.setOptionValueWithSource(option.attributeName(), processedValue, 'cli');
                
                // Emit option event for compatibility
                this.emit(`option:${option.name()}`, processedValue);
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
            if (option.is(flag)) {
                return option;
            }
            
            // Check direct matches
            if (option.long === flag || option.short === flag) {
                return option;
            }
            
            // Check clean flag matches
            if ((option.long && option.long.replace(/^--/, '') === cleanFlag) ||
                (option.short && option.short.replace(/^-/, '') === cleanFlag)) {
                return option;
            }
            
            // Handle negatable options - check if this is a negated version
            if (option.negatable && option.long) {
                const baseName = option.long.replace(/^--/, '');
                
                // Check for --no-xxx format
                if (flag === `--no-${baseName}` || cleanFlag === `no-${baseName}`) {
                    return option;
                }
                
                // Check if the option itself is defined as --no-xxx and we're looking for the positive version
                if (option.long.startsWith('--no-') && flag === `--${baseName.replace(/^no-/, '')}`) {
                    return option;
                }
            }
        }
        return null;
    }

    /**
     * Validate environment variables
     * @private
     */
    _validateEnvironmentVariables() {
        // Check for environment variable errors that were stored during option processing
        if (this._envVarErrors && this._envVarErrors.length > 0) {
            const errorMessages = this._envVarErrors.map(err => 
                `Environment variable ${err.envVar} for ${err.option}: ${err.error}`
            );
            throw new CommanderError(`Environment variable validation failed:\n${errorMessages.join('\n')}`);
        }
        
        // Validate current environment variables
        const envErrors = this.validateEnvVars();
        if (envErrors.length > 0) {
            const errorMessages = envErrors.map(err => 
                `Environment variable ${err.envVar} for ${err.option}: ${err.error}`
            );
            throw new CommanderError(`Environment variable validation failed:\n${errorMessages.join('\n')}`);
        }
        
        // Check required options with environment variable support
        const missingRequired = this.checkRequiredWithEnv();
        if (missingRequired.length > 0) {
            const errorMessages = missingRequired.map(missing => {
                let msg = `Missing required option: ${missing.option}`;
                if (missing.envVar) {
                    msg += ` (or set environment variable ${missing.envVar})`;
                }
                return msg;
            });
            throw new CommanderError(errorMessages.join('\n'));
        }
    }

    /**
     * Validate option constraints including conflicts and implications
     * @private
     */
    _validateOptionConstraints() {
        // Check for conflicting options with enhanced logic
        for (const option of this.options) {
            const key = option.attributeName();
            const value = this.getOptionValue(key);
            const source = this.getOptionValueSource(key);
            const isSet = value !== undefined && source !== 'default';
            
            if (isSet && option.conflictsWith && option.conflictsWith.length > 0) {
                for (const conflictFlag of option.conflictsWith) {
                    // Try multiple ways to find the conflicting option
                    let conflictOption = this._findOption(`--${conflictFlag}`) || 
                                       this._findOption(`-${conflictFlag}`) ||
                                       this.options.find(opt => opt.attributeName() === conflictFlag) ||
                                       this.options.find(opt => opt.name() === conflictFlag);
                    
                    if (conflictOption) {
                        const conflictKey = conflictOption.attributeName();
                        const conflictValue = this.getOptionValue(conflictKey);
                        const conflictSource = this.getOptionValueSource(conflictKey);
                        const conflictIsSet = conflictValue !== undefined && conflictSource !== 'default';
                        
                        if (conflictIsSet) {
                            throw new CommanderError(`Conflicting options: ${option.flags} and ${conflictOption.flags}`);
                        }
                    }
                }
            }
            
            // Handle option implications with enhanced logic
            if (isSet && option.impliesOptions && option.impliesOptions.length > 0) {
                for (const impliedFlag of option.impliesOptions) {
                    const impliedOption = this._findOption(`--${impliedFlag}`) || 
                                        this._findOption(`-${impliedFlag}`) ||
                                        this.options.find(opt => opt.attributeName() === impliedFlag);
                    
                    if (impliedOption) {
                        const impliedKey = impliedOption.attributeName();
                        const impliedValue = this.getOptionValue(impliedKey);
                        const impliedSource = this.getOptionValueSource(impliedKey);
                        
                        // Only set implied value if not already set by CLI or env
                        if (impliedValue === undefined || impliedSource === 'default') {
                            const newImpliedValue = impliedOption.defaultValue !== undefined ? 
                                                   impliedOption.defaultValue : 
                                                   (impliedOption.isBoolean() ? true : undefined);
                            
                            if (newImpliedValue !== undefined) {
                                this.setOptionValueWithSource(impliedKey, newImpliedValue, 'implied');
                            }
                        }
                    }
                }
            }
        }
        
        // Validate option groups
        if (this._optionGroups) {
            for (const group of this._optionGroups) {
                this._validateOptionGroup(group);
            }
        }
    }

    /**
     * Validate a specific option group
     * @private
     */
    _validateOptionGroup(group) {
        const setOptions = [];
        
        // Find which options in the group are set
        for (const option of group.options) {
            const key = option.attributeName();
            const value = this.getOptionValue(key);
            const source = this.getOptionValueSource(key);
            
            if (value !== undefined && source !== 'default') {
                setOptions.push(option);
            }
        }
        
        // Check exclusive constraint
        if (group.exclusive && setOptions.length > 1) {
            const optionNames = setOptions.map(opt => opt.flags);
            throw new CommanderError(`Options in group '${group.name}' are mutually exclusive, but multiple were set: ${optionNames.join(', ')}`);
        }
        
        // Check required constraint
        if (group.required && setOptions.length === 0) {
            throw new CommanderError(`At least one option from group '${group.name}' is required`);
        }
        
        // Check minimum count constraint
        if (group.minCount !== undefined && setOptions.length < group.minCount) {
            throw new CommanderError(`Group '${group.name}' requires at least ${group.minCount} option(s), but only ${setOptions.length} were set`);
        }
        
        // Check maximum count constraint
        if (group.maxCount !== undefined && setOptions.length > group.maxCount) {
            throw new CommanderError(`Group '${group.name}' allows at most ${group.maxCount} option(s), but ${setOptions.length} were set`);
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
        
        // Initialize option groups array if not exists
        if (!this._optionGroups) {
            this._optionGroups = [];
        }
        
        // Check for duplicate group names
        const existingGroup = this._optionGroups.find(g => g.name === group.name);
        if (existingGroup) {
            throw new Error(`Option group '${group.name}' already exists`);
        }
        
        this._optionGroups.push(group);
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
     * Set environment variable prefix for all options
     */
    setEnvPrefix(prefix) {
        this._envPrefix = prefix;
        
        // Apply prefix to existing options that don't have explicit env vars
        for (const option of this.options) {
            if (!option.envVar) {
                const envName = this._generateEnvVarName(option, prefix);
                option.env(envName);
            }
        }
        
        return this;
    }

    /**
     * Get environment variable prefix
     */
    getEnvPrefix() {
        return this._envPrefix;
    }

    /**
     * Enable automatic environment variable mapping for all options
     */
    enableAutoEnv(prefix = null) {
        this._autoEnv = true;
        if (prefix) {
            this.setEnvPrefix(prefix);
        }
        
        // Apply to existing options
        for (const option of this.options) {
            if (!option.envVar) {
                const envName = this._generateEnvVarName(option, this._envPrefix);
                option.env(envName);
            }
        }
        
        return this;
    }

    /**
     * Disable automatic environment variable mapping
     */
    disableAutoEnv() {
        this._autoEnv = false;
        return this;
    }

    /**
     * Generate environment variable name for an option
     * @private
     */
    _generateEnvVarName(option, prefix = null) {
        let name = option.attributeName().toUpperCase();
        
        // Convert camelCase to SNAKE_CASE
        name = name.replace(/([A-Z])/g, '_$1').replace(/^_/, '');
        
        if (prefix) {
            name = `${prefix.toUpperCase()}_${name}`;
        }
        
        return name;
    }

    /**
     * Get all environment variable mappings
     */
    getEnvMappings() {
        const mappings = {};
        
        for (const option of this.options) {
            if (option.envVar) {
                mappings[option.envVar] = {
                    option: option.flags,
                    attributeName: option.attributeName(),
                    value: process.env[option.envVar],
                    hasValue: process.env[option.envVar] !== undefined
                };
            }
        }
        
        return mappings;
    }

    /**
     * Validate environment variables
     */
    validateEnvVars() {
        const errors = [];
        
        for (const option of this.options) {
            if (option.envVar && process.env[option.envVar] !== undefined) {
                const envValue = process.env[option.envVar];
                
                try {
                    // Test parsing the environment value
                    if (option.parseArg) {
                        option.parseArg(envValue, option.defaultValue);
                    }
                    
                    // Test choices validation
                    if (option.choices && !option.choices.includes(envValue)) {
                        errors.push({
                            option: option.flags,
                            envVar: option.envVar,
                            value: envValue,
                            error: `Invalid choice. Expected one of: ${option.choices.join(', ')}`
                        });
                    }
                } catch (error) {
                    errors.push({
                        option: option.flags,
                        envVar: option.envVar,
                        value: envValue,
                        error: error.message
                    });
                }
            }
        }
        
        return errors;
    }

    /**
     * Check if required options are satisfied by environment variables
     */
    checkRequiredWithEnv() {
        const missing = [];
        
        for (const option of this.options) {
            if ((option.required || option.mandatory)) {
                const key = option.attributeName();
                const currentValue = this.getOptionValue(key);
                const currentSource = this.getOptionValueSource(key);
                
                // Check if we have a CLI value
                const hasCliValue = currentSource === 'cli' && currentValue !== undefined;
                
                // Check if we have an environment variable value
                let hasEnvValue = false;
                if (option.envVar && process.env[option.envVar] !== undefined) {
                    hasEnvValue = true;
                    // Set the environment variable value if no CLI value exists
                    if (!hasCliValue) {
                        try {
                            const envValue = process.env[option.envVar];
                            let processedEnvValue = envValue;
                            
                            // Apply custom parser if available
                            if (option.parseArg) {
                                processedEnvValue = option.parseArg(envValue, option.defaultValue);
                            }
                            
                            this.setOptionValueWithSource(key, processedEnvValue, 'env');
                        } catch (error) {
                            // Environment variable value is invalid, treat as missing
                            hasEnvValue = false;
                        }
                    }
                }
                
                // Check if we have a default value
                const hasDefaultValue = option.defaultValue !== undefined;
                
                // For variadic options, check if we have an empty array (which is valid)
                const hasValidVariadicValue = option.variadic && Array.isArray(currentValue);
                
                if (!hasCliValue && !hasEnvValue && !hasDefaultValue && !hasValidVariadicValue) {
                    missing.push({
                        option: option.flags,
                        envVar: option.envVar,
                        attributeName: key
                    });
                }
            }
        }
        
        return missing;
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

    // Enhanced subcommand WASM integration methods

    async _setExecutableSubcommandInWASM(cmd, executableFile) {
        if (!cmd._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.setExecutableSubcommand(
                cmd._wasmCommandId,
                executableFile,
                this._executableDir
            );

            if (result.error) {
                console.warn('Failed to set executable subcommand in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error setting executable subcommand in WASM:', error.message);
        }
    }

    async _setDefaultSubcommandInWASM(cmd) {
        if (!this._wasmCommandId || !cmd._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.setDefaultSubcommand(
                this._wasmCommandId,
                cmd._name
            );

            if (result.error) {
                console.warn('Failed to set default subcommand in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error setting default subcommand in WASM:', error.message);
        }
    }

    async _addAliasToWASM(alias) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.addCommandAlias(
                this._wasmCommandId,
                alias
            );

            if (result.error) {
                console.warn('Failed to add alias in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error adding alias in WASM:', error.message);
        }
    }

    async _setAliasesInWASM(aliases) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.setCommandAliases(
                this._wasmCommandId,
                aliases
            );

            if (result.error) {
                console.warn('Failed to set aliases in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error setting aliases in WASM:', error.message);
        }
    }

    // Enhanced subcommand management methods

    /**
     * Set this command as the default subcommand of its parent
     */
    setAsDefault() {
        this._isDefault = true;
        if (this.parent) {
            this.parent._defaultCommandName = this._name;
            this.parent._setDefaultSubcommandInWASM(this);
        }
        return this;
    }

    /**
     * Configure this command as an executable subcommand
     */
    setExecutable(executableFile) {
        this._executableHandler = true;
        this._executableFile = executableFile || `${this.parent?._name || 'program'}-${this._name}`;
        
        if (this.parent) {
            this.parent._setExecutableSubcommandInWASM(this, this._executableFile);
        }
        
        return this;
    }

    /**
     * Get information about subcommands
     */
    async getSubcommandInfo() {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            // Fallback to JavaScript implementation
            return {
                subcommands: this.commands.map(cmd => ({
                    name: cmd._name,
                    description: cmd._description,
                    aliases: cmd._aliases,
                    hidden: cmd._hidden,
                    executable: cmd._executableHandler,
                    isDefault: cmd._isDefault,
                    hasAction: !!cmd._action
                })),
                hasSubcommands: this.commands.length > 0,
                defaultCommand: this._defaultCommandName ? {
                    name: this._defaultCommandName
                } : null,
                visibleCount: this.commands.filter(cmd => !cmd._hidden).length,
                executableDir: this._executableDir
            };
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.getSubcommandInfo(this._wasmCommandId);

            if (result.error) {
                throw new Error(result.error);
            }

            return result.data;
        } catch (error) {
            console.warn('Error getting subcommand info from WASM:', error.message);
            // Fallback to JavaScript implementation
            return this.getSubcommandInfo();
        }
    }

    /**
     * Find subcommand by name or alias
     */
    findSubcommand(nameOrAlias) {
        // First check direct name match
        let found = this.commands.find(cmd => cmd._name === nameOrAlias);
        
        // Then check aliases
        if (!found) {
            found = this.commands.find(cmd => cmd._aliases.includes(nameOrAlias));
        }
        
        return found;
    }

    /**
     * Get the default subcommand
     */
    getDefaultSubcommand() {
        if (this._defaultCommandName) {
            return this.findSubcommand(this._defaultCommandName);
        }
        return this.commands.find(cmd => cmd._isDefault);
    }

    /**
     * Check if this command has subcommands
     */
    hasSubcommands() {
        return this.commands.length > 0;
    }

    /**
     * Get all visible (non-hidden) subcommands
     */
    getVisibleSubcommands() {
        return this.commands.filter(cmd => !cmd._hidden);
    }

    /**
     * Check if this is an executable subcommand
     */
    isExecutableSubcommand() {
        return this._executableHandler;
    }

    // WASM integration methods for lifecycle hooks

    async _addHookToWASM(event, listener) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.addHook(this._wasmCommandId, event);

            if (result.error) {
                console.warn('Failed to add hook in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error adding hook in WASM:', error.message);
        }
    }

    async _removeHookFromWASM(event) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.removeHook(this._wasmCommandId, event);

            if (result.error) {
                console.warn('Failed to remove hook in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error removing hook in WASM:', error.message);
        }
    }

    async _executeHooksInWASM(event, actionCommand) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.executeHooks(
                this._wasmCommandId, 
                event, 
                actionCommand._wasmCommandId
            );

            if (result.error) {
                console.warn('Failed to execute hooks in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error executing hooks in WASM:', error.message);
        }
    }

    async _setAsyncActionInWASM(fn) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.setAsyncAction(this._wasmCommandId);

            if (result.error) {
                console.warn('Failed to set async action in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error setting async action in WASM:', error.message);
        }
    }

    async getHookInfo() {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            // Fallback to JavaScript implementation
            return {
                hasHooks: this.hasHooks(),
                preActionCount: this._lifeCycleHooks.preAction.length,
                postActionCount: this._lifeCycleHooks.postAction.length,
                preSubcommandCount: this._lifeCycleHooks.preSubcommand.length,
                hasAsyncAction: this._asyncAction,
                hasAction: !!this._action
            };
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.getHookInfo(this._wasmCommandId);

            if (result.error) {
                throw new Error(result.error);
            }

            return result.data;
        } catch (error) {
            console.warn('Error getting hook info from WASM:', error.message);
            // Fallback to JavaScript implementation
            return this.getHookInfo();
        }
    }

    // WASM integration methods for parsing configuration

    async _updateParsingConfigInWASM() {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const config = this.getParsingConfig();
            const result = wasmInterface.setParsingConfig(this._wasmCommandId, config);

            if (result.error) {
                console.warn('Failed to update parsing config in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error updating parsing config in WASM:', error.message);
        }
    }

    async _setPositionalOptionInWASM(position, optionName) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.setPositionalOption(
                this._wasmCommandId,
                position,
                optionName
            );

            if (result.error) {
                console.warn('Failed to set positional option in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error setting positional option in WASM:', error.message);
        }
    }

    async _setUnknownOptionHandlerInWASM() {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.setUnknownOptionHandler(this._wasmCommandId);

            if (result.error) {
                console.warn('Failed to set unknown option handler in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error setting unknown option handler in WASM:', error.message);
        }
    }

    async _setExcessArgumentHandlerInWASM() {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.setExcessArgumentHandler(this._wasmCommandId);

            if (result.error) {
                console.warn('Failed to set excess argument handler in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error setting excess argument handler in WASM:', error.message);
        }
    }

    async getParsingConfigFromWASM() {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return this.getParsingConfig();
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.getParsingConfig(this._wasmCommandId);

            if (result.error) {
                throw new Error(result.error);
            }

            return result.data;
        } catch (error) {
            console.warn('Error getting parsing config from WASM:', error.message);
            return this.getParsingConfig();
        }
    }

    // WASM integration methods for output and error configuration

    async _configureOutputInWASM(configuration) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.configureOutput(this._wasmCommandId, configuration);

            if (result.error) {
                console.warn('Failed to configure output in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error configuring output in WASM:', error.message);
        }
    }

    async _configureErrorInWASM(configuration) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.configureError(this._wasmCommandId, configuration);

            if (result.error) {
                console.warn('Failed to configure error handling in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error configuring error handling in WASM:', error.message);
        }
    }

    async _setExitOverrideInWASM() {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return;
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.setExitOverride(this._wasmCommandId);

            if (result.error) {
                console.warn('Failed to set exit override in WASM:', result.error);
            }
        } catch (error) {
            console.warn('Error setting exit override in WASM:', error.message);
        }
    }

    async generateSuggestionFromWASM(unknownCommand) {
        if (!this._wasmCommandId || !wasmLoader.isWASMLoaded()) {
            return this._generateDefaultSuggestion(unknownCommand);
        }

        try {
            const wasmInterface = wasmLoader.getInterface();
            const result = wasmInterface.generateSuggestion(this._wasmCommandId, unknownCommand);

            if (result.error) {
                throw new Error(result.error);
            }

            return result.data.suggestion;
        } catch (error) {
            console.warn('Error generating suggestion from WASM:', error.message);
            return this._generateDefaultSuggestion(unknownCommand);
        }
    }

    // Node.js runtime integration methods

    /**
     * Get Node.js runtime information
     */
    getNodeJSInfo() {
        return this._nodeJSInfo || nodeJSIntegration.parseProcessArgv();
    }

    /**
     * Get debugging and profiling information
     */
    getDebuggingInfo() {
        return nodeJSIntegration.getDebuggingInfo();
    }

    /**
     * Enhanced debugging and profiling tool compatibility
     */
    enableProfiling(options = {}) {
        const {
            cpuProfile = false,
            heapProfile = false,
            outputDir = './profiles',
            prefix = 'profile'
        } = options;

        if (cpuProfile) {
            this._enableCPUProfiling(outputDir, prefix);
        }

        if (heapProfile) {
            this._enableHeapProfiling(outputDir, prefix);
        }

        return this;
    }

    _enableCPUProfiling(outputDir, prefix) {
        try {
            const inspector = require('inspector');
            const fs = require('fs');
            const path = require('path');

            if (!inspector.url()) {
                console.warn('Inspector not available. Start with --inspect to enable CPU profiling.');
                return;
            }

            // Ensure output directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const session = new inspector.Session();
            session.connect();

            // Start CPU profiling
            session.post('Profiler.enable');
            session.post('Profiler.start');

            // Stop profiling on exit
            const stopProfiling = () => {
                session.post('Profiler.stop', (err, { profile }) => {
                    if (err) {
                        console.error('Failed to stop CPU profiling:', err);
                        return;
                    }

                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filename = `${prefix}-cpu-${timestamp}.cpuprofile`;
                    const filepath = path.join(outputDir, filename);

                    fs.writeFileSync(filepath, JSON.stringify(profile));
                    console.log(`CPU profile saved to: ${filepath}`);
                    
                    session.disconnect();
                });
            };

            process.on('exit', stopProfiling);
            process.on('SIGINT', stopProfiling);
            process.on('SIGTERM', stopProfiling);

        } catch (error) {
            console.warn('Failed to enable CPU profiling:', error.message);
        }
    }

    _enableHeapProfiling(outputDir, prefix) {
        try {
            const inspector = require('inspector');
            const fs = require('fs');
            const path = require('path');

            if (!inspector.url()) {
                console.warn('Inspector not available. Start with --inspect to enable heap profiling.');
                return;
            }

            // Ensure output directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const session = new inspector.Session();
            session.connect();

            // Enable heap profiler
            session.post('HeapProfiler.enable');

            // Take heap snapshot on exit
            const takeSnapshot = () => {
                session.post('HeapProfiler.takeHeapSnapshot', null, (err, result) => {
                    if (err) {
                        console.error('Failed to take heap snapshot:', err);
                        return;
                    }

                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filename = `${prefix}-heap-${timestamp}.heapsnapshot`;
                    const filepath = path.join(outputDir, filename);

                    // The snapshot data comes through the 'HeapProfiler.addHeapSnapshotChunk' event
                    let snapshotData = '';
                    
                    session.on('HeapProfiler.addHeapSnapshotChunk', (message) => {
                        snapshotData += message.params.chunk;
                    });

                    session.on('HeapProfiler.reportHeapSnapshotProgress', (message) => {
                        if (message.params.finished) {
                            fs.writeFileSync(filepath, snapshotData);
                            console.log(`Heap snapshot saved to: ${filepath}`);
                            session.disconnect();
                        }
                    });
                });
            };

            process.on('exit', takeSnapshot);
            process.on('SIGINT', takeSnapshot);
            process.on('SIGTERM', takeSnapshot);

        } catch (error) {
            console.warn('Failed to enable heap profiling:', error.message);
        }
    }

    /**
     * Enable performance monitoring
     */
    enablePerformanceMonitoring(options = {}) {
        const {
            interval = 5000,
            logMemory = true,
            logCPU = true,
            logEventLoop = true,
            outputFile = null
        } = options;

        const startTime = process.hrtime.bigint();
        let monitoringInterval;

        const monitor = () => {
            const now = process.hrtime.bigint();
            const uptime = Number(now - startTime) / 1e9; // Convert to seconds

            const stats = {
                timestamp: new Date().toISOString(),
                uptime: uptime,
                memory: logMemory ? process.memoryUsage() : null,
                cpu: logCPU ? process.cpuUsage() : null
            };

            if (logEventLoop) {
                // Measure event loop lag
                const start = process.hrtime.bigint();
                setImmediate(() => {
                    const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to milliseconds
                    stats.eventLoopLag = lag;
                    
                    this._outputPerformanceStats(stats, outputFile);
                });
            } else {
                this._outputPerformanceStats(stats, outputFile);
            }
        };

        monitoringInterval = setInterval(monitor, interval);

        // Stop monitoring on exit
        const stopMonitoring = () => {
            if (monitoringInterval) {
                clearInterval(monitoringInterval);
                monitoringInterval = null;
            }
        };

        process.on('exit', stopMonitoring);
        process.on('SIGINT', stopMonitoring);
        process.on('SIGTERM', stopMonitoring);

        return this;
    }

    _outputPerformanceStats(stats, outputFile) {
        const output = JSON.stringify(stats, null, 2);
        
        if (outputFile) {
            const fs = require('fs');
            fs.appendFileSync(outputFile, output + '\n');
        } else {
            console.log('Performance Stats:', output);
        }
    }

    /**
     * Check if debugging tools are available
     */
    hasDebuggingSupport() {
        const debugInfo = this.getDebuggingInfo();
        return {
            inspector: debugInfo.features.inspector,
            isDebugging: debugInfo.debugging.isDebugging,
            debugPort: debugInfo.debugging.debugPort,
            hasAsyncHooks: debugInfo.features.async_hooks,
            hasWorkerThreads: debugInfo.features.worker_threads
        };
    }

    /**
     * Setup debugging-friendly error handling
     */
    enableDebugMode(options = {}) {
        const {
            verboseErrors = true,
            stackTraces = true,
            asyncStackTraces = true,
            unhandledRejections = true
        } = options;

        if (verboseErrors) {
            this._verboseErrors = true;
        }

        if (stackTraces) {
            Error.stackTraceLimit = Infinity;
        }

        if (asyncStackTraces && this.hasDebuggingSupport().hasAsyncHooks) {
            // Enable async stack traces if available
            try {
                const asyncHooks = require('async_hooks');
                // This is a simplified implementation - full async stack traces require more complex setup
                process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --async-stack-traces';
            } catch (error) {
                console.warn('Failed to enable async stack traces:', error.message);
            }
        }

        if (unhandledRejections) {
            process.on('unhandledRejection', (reason, promise) => {
                console.error('Unhandled Promise Rejection at:', promise);
                console.error('Reason:', reason);
                if (reason instanceof Error && reason.stack) {
                    console.error('Stack:', reason.stack);
                }
            });
        }

        return this;
    }

    /**
     * Configure stream interface
     */
    configureStreams(options = {}) {
        this._streamInterface = nodeJSIntegration.createStreamInterface(options);
        
        // Update output configuration to use new streams
        this._outputConfiguration = {
            ...this._outputConfiguration,
            writeOut: (str) => this._streamInterface.write(str),
            writeErr: (str) => this._streamInterface.writeError(str),
            getOutHelpWidth: () => this._streamInterface.dimensions.output?.columns,
            getErrHelpWidth: () => this._streamInterface.dimensions.error?.columns,
            getOutHasColors: () => this._streamInterface.hasColors.output,
            getErrHasColors: () => this._streamInterface.hasColors.error
        };
        
        return this;
    }

    /**
     * Get current stream interface
     */
    getStreamInterface() {
        return this._streamInterface;
    }

    /**
     * Enhanced environment variable option handling
     */
    envOption(flags, description, envVar, options = {}) {
        const option = new Option(flags, description);
        option.env(envVar);
        
        // Get environment variable with enhanced processing
        try {
            const envValue = nodeJSIntegration.getEnvironmentVariable(envVar, {
                defaultValue: options.defaultValue,
                type: options.type || 'string',
                required: options.required || false,
                transform: options.transform
            });
            
            if (envValue !== undefined) {
                option.default(envValue);
                // Set the source as environment
                this.setOptionValueWithSource(option.attributeName(), envValue, 'env');
            }
        } catch (error) {
            if (options.required) {
                throw new CommanderError(`Environment variable error: ${error.message}`);
            }
            // If not required, continue with default value
            if (options.defaultValue !== undefined) {
                option.default(options.defaultValue);
            }
        }
        
        return this.addOption(option);
    }

    /**
     * Create multiple environment variable options at once
     */
    envOptions(envVarMap) {
        for (const [envVar, config] of Object.entries(envVarMap)) {
            const {
                flags,
                description,
                ...options
            } = config;
            
            this.envOption(flags, description, envVar, options);
        }
        return this;
    }

    /**
     * Load environment variables from .env file
     */
    loadEnvFile(filePath = '.env', options = {}) {
        const {
            override = false,
            encoding = 'utf8',
            required = false
        } = options;

        try {
            const fs = require('fs');
            const path = require('path');
            
            const envPath = path.resolve(filePath);
            
            if (!fs.existsSync(envPath)) {
                if (required) {
                    throw new Error(`Environment file not found: ${envPath}`);
                }
                return this;
            }

            const envContent = fs.readFileSync(envPath, encoding);
            const envLines = envContent.split('\n');

            for (const line of envLines) {
                const trimmedLine = line.trim();
                
                // Skip empty lines and comments
                if (!trimmedLine || trimmedLine.startsWith('#')) {
                    continue;
                }

                // Parse KEY=VALUE format
                const equalIndex = trimmedLine.indexOf('=');
                if (equalIndex === -1) {
                    continue;
                }

                const key = trimmedLine.substring(0, equalIndex).trim();
                let value = trimmedLine.substring(equalIndex + 1).trim();

                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }

                // Set environment variable if not exists or override is true
                if (!process.env[key] || override) {
                    nodeJSIntegration.setEnvironmentVariable(key, value);
                }
            }
        } catch (error) {
            throw new CommanderError(`Failed to load environment file: ${error.message}`);
        }

        return this;
    }

    /**
     * Get all environment variables with a prefix
     */
    getEnvWithPrefix(prefix, options = {}) {
        const {
            stripPrefix = true,
            transform = null,
            type = 'string'
        } = options;

        const result = {};
        
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith(prefix)) {
                const resultKey = stripPrefix ? key.substring(prefix.length) : key;
                
                try {
                    const processedValue = nodeJSIntegration.getEnvironmentVariable(key, {
                        type,
                        transform
                    });
                    result[resultKey] = processedValue;
                } catch (error) {
                    // Skip invalid values
                    continue;
                }
            }
        }
        
        return result;
    }

    /**
     * Set multiple environment variables
     */
    setEnvVars(envVars, options = {}) {
        for (const [key, value] of Object.entries(envVars)) {
            nodeJSIntegration.setEnvironmentVariable(key, value, options);
        }
        return this;
    }

    /**
     * Set environment variable
     */
    setEnv(name, value, options = {}) {
        nodeJSIntegration.setEnvironmentVariable(name, value, options);
        return this;
    }

    /**
     * Get environment variable with enhanced processing
     */
    getEnv(name, options = {}) {
        return nodeJSIntegration.getEnvironmentVariable(name, options);
    }

    /**
     * Configure executable directory for subcommands
     */
    executableDir(path) {
        this._executableDir = path;
        return this;
    }

    /**
     * Get information about spawned processes
     */
    getSpawnedProcessInfo() {
        return nodeJSIntegration.getSpawnedProcessInfo();
    }

    /**
     * Kill all spawned processes
     */
    killSpawnedProcesses(signal = 'SIGTERM') {
        nodeJSIntegration.killAllSpawnedProcesses(signal);
        return this;
    }

    /**
     * Enhanced process exit with cleanup
     */
    exit(code = 0) {
        // Kill spawned processes before exiting
        this.killSpawnedProcesses();
        
        if (this._exitCallback) {
            const error = new CommanderError(code, 'commander.exit', 'Process exit requested');
            this._exitCallback(error);
        } else {
            process.exit(code);
        }
    }

    /**
     * Check if running in specific Node.js environment
     */
    isElectron() {
        return !!process.versions?.electron;
    }

    isPkg() {
        return !!process.pkg;
    }

    isTest() {
        return process.env.NODE_ENV === 'test';
    }

    isDebugging() {
        const debugInfo = this.getDebuggingInfo();
        return debugInfo.debugging.isDebugging;
    }

    /**
     * Get platform-specific information
     */
    getPlatformInfo() {
        const nodeInfo = this.getNodeJSInfo();
        return {
            platform: nodeInfo.platform,
            arch: nodeInfo.arch,
            version: nodeInfo.version,
            versions: nodeInfo.versions,
            isWindows: nodeInfo.platform === 'win32',
            isMacOS: nodeInfo.platform === 'darwin',
            isLinux: nodeInfo.platform === 'linux',
            isElectron: this.isElectron(),
            isPkg: this.isPkg(),
            isTest: this.isTest(),
            isDebugging: this.isDebugging()
        };
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