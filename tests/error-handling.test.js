const { Command } = require('../src/index.js');
const { CommanderError, InvalidArgumentError, InvalidOptionArgumentError } = require('../src/errors');

describe('Error Handling and Edge Cases', () => {
  let command;
  let exitSpy;
  let stdoutSpy;
  let stderrSpy;

  beforeEach(() => {
    command = new Command('test');
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('CommanderError Class', () => {
    test('should create CommanderError with message only', () => {
      const error = new CommanderError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.exitCode).toBe(1);
      expect(error.code).toBe('commander.error');
      expect(error.name).toBe('CommanderError');
    });

    test('should create CommanderError with all parameters', () => {
      const error = new CommanderError(2, 'custom.code', 'Custom error message');
      expect(error.message).toBe('Custom error message');
      expect(error.exitCode).toBe(2);
      expect(error.code).toBe('custom.code');
    });

    test('should maintain stack trace', () => {
      const error = new CommanderError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('CommanderError');
    });
  });

  describe('InvalidArgumentError Class', () => {
    test('should create InvalidArgumentError', () => {
      const error = new InvalidArgumentError('Invalid argument value');
      expect(error.message).toBe('Invalid argument value');
      expect(error.exitCode).toBe(1);
      expect(error.code).toBe('commander.invalidArgument');
      expect(error.name).toBe('InvalidArgumentError');
    });

    test('should inherit from CommanderError', () => {
      const error = new InvalidArgumentError('Test');
      expect(error).toBeInstanceOf(CommanderError);
      expect(error).toBeInstanceOf(InvalidArgumentError);
    });
  });

  describe('InvalidOptionArgumentError Class', () => {
    test('should create InvalidOptionArgumentError', () => {
      const option = { flags: '-p, --port <number>' };
      const error = new InvalidOptionArgumentError('Invalid port number', option);
      expect(error.message).toBe('Invalid port number');
      expect(error.option).toBe(option);
      expect(error.code).toBe('commander.invalidOptionArgument');
    });
  });

  describe('Missing Required Options', () => {
    test('should handle missing required option', () => {
      command.requiredOption('-f, --file <path>', 'input file');
      
      expect(() => {
        command._parseWithJS([]);
      }).toThrow(/required option.*file/i);
    });

    test('should show help after error when configured', () => {
      command.showHelpAfterError(true);
      command.requiredOption('-f, --file <path>', 'input file');
      
      command.missingMandatoryOptionValue(command.options[0]);
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('required option'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('should show custom help message after error', () => {
      command.showHelpAfterError('Use --help for usage information');
      command.requiredOption('-f, --file <path>', 'input file');
      
      command.missingMandatoryOptionValue(command.options[0]);
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Use --help for usage'));
    });
  });

  describe('Unknown Options', () => {
    test('should handle unknown option', () => {
      command.unknownOption('--invalid');
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('unknown option'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('should allow unknown options when configured', () => {
      command.allowUnknownOption(true);
      
      const result = command._parseWithJS(['--unknown', 'value']);
      expect(result.arguments).toContain('--unknown');
      expect(result.arguments).toContain('value');
    });

    test('should pass through unknown options when configured', () => {
      command.passThroughOptions(true);
      
      const result = command._parseWithJS(['--unknown', 'value', 'arg']);
      expect(result.arguments).toContain('--unknown');
      expect(result.arguments).toContain('value');
      expect(result.arguments).toContain('arg');
    });

    test('should use custom unknown option handler', () => {
      const handler = jest.fn();
      command.setUnknownOptionHandler(handler);
      
      command._parseWithJS(['--custom', 'value']);
      
      expect(handler).toHaveBeenCalledWith('--custom', 'value');
    });
  });

  describe('Missing Option Arguments', () => {
    test('should handle missing option argument', () => {
      command.option('-f, --file <path>', 'input file');
      
      expect(() => {
        command._parseWithJS(['--file']);
      }).toThrow(/option.*file.*requires.*value/i);
    });

    test('should handle missing option argument with custom message', () => {
      const option = command.createOption('-f, --file <path>', 'input file');
      command.addOption(option);
      
      command.optionMissingArgument(option);
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('argument missing'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Invalid Option Values', () => {
    test('should handle invalid option parser', () => {
      const parseNumber = (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          throw new Error(`Invalid number: ${value}`);
        }
        return num;
      };
      
      command.option('-p, --port <number>', 'port number', parseNumber);
      
      expect(() => {
        command._parseWithJS(['--port', 'invalid']);
      }).toThrow(/invalid number/i);
    });

    test('should handle choice validation errors', () => {
      const option = command.createOption('-l, --level <level>', 'log level');
      option.choices(['debug', 'info', 'warn', 'error']);
      command.addOption(option);
      
      expect(() => {
        command._parseWithJS(['--level', 'invalid']);
      }).toThrow(/invalid choice/i);
    });

    test('should handle custom option validation', () => {
      const validator = (value) => {
        if (parseInt(value) < 1024) {
          return { valid: false, message: 'Port must be >= 1024' };
        }
        return { valid: true, value: parseInt(value) };
      };
      
      command.validatedOption('-p, --port <number>', 'port number', validator);
      
      expect(() => {
        command._parseWithJS(['--port', '80']);
      }).toThrow(/port must be >= 1024/i);
    });
  });

  describe('Missing Required Arguments', () => {
    test('should handle missing required argument', () => {
      command.argument('<file>', 'input file');
      
      command.missingArgument('file');
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('missing required argument'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('should validate required arguments during parsing', () => {
      command.argument('<source>', 'source file');
      command.argument('<dest>', 'destination file');
      
      expect(() => {
        command._parseWithJS(['source.txt']);
      }).toThrow(/missing required argument/i);
    });
  });

  describe('Excess Arguments', () => {
    test('should handle excess arguments', () => {
      command.argument('<file>', 'input file');
      
      expect(() => {
        command._parseWithJS(['file1.txt', 'file2.txt', 'file3.txt']);
      }).toThrow(/too many arguments/i);
    });

    test('should allow excess arguments when configured', () => {
      command.allowExcessArguments(true);
      command.argument('<file>', 'input file');
      
      const result = command._parseWithJS(['file1.txt', 'file2.txt', 'file3.txt']);
      expect(result.arguments).toEqual(['file1.txt']);
    });

    test('should use custom excess argument handler', () => {
      const handler = jest.fn();
      command.setExcessArgumentHandler(handler);
      command.argument('<file>', 'input file');
      
      command._parseWithJS(['file1.txt', 'file2.txt', 'file3.txt']);
      
      expect(handler).toHaveBeenCalledWith(['file2.txt', 'file3.txt']);
    });
  });

  describe('Unknown Commands', () => {
    test('should handle unknown command', () => {
      command.command('build', 'build project');
      command.args = ['unknown'];
      
      command.unknownCommand();
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('unknown command'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    test('should show suggestions for unknown commands', () => {
      command.showSuggestionAfterError(true);
      command.command('build', 'build project');
      command.args = ['buil'];
      
      command.unknownCommand();
      
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('build'));
    });

    test('should use custom suggestion generator', () => {
      const generator = jest.fn().mockReturnValue('Did you mean "custom"?');
      command.setSuggestionGenerator(generator);
      command.args = ['unknown'];
      
      const suggestion = command.generateSuggestion('unknown');
      
      expect(generator).toHaveBeenCalledWith('unknown', []);
      expect(suggestion).toBe('Did you mean "custom"?');
    });
  });

  describe('Conflicting Options', () => {
    test('should handle conflicting options', () => {
      command.conflictingOption('-v, --verbose', 'verbose output', ['quiet']);
      command.conflictingOption('-q, --quiet', 'quiet output', ['verbose']);
      
      expect(() => {
        command._parseWithJS(['--verbose', '--quiet']);
      }).toThrow(/cannot be used with/i);
    });

    test('should detect option conflicts during validation', () => {
      const verboseOpt = command.createOption('-v, --verbose', 'verbose output');
      verboseOpt.conflicts(['quiet']);
      command.addOption(verboseOpt);
      
      const quietOpt = command.createOption('-q, --quiet', 'quiet output');
      command.addOption(quietOpt);
      
      command.setOptionValue('verbose', true);
      command.setOptionValueWithSource('verbose', true, 'cli');
      command.setOptionValue('quiet', true);
      command.setOptionValueWithSource('quiet', true, 'cli');
      
      expect(() => {
        command._validateOptionConstraints();
      }).toThrow(/cannot be used with/i);
    });
  });

  describe('Exit Override', () => {
    test('should use exit override for errors', () => {
      const exitHandler = jest.fn();
      command.exitOverride(exitHandler);
      
      command.error('Test error');
      
      expect(exitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test error',
          exitCode: 1
        })
      );
      expect(exitSpy).not.toHaveBeenCalled();
    });

    test('should use default exit override', () => {
      command.exitOverride();
      
      expect(() => {
        command.error('Test error');
      }).toThrow(CommanderError);
    });

    test('should handle async command errors with exit override', () => {
      const exitHandler = jest.fn();
      command.exitOverride(exitHandler);
      
      const error = new CommanderError(1, 'commander.executeSubCommandAsync', 'Async error');
      command._exitCallback(error);
      
      expect(exitHandler).toHaveBeenCalledWith(error);
    });
  });

  describe('Error Display Configuration', () => {
    test('should configure error output', () => {
      const errorConfig = {
        showHelpAfterError: true,
        showSuggestionAfterError: false,
        suggestionGenerator: jest.fn()
      };
      
      command.configureError(errorConfig);
      
      expect(command._showHelpAfterError).toBe(true);
      expect(command._showSuggestionAfterError).toBe(false);
      expect(command._suggestionGenerator).toBe(errorConfig.suggestionGenerator);
    });

    test('should write error output using configured writer', () => {
      const writeErr = jest.fn();
      command.configureOutput({ writeErr });
      
      command.outputError('Test error message');
      
      expect(writeErr).toHaveBeenCalledWith('Test error message');
    });

    test('should write output using configured writer', () => {
      const writeOut = jest.fn();
      command.configureOutput({ writeOut });
      
      command.writeOut('Test output');
      
      expect(writeOut).toHaveBeenCalledWith('Test output');
    });
  });

  describe('Parsing Edge Cases', () => {
    test('should handle empty argument array', () => {
      const result = command._parseWithJS([]);
      expect(result.arguments).toEqual([]);
      expect(result.options).toEqual({});
    });

    test('should handle double dash separator', () => {
      command.option('-v, --verbose', 'verbose output');
      command.argument('[files...]', 'input files');
      
      const result = command._parseWithJS(['-v', '--', '--not-an-option', 'file.txt']);
      expect(result.options.verbose).toBe(true);
      expect(result.arguments).toContain('--not-an-option');
      expect(result.arguments).toContain('file.txt');
    });

    test('should handle combined short options', () => {
      command.option('-a', 'option a');
      command.option('-b', 'option b');
      command.option('-c', 'option c');
      
      const result = command._parseWithJS(['-abc']);
      expect(result.options.a).toBe(true);
      expect(result.options.b).toBe(true);
      expect(result.options.c).toBe(true);
    });

    test('should handle option with equals sign', () => {
      command.option('-p, --port <number>', 'port number');
      
      const result = command._parseWithJS(['--port=8080']);
      expect(result.options.port).toBe('8080');
    });

    test('should handle negated boolean options', () => {
      command.negatableOption('--color', 'colorize output');
      
      let result = command._parseWithJS(['--color']);
      expect(result.options.color).toBe(true);
      
      result = command._parseWithJS(['--no-color']);
      expect(result.options.color).toBe(false);
    });
  });

  describe('Environment Variable Errors', () => {
    test('should handle invalid environment variable values', () => {
      process.env.TEST_PORT = 'invalid';
      
      const parseNumber = (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          throw new Error(`Invalid number: ${value}`);
        }
        return num;
      };
      
      command.option('-p, --port <number>', 'port number', parseNumber);
      command.options[0].envVar = 'TEST_PORT';
      
      expect(() => {
        command._parseWithJS([]);
      }).toThrow(/invalid environment variable/i);
      
      delete process.env.TEST_PORT;
    });

    test('should handle missing required environment variables', () => {
      command.envOption('-k, --key <key>', 'API key', 'MISSING_KEY', { required: true });
      
      expect(() => {
        command._parseWithJS([]);
      }).toThrow(/environment variable error/i);
    });
  });

  describe('Action Execution Errors', () => {
    test('should handle action execution errors', () => {
      const errorAction = () => {
        throw new Error('Action failed');
      };
      
      command.action(errorAction);
      
      expect(() => {
        command._parseWithJS([]);
      }).toThrow('Action failed');
    });

    test('should handle async action errors', async () => {
      const asyncErrorAction = async () => {
        throw new Error('Async action failed');
      };
      
      command.asyncAction(asyncErrorAction);
      
      await expect(
        command._parseCommandAsync([], [])
      ).rejects.toThrow('Async action failed');
    });

    test('should execute post-action hooks even when action fails', async () => {
      const postHook = jest.fn();
      const errorAction = async () => {
        throw new Error('Action failed');
      };
      
      command.hook('postAction', postHook);
      command.asyncAction(errorAction);
      
      await expect(
        command._parseCommandAsync([], [])
      ).rejects.toThrow('Action failed');
      
      expect(postHook).toHaveBeenCalled();
    });
  });

  describe('Hook Execution Errors', () => {
    test('should handle hook execution errors', async () => {
      const errorHook = () => {
        throw new Error('Hook failed');
      };
      
      command.hook('preAction', errorHook);
      
      await expect(
        command.executeHooks('preAction')
      ).rejects.toThrow(/preAction hook failed/);
    });

    test('should handle async hook errors', async () => {
      const asyncErrorHook = async () => {
        throw new Error('Async hook failed');
      };
      
      command.hook('preAction', asyncErrorHook);
      
      await expect(
        command.executeHooks('preAction')
      ).rejects.toThrow(/preAction hook failed/);
    });
  });

  describe('WASM Integration Error Handling', () => {
    test('should handle WASM loading failures gracefully', async () => {
      // Mock WASM loading failure
      const originalWarn = console.warn;
      console.warn = jest.fn();
      
      const cmd = new Command('test-wasm');
      
      // Should not throw, should fall back to JavaScript
      expect(cmd._wasmCommandId).toBeDefined();
      
      console.warn = originalWarn;
    });

    test('should handle WASM operation failures', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Test that WASM errors are handled gracefully
      await command._addOptionToWASM({ flags: '-t, --test' });
      
      // Should not throw, should log warning
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Complex Error Scenarios', () => {
    test('should handle multiple validation errors', () => {
      command.requiredOption('-f, --file <path>', 'input file');
      command.requiredOption('-o, --output <path>', 'output file');
      command.argument('<command>', 'command to run');
      
      expect(() => {
        command._parseWithJS([]);
      }).toThrow(); // Should throw for first missing requirement
    });

    test('should handle nested command errors', () => {
      const sub = command.command('sub', 'subcommand');
      sub.requiredOption('-r, --required <value>', 'required option');
      
      expect(() => {
        sub._parseWithJS([]);
      }).toThrow(/required option/i);
    });

    test('should handle option group validation errors', () => {
      const group = command.createOptionGroup('test', 'Test group');
      group.setRequired(true);
      group.addOption(command.createOption('-a, --option-a', 'option a'));
      group.addOption(command.createOption('-b, --option-b', 'option b'));
      
      command.addOptionGroup(group);
      
      expect(() => {
        command._parseWithJS([]);
      }).toThrow(/at least one option.*required/i);
    });
  });
});