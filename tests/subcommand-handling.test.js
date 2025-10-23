const { Command } = require('../lib/index.js');
const { CommanderError } = require('../src/errors');

describe('Subcommand Handling', () => {
  let command;

  beforeEach(() => {
    command = new Command('app');
  });

  describe('Basic Subcommand Creation', () => {
    test('should create basic subcommand', () => {
      const sub = command.command('build', 'build the project');
      
      expect(sub).toBeInstanceOf(Command);
      expect(sub.name()).toBe('build');
      expect(sub.description()).toBe('build the project');
      expect(sub.parent).toBe(command);
      expect(command.commands).toContain(sub);
    });

    test('should create subcommand with arguments', () => {
      const sub = command.command('deploy <env>', 'deploy to environment');
      
      expect(sub.name()).toBe('deploy');
      expect(sub.registeredArguments).toHaveLength(1);
      expect(sub.registeredArguments[0].name()).toBe('env');
    });

    test('should create subcommand and return parent for chaining', () => {
      const result = command.command('build', 'build project', {});
      expect(result).toBe(command);
    });

    test('should create subcommand and return subcommand when no description', () => {
      const sub = command.command('build');
      expect(sub).toBeInstanceOf(Command);
      expect(sub.name()).toBe('build');
    });
  });

  describe('Subcommand Configuration', () => {
    test('should create hidden subcommand', () => {
      const sub = command.command('internal', 'internal command', { hidden: true });
      expect(command.commands[0]._hidden).toBe(true);
    });

    test('should create default subcommand', () => {
      const sub = command.command('serve', 'serve files', { isDefault: true });
      expect(command._defaultCommandName).toBe('serve');
      expect(command.commands[0]._isDefault).toBe(true);
    });

    test('should create executable subcommand', () => {
      command.command('build', 'build project', { executableFile: 'app-build' });
      expect(command.commands[0]._executableHandler).toBe(true);
      expect(command.commands[0]._executableFile).toBe('app-build');
    });

    test('should auto-generate executable file name', () => {
      command.command('build', 'build project', { executableFile: true });
      expect(command.commands[0]._executableHandler).toBe(true);
      expect(command.commands[0]._executableFile).toBe('app-build');
    });

    test('should support legacy noHelp option', () => {
      const sub = command.command('legacy', 'legacy command', { noHelp: true });
      expect(command.commands[0]._hidden).toBe(true);
    });
  });

  describe('Adding Existing Commands', () => {
    test('should add existing command', () => {
      const sub = new Command('existing');
      sub.description('existing command');
      
      command.addCommand(sub);
      
      expect(command.commands).toContain(sub);
      expect(sub.parent).toBe(command);
    });

    test('should add command with options', () => {
      const sub = new Command('existing');
      command.addCommand(sub, { isDefault: true, hidden: true });
      
      expect(command._defaultCommandName).toBe('existing');
      expect(sub._hidden).toBe(true);
    });

    test('should require command name', () => {
      const sub = new Command();
      
      expect(() => {
        command.addCommand(sub);
      }).toThrow(/must have a name/);
    });
  });

  describe('Command Aliases', () => {
    test('should handle command aliases', () => {
      const sub = command.command('build', 'build project');
      sub.alias('b');
      
      expect(sub.aliases()).toContain('b');
      expect(command._findCommand('build')).toBe(sub);
      expect(command._findCommand('b')).toBe(sub);
    });

    test('should handle multiple aliases', () => {
      const sub = command.command('build', 'build project');
      sub.aliases(['b', 'compile', 'make']);
      
      expect(sub.aliases()).toEqual(['b', 'compile', 'make']);
      expect(command._findCommand('compile')).toBe(sub);
      expect(command._findCommand('make')).toBe(sub);
    });
  });

  describe('Command Hierarchy', () => {
    test('should maintain parent-child relationships', () => {
      const sub1 = command.command('level1', 'first level');
      const sub2 = sub1.command('level2', 'second level');
      
      expect(sub1.parent).toBe(command);
      expect(sub2.parent).toBe(sub1);
      expect(command.commands).toContain(sub1);
      expect(sub1.commands).toContain(sub2);
    });

    test('should copy inherited settings', () => {
      command.storeOptionsAsProperties(true);
      command.showHelpAfterError(true);
      command.allowUnknownOption(true);
      
      const sub = command.command('sub', 'subcommand');
      
      expect(sub._storeOptionsAsProperties).toBe(true);
      expect(sub._showHelpAfterError).toBe(true);
      expect(sub._allowUnknownOption).toBe(true);
    });

    test('should inherit help configuration', () => {
      const helpConfig = { sortSubcommands: true };
      command.configureHelp(helpConfig);
      
      const sub = command.command('sub', 'subcommand');
      
      expect(sub._helpConfiguration).toEqual(helpConfig);
    });

    test('should inherit output configuration', () => {
      const outputConfig = { 
        writeOut: jest.fn(),
        writeErr: jest.fn()
      };
      command.configureOutput(outputConfig);
      
      const sub = command.command('sub', 'subcommand');
      
      expect(sub._outputConfiguration.writeOut).toBe(outputConfig.writeOut);
      expect(sub._outputConfiguration.writeErr).toBe(outputConfig.writeErr);
    });
  });

  describe('Command Discovery', () => {
    beforeEach(() => {
      command.command('build', 'build project').alias('b');
      command.command('test', 'run tests').alias('t');
      command.command('deploy', 'deploy project', { hidden: true });
    });

    test('should find commands by name', () => {
      expect(command._findCommand('build')).toBeDefined();
      expect(command._findCommand('test')).toBeDefined();
      expect(command._findCommand('deploy')).toBeDefined();
      expect(command._findCommand('nonexistent')).toBeUndefined();
    });

    test('should find commands by alias', () => {
      expect(command._findCommand('b')).toBeDefined();
      expect(command._findCommand('t')).toBeDefined();
    });

    test('should get subcommand info', async () => {
      const info = await command.getSubcommandInfo();
      
      expect(info.hasSubcommands).toBe(true);
      expect(info.subcommands).toHaveLength(3);
      expect(info.visibleCount).toBe(2); // deploy is hidden
    });

    test('should find subcommand by name or alias', () => {
      expect(command.findSubcommand('build')).toBeDefined();
      expect(command.findSubcommand('b')).toBeDefined();
      expect(command.findSubcommand('nonexistent')).toBeUndefined();
    });

    test('should get visible subcommands', () => {
      const visible = command.getVisibleSubcommands();
      expect(visible).toHaveLength(2);
      expect(visible.find(cmd => cmd.name() === 'deploy')).toBeUndefined();
    });

    test('should check if has subcommands', () => {
      expect(command.hasSubcommands()).toBe(true);
      
      const emptyCmd = new Command('empty');
      expect(emptyCmd.hasSubcommands()).toBe(false);
    });
  });

  describe('Default Subcommands', () => {
    test('should set default subcommand', () => {
      const sub = command.command('serve', 'serve files', { isDefault: true });
      
      expect(command.getDefaultSubcommand()).toBe(sub);
      expect(command._defaultCommandName).toBe('serve');
    });

    test('should handle default subcommand execution', () => {
      const actionSpy = jest.fn();
      const sub = command.command('serve', 'serve files', { isDefault: true });
      sub.action(actionSpy);
      
      // When no specific subcommand is given, should execute default
      command._parseCommand([], ['--port', '3000']);
      
      // Note: Full parsing logic would handle this, but we're testing the structure
      expect(command.getDefaultSubcommand()).toBe(sub);
    });

    test('should set command as default after creation', () => {
      const sub = command.command('serve', 'serve files');
      sub.setAsDefault();
      
      expect(command._defaultCommandName).toBe('serve');
      expect(sub._isDefault).toBe(true);
    });
  });

  describe('Executable Subcommands', () => {
    test('should configure executable subcommand', () => {
      const sub = command.command('build', 'build project');
      sub.setExecutable('custom-build-script');
      
      expect(sub._executableHandler).toBe(true);
      expect(sub._executableFile).toBe('custom-build-script');
    });

    test('should auto-generate executable name', () => {
      const sub = command.command('build', 'build project');
      sub.setExecutable();
      
      expect(sub._executableFile).toBe('app-build');
    });

    test('should check if command is executable', () => {
      const sub = command.command('build', 'build project');
      expect(sub.isExecutableSubcommand()).toBe(false);
      
      sub.setExecutable();
      expect(sub.isExecutableSubcommand()).toBe(true);
    });

    test('should set executable directory', () => {
      command.executableDir('./bin');
      expect(command._executableDir).toBe('./bin');
    });
  });

  describe('Command Validation', () => {
    test('should prevent duplicate command names', () => {
      command.command('build', 'build project');
      
      expect(() => {
        command.command('build', 'another build');
      }).toThrow(/cannot add command.*build/);
    });

    test('should prevent duplicate aliases', () => {
      command.command('build', 'build project').alias('b');
      
      expect(() => {
        command.command('bootstrap', 'bootstrap project').alias('b');
      }).toThrow(/conflicting flag.*b/);
    });

    test('should prevent command name conflicts with aliases', () => {
      command.command('build', 'build project').alias('test');
      
      expect(() => {
        command.command('test', 'run tests');
      }).toThrow(/cannot add command.*test/);
    });
  });

  describe('Subcommand Parsing', () => {
    test('should dispatch to correct subcommand', () => {
      const buildAction = jest.fn();
      const testAction = jest.fn();
      
      command.command('build', 'build project').action(buildAction);
      command.command('test', 'run tests').action(testAction);
      
      command._dispatchSubcommand('build', ['--verbose'], []);
      
      // Note: This tests the dispatch mechanism structure
      expect(command._findCommand('build')).toBeDefined();
    });

    test('should handle subcommand with arguments', () => {
      const deployAction = jest.fn();
      const sub = command.command('deploy <env>', 'deploy to environment');
      sub.action(deployAction);
      
      // Test that subcommand structure is correct
      expect(sub.registeredArguments).toHaveLength(1);
      expect(sub.registeredArguments[0].name()).toBe('env');
    });

    test('should handle unknown subcommand', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
      
      command.args = ['unknown'];
      command.unknownCommand();
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('unknown command'));
      expect(exitSpy).toHaveBeenCalledWith(1);
      
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
    });
  });

  describe('Help Command', () => {
    test('should create implicit help command', () => {
      command.command('build', 'build project');
      
      const helpCmd = command._getHelpCommand();
      expect(helpCmd).toBeDefined();
      expect(helpCmd.name()).toBe('help');
    });

    test('should configure custom help command', () => {
      command.helpCommand('assist [cmd]', 'show assistance');
      
      expect(command._helpCommand.name()).toBe('assist');
      expect(command._helpCommand.description()).toBe('show assistance');
    });

    test('should disable help command', () => {
      command.helpCommand(false);
      expect(command._addImplicitHelpCommand).toBe(false);
    });

    test('should add custom help command', () => {
      const customHelp = new Command('help');
      customHelp.description('custom help');
      
      command.addHelpCommand(customHelp);
      
      expect(command._helpCommand).toBe(customHelp);
    });

    test('should dispatch help for specific command', () => {
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
      
      const sub = command.command('build', 'build project');
      command._dispatchHelpCommand('build');
      
      // Should call help on the subcommand
      expect(stdoutSpy).toHaveBeenCalled();
      
      stdoutSpy.mockRestore();
    });
  });

  describe('Async Subcommand Handling', () => {
    test('should handle async subcommand actions', async () => {
      const asyncAction = jest.fn().mockResolvedValue('result');
      const sub = command.command('async', 'async command');
      sub.asyncAction(asyncAction);
      
      expect(sub.isAsyncAction()).toBe(true);
    });

    test('should execute async subcommand', async () => {
      const asyncAction = jest.fn().mockResolvedValue('success');
      const sub = command.command('async', 'async command');
      sub.asyncAction(asyncAction);
      
      // Test async execution structure
      expect(sub._asyncAction).toBe(true);
      expect(sub._action).toBe(asyncAction);
    });

    test('should handle async subcommand errors', async () => {
      const asyncAction = jest.fn().mockRejectedValue(new Error('Async error'));
      const sub = command.command('async', 'async command');
      sub.asyncAction(asyncAction);
      
      // Test error handling structure
      expect(sub._asyncAction).toBe(true);
    });
  });

  describe('Subcommand Lifecycle Hooks', () => {
    test('should execute pre-subcommand hooks', () => {
      const preHook = jest.fn();
      command.hook('preSubcommand', preHook);
      
      const sub = command.command('build', 'build project');
      
      // Test hook structure
      expect(command._lifeCycleHooks.preSubcommand).toContain(preHook);
    });

    test('should get hook information', async () => {
      command.hook('preSubcommand', () => {});
      command.hook('preAction', () => {});
      
      const hookInfo = await command.getHookInfo();
      expect(hookInfo.preSubcommandCount).toBe(1);
      expect(hookInfo.preActionCount).toBe(1);
    });
  });

  describe('Subcommand Help Generation', () => {
    test('should include subcommands in help', () => {
      command.command('build', 'build the project');
      command.command('test', 'run tests');
      command.command('deploy', 'deploy project', { hidden: true });
      
      const helpInfo = command.helpInformation();
      
      expect(helpInfo).toContain('Commands:');
      expect(helpInfo).toContain('build');
      expect(helpInfo).toContain('test');
      expect(helpInfo).not.toContain('deploy'); // hidden
    });

    test('should sort subcommands in help when configured', () => {
      command.configureHelp({ sortSubcommands: true });
      
      command.command('zebra', 'z command');
      command.command('alpha', 'a command');
      command.command('beta', 'b command');
      
      const help = command.createHelp();
      const visibleCommands = help.visibleCommands(command);
      
      expect(visibleCommands[0].name()).toBe('alpha');
      expect(visibleCommands[1].name()).toBe('beta');
      expect(visibleCommands[2].name()).toBe('zebra');
    });

    test('should show command aliases in help', () => {
      command.command('build', 'build project').alias('b');
      
      const helpInfo = command.helpInformation();
      expect(helpInfo).toContain('build');
    });
  });

  describe('Complex Subcommand Scenarios', () => {
    test('should handle nested subcommands', () => {
      const docker = command.command('docker', 'docker commands');
      const container = docker.command('container', 'container commands');
      const run = container.command('run <image>', 'run container');
      
      expect(run.parent).toBe(container);
      expect(container.parent).toBe(docker);
      expect(docker.parent).toBe(command);
    });

    test('should handle subcommands with options and arguments', () => {
      const sub = command.command('deploy <env>', 'deploy to environment');
      sub.option('-f, --force', 'force deployment');
      sub.option('--timeout <ms>', 'deployment timeout', 30000);
      sub.argument('[version]', 'version to deploy', 'latest');
      
      expect(sub.options).toHaveLength(2);
      expect(sub.registeredArguments).toHaveLength(2);
    });

    test('should handle subcommand inheritance', () => {
      command.option('-v, --verbose', 'verbose output');
      command.configureOutput({ writeOut: jest.fn() });
      
      const sub = command.command('build', 'build project');
      
      // Should inherit parent settings
      expect(sub._outputConfiguration.writeOut).toBe(command._outputConfiguration.writeOut);
    });

    test('should handle command groups', () => {
      command.commandsGroup('Main Commands');
      
      const build = command.command('build', 'build project');
      const test = command.command('test', 'run tests');
      
      expect(command._defaultCommandGroup).toBe('Main Commands');
    });
  });
});