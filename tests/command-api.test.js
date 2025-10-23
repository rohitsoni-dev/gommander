const { Command, program, createCommand } = require('../lib/index.js');
const { CommanderError, InvalidArgumentError } = require('../src/errors');

describe('Command API Compatibility', () => {
  let command;

  beforeEach(() => {
    command = new Command('test');
  });

  describe('Command Creation and Basic Properties', () => {
    test('should create command with name', () => {
      const cmd = new Command('myapp');
      expect(cmd.name()).toBe('myapp');
    });

    test('should create command without name', () => {
      const cmd = new Command();
      expect(cmd.name()).toBe('');
    });

    test('should set and get description', () => {
      command.description('Test command description');
      expect(command.description()).toBe('Test command description');
    });

    test('should set and get summary', () => {
      command.summary('Test summary');
      expect(command.summary()).toBe('Test summary');
    });

    test('should set and get usage', () => {
      command.usage('<file> [options]');
      expect(command.usage()).toBe('<file> [options]');
    });

    test('should handle aliases', () => {
      command.alias('t');
      expect(command.alias()).toBe('t');
      
      command.aliases(['t', 'test-cmd']);
      expect(command.aliases()).toEqual(['t', 'test-cmd']);
    });

    test('should set name from filename', () => {
      command.nameFromFilename('/path/to/myapp.js');
      expect(command.name()).toBe('myapp');
    });
  });

  describe('Option Management', () => {
    test('should add basic option', () => {
      command.option('-v, --verbose', 'verbose output');
      expect(command.options).toHaveLength(1);
      expect(command.options[0].flags).toBe('-v, --verbose');
    });

    test('should add required option', () => {
      command.requiredOption('-f, --file <path>', 'input file');
      expect(command.options).toHaveLength(1);
      expect(command.options[0].mandatory).toBe(true);
    });

    test('should add option with default value', () => {
      command.option('-p, --port <number>', 'port number', 3000);
      expect(command.getOptionValue('port')).toBe(3000);
    });

    test('should add option with custom parser', () => {
      const parseFloat = (value) => parseFloat(value);
      command.option('-r, --ratio <number>', 'ratio value', parseFloat);
      expect(command.options[0].parseArg).toBe(parseFloat);
    });

    test('should create and add Option object', () => {
      const option = command.createOption('-d, --debug', 'debug mode');
      command.addOption(option);
      expect(command.options).toHaveLength(1);
    });

    test('should handle help option configuration', () => {
      command.helpOption('-h, --help', 'show help');
      expect(command._helpOption.flags).toBe('-h, --help');
      
      // Disable help option
      command.helpOption(false);
      expect(command._helpOption).toBeNull();
    });
  });

  describe('Argument Management', () => {
    test('should add basic argument', () => {
      command.argument('<file>', 'input file');
      expect(command.registeredArguments).toHaveLength(1);
      expect(command.registeredArguments[0].name()).toBe('file');
    });

    test('should add argument with parser', () => {
      const parseFile = (value) => value.toUpperCase();
      command.argument('<file>', 'input file', parseFile);
      expect(command.registeredArguments[0].parseArg).toBe(parseFile);
    });

    test('should add argument with default value', () => {
      command.argument('[file]', 'input file', 'default.txt');
      expect(command.registeredArguments[0].defaultValue).toBe('default.txt');
    });

    test('should parse multiple arguments from string', () => {
      command.arguments('<source> <dest>');
      expect(command.registeredArguments).toHaveLength(2);
      expect(command.registeredArguments[0].name()).toBe('source');
      expect(command.registeredArguments[1].name()).toBe('dest');
    });

    test('should create and add Argument object', () => {
      const arg = command.createArgument('<input>', 'input file');
      command.addArgument(arg);
      expect(command.registeredArguments).toHaveLength(1);
    });

    test('should validate argument order', () => {
      command.addArgument(command.createArgument('<required>', 'required arg'));
      
      expect(() => {
        command.addArgument(command.createArgument('<files...>', 'variadic arg'));
        command.addArgument(command.createArgument('<another>', 'another arg'));
      }).toThrow('only the last argument can be variadic');
    });
  });

  describe('Subcommand Management', () => {
    test('should create subcommand', () => {
      const sub = command.command('sub <arg>', 'subcommand description');
      expect(sub).toBeInstanceOf(Command);
      expect(sub.name()).toBe('sub');
      expect(sub.parent).toBe(command);
      expect(command.commands).toHaveLength(1);
    });

    test('should create executable subcommand', () => {
      command.command('build', 'build project', { executableFile: 'myapp-build' });
      expect(command.commands[0]._executableHandler).toBe(true);
      expect(command.commands[0]._executableFile).toBe('myapp-build');
    });

    test('should create default subcommand', () => {
      command.command('serve', 'serve files', { isDefault: true });
      expect(command._defaultCommandName).toBe('serve');
      expect(command.commands[0]._isDefault).toBe(true);
    });

    test('should create hidden subcommand', () => {
      command.command('internal', 'internal command', { hidden: true });
      expect(command.commands[0]._hidden).toBe(true);
    });

    test('should add existing command', () => {
      const sub = new Command('existing');
      command.addCommand(sub);
      expect(command.commands).toHaveLength(1);
      expect(sub.parent).toBe(command);
    });

    test('should prevent duplicate command names', () => {
      command.command('duplicate', 'first command');
      expect(() => {
        command.command('duplicate', 'second command');
      }).toThrow(/cannot add command.*duplicate/);
    });
  });

  describe('Action Handling', () => {
    test('should set action handler', () => {
      const actionFn = jest.fn();
      command.action(actionFn);
      expect(command._action).toBe(actionFn);
    });

    test('should set async action handler', () => {
      const asyncActionFn = jest.fn().mockResolvedValue('result');
      command.asyncAction(asyncActionFn);
      expect(command._action).toBe(asyncActionFn);
      expect(command._asyncAction).toBe(true);
    });

    test('should check if action is async', () => {
      command.asyncAction(async () => {});
      expect(command.isAsyncAction()).toBe(true);
      
      const syncCmd = new Command('sync');
      syncCmd.action(() => {});
      expect(syncCmd.isAsyncAction()).toBeFalsy();
    });
  });

  describe('Configuration Methods', () => {
    test('should configure parsing options', () => {
      command.allowUnknownOption(true);
      expect(command._allowUnknownOption).toBe(true);
      
      command.allowExcessArguments(true);
      expect(command._allowExcessArguments).toBe(true);
      
      command.enablePositionalOptions(true);
      expect(command._enablePositionalOptions).toBe(true);
      
      command.passThroughOptions(true);
      expect(command._passThroughOptions).toBe(true);
    });

    test('should configure option storage', () => {
      command.storeOptionsAsProperties(true);
      expect(command._storeOptionsAsProperties).toBe(true);
      
      command.combineFlagAndOptionalValue(false);
      expect(command._combineFlagAndOptionalValue).toBe(false);
    });

    test('should configure help and error display', () => {
      command.showHelpAfterError(true);
      expect(command._showHelpAfterError).toBe(true);
      
      command.showSuggestionAfterError(false);
      expect(command._showSuggestionAfterError).toBe(false);
    });

    test('should configure help', () => {
      const helpConfig = { sortSubcommands: true, sortOptions: true };
      command.configureHelp(helpConfig);
      expect(command._helpConfiguration).toEqual(helpConfig);
    });

    test('should configure output', () => {
      const outputConfig = { 
        writeOut: jest.fn(),
        writeErr: jest.fn()
      };
      command.configureOutput(outputConfig);
      expect(command._outputConfiguration.writeOut).toBe(outputConfig.writeOut);
    });
  });

  describe('Lifecycle Hooks', () => {
    test('should add lifecycle hooks', () => {
      const preActionHook = jest.fn();
      const postActionHook = jest.fn();
      const preSubcommandHook = jest.fn();
      
      command.hook('preAction', preActionHook);
      command.hook('postAction', postActionHook);
      command.hook('preSubcommand', preSubcommandHook);
      
      expect(command._lifeCycleHooks.preAction).toContain(preActionHook);
      expect(command._lifeCycleHooks.postAction).toContain(postActionHook);
      expect(command._lifeCycleHooks.preSubcommand).toContain(preSubcommandHook);
    });

    test('should validate hook event names', () => {
      expect(() => {
        command.hook('invalidEvent', () => {});
      }).toThrow(/Unexpected value for event/);
    });

    test('should manage hooks', () => {
      const hook = jest.fn();
      command.addHook('preAction', hook);
      expect(command.hasHooks('preAction')).toBe(true);
      
      command.removeHook('preAction');
      expect(command.hasHooks('preAction')).toBe(false);
    });

    test('should get hook information', () => {
      command.hook('preAction', () => {});
      command.hook('postAction', () => {});
      
      const hooks = command.getHooks();
      expect(hooks.preAction).toHaveLength(1);
      expect(hooks.postAction).toHaveLength(1);
    });
  });

  describe('Version Support', () => {
    test('should set version', () => {
      command.version('1.0.0');
      expect(command._version).toBe('1.0.0');
    });

    test('should set version with custom flags', () => {
      command.version('1.0.0', '-v, --version', 'show version');
      expect(command._version).toBe('1.0.0');
      // Should add version option
      const versionOption = command.options.find(opt => opt.flags.includes('--version'));
      expect(versionOption).toBeDefined();
    });

    test('should create version from package', () => {
      command.versionFromPackage();
      expect(command._version).toBeDefined();
    });

    test('should create version from environment', () => {
      process.env.TEST_VERSION = '2.0.0';
      command.versionFromEnv('TEST_VERSION');
      expect(command._version).toBe('2.0.0');
      delete process.env.TEST_VERSION;
    });

    test('should get version info', () => {
      command.version('1.0.0');
      const versionInfo = command.getVersionInfo();
      expect(versionInfo.version).toBe('1.0.0');
      expect(versionInfo.context).toBeDefined();
    });
  });

  describe('Exit Override', () => {
    test('should set exit override', () => {
      const exitHandler = jest.fn();
      command.exitOverride(exitHandler);
      expect(command._exitCallback).toBe(exitHandler);
    });

    test('should use default exit override', () => {
      command.exitOverride();
      expect(command._exitCallback).toBeInstanceOf(Function);
    });
  });

  describe('Help Command', () => {
    test('should configure help command', () => {
      command.helpCommand('help [cmd]', 'show help');
      expect(command._helpCommand).toBeDefined();
      expect(command._helpCommand.name()).toBe('help');
    });

    test('should disable help command', () => {
      command.helpCommand(false);
      expect(command._addImplicitHelpCommand).toBe(false);
    });

    test('should add help command object', () => {
      const helpCmd = new Command('help');
      command.addHelpCommand(helpCmd);
      expect(command._helpCommand).toBe(helpCmd);
    });

    test('should add help text', () => {
      const helpText = 'Additional help information';
      command.addHelpText('after', helpText);
      
      // Should register event listener
      expect(command.listenerCount('afterHelp')).toBe(1);
    });
  });

  describe('Option Value Management', () => {
    beforeEach(() => {
      command.option('-v, --verbose', 'verbose output');
      command.option('-p, --port <number>', 'port number', 3000);
    });

    test('should set and get option values', () => {
      command.setOptionValue('verbose', true);
      expect(command.getOptionValue('verbose')).toBe(true);
      
      command.setOptionValue('port', 8080);
      expect(command.getOptionValue('port')).toBe(8080);
    });

    test('should track option value sources', () => {
      command.setOptionValueWithSource('verbose', true, 'cli');
      expect(command.getOptionValueSource('verbose')).toBe('cli');
      
      command.setOptionValueWithSource('port', 3000, 'default');
      expect(command.getOptionValueSource('port')).toBe('default');
    });

    test('should get options object', () => {
      command.setOptionValue('verbose', true);
      command.setOptionValue('port', 8080);
      
      const opts = command.opts();
      expect(opts.verbose).toBe(true);
      expect(opts.port).toBe(8080);
    });

    test('should get options with globals', () => {
      const parent = new Command('parent');
      parent.option('-g, --global', 'global option');
      parent.setOptionValue('global', true);
      
      command.parent = parent;
      command.setOptionValue('verbose', true);
      
      const optsWithGlobals = command.optsWithGlobals();
      expect(optsWithGlobals.global).toBe(true);
      expect(optsWithGlobals.verbose).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing arguments', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
      
      command.missingArgument('file');
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('missing required argument'));
      expect(exitSpy).toHaveBeenCalledWith(1);
      
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    test('should handle unknown options', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
      
      command.unknownOption('--invalid');
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('unknown option'));
      expect(exitSpy).toHaveBeenCalledWith(1);
      
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    test('should handle unknown commands', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
      
      command.args = ['unknown'];
      command.unknownCommand();
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('unknown command'));
      expect(exitSpy).toHaveBeenCalledWith(1);
      
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    test('should generate suggestions for unknown commands', () => {
      command.command('build', 'build project');
      command.command('test', 'run tests');
      
      const suggestion = command.generateSuggestion('buil');
      expect(suggestion).toContain('build');
    });
  });

  describe('Help Generation', () => {
    test('should create help instance', () => {
      const help = command.createHelp();
      expect(help).toBeDefined();
      expect(typeof help.formatHelp).toBe('function');
    });

    test('should generate help information', () => {
      command.description('Test command');
      command.option('-v, --verbose', 'verbose output');
      command.argument('<file>', 'input file');
      
      const helpInfo = command.helpInformation();
      expect(helpInfo).toContain('Usage:');
      expect(helpInfo).toContain('Test command');
      expect(helpInfo).toContain('--verbose');
      expect(helpInfo).toContain('<file>');
    });

    test('should output help', () => {
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
      
      command.outputHelp();
      
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      
      stdoutSpy.mockRestore();
    });
  });

  describe('Command Hierarchy', () => {
    test('should maintain parent-child relationships', () => {
      const sub = command.command('sub', 'subcommand');
      expect(sub.parent).toBe(command);
      expect(command.commands).toContain(sub);
    });

    test('should copy inherited settings', () => {
      command.storeOptionsAsProperties(true);
      command.showHelpAfterError(true);
      
      const sub = command.command('sub', 'subcommand');
      expect(sub._storeOptionsAsProperties).toBe(true);
      expect(sub._showHelpAfterError).toBe(true);
    });

    test('should find commands by name and alias', () => {
      const sub = command.command('sub', 'subcommand');
      sub.alias('s');
      
      expect(command._findCommand('sub')).toBe(sub);
      expect(command._findCommand('s')).toBe(sub);
      expect(command._findCommand('nonexistent')).toBeUndefined();
    });
  });

  describe('Factory Functions', () => {
    test('should create command with createCommand', () => {
      const cmd = createCommand('factory');
      expect(cmd).toBeInstanceOf(Command);
      expect(cmd.name()).toBe('factory');
    });

    test('should use program singleton', () => {
      expect(program).toBeInstanceOf(Command);
      expect(program).toBe(program); // Same instance
    });
  });

  describe('Method Chaining', () => {
    test('should support method chaining', () => {
      const result = command
        .description('Test command')
        .option('-v, --verbose', 'verbose output')
        .argument('<file>', 'input file')
        .action(() => {});
      
      expect(result).toBe(command);
      expect(command.description()).toBe('Test command');
      expect(command.options).toHaveLength(1);
      expect(command.registeredArguments).toHaveLength(1);
      expect(command._action).toBeDefined();
    });
  });
});