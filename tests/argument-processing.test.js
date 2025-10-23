const { Command } = require('../lib/index.js');
const { InvalidArgumentError } = require('../src/errors');

describe('Argument Processing', () => {
  let command;

  beforeEach(() => {
    command = new Command('test');
  });

  describe('Basic Argument Types', () => {
    test('should handle required arguments', () => {
      command.argument('<file>', 'input file');
      
      const result = command._parseWithJS(['test.txt']);
      expect(result.arguments).toEqual(['test.txt']);
    });

    test('should handle optional arguments', () => {
      command.argument('[file]', 'input file', 'default.txt');
      
      // With value provided
      let result = command._parseWithJS(['custom.txt']);
      expect(result.arguments).toEqual(['custom.txt']);
      
      // Without value (should use default)
      result = command._parseWithJS([]);
      expect(result.arguments).toEqual(['default.txt']);
    });

    test('should handle variadic arguments', () => {
      command.argument('<files...>', 'input files');
      
      const result = command._parseWithJS(['file1.txt', 'file2.txt', 'file3.txt']);
      expect(result.arguments).toEqual([['file1.txt', 'file2.txt', 'file3.txt']]);
    });

    test('should handle mixed argument types', () => {
      command.argument('<command>', 'command name');
      command.argument('[target]', 'target directory', 'dist');
      command.argument('[files...]', 'additional files');
      
      const result = command._parseWithJS(['build', 'output', 'src/main.js', 'src/utils.js']);
      expect(result.arguments).toEqual(['build', 'output', ['src/main.js', 'src/utils.js']]);
    });
  });

  describe('Argument Validation', () => {
    test('should validate required arguments', () => {
      command.argument('<file>', 'input file');
      
      expect(() => {
        command._parseWithJS([]);
      }).toThrow(/missing required argument/i);
    });

    test('should validate argument count', () => {
      command.argument('<source>', 'source file');
      command.argument('<dest>', 'destination file');
      
      expect(() => {
        command._parseWithJS(['source.txt', 'dest.txt', 'extra.txt']);
      }).toThrow(/too many arguments/i);
    });

    test('should allow excess arguments when configured', () => {
      command.allowExcessArguments(true);
      command.argument('<file>', 'input file');
      
      const result = command._parseWithJS(['file.txt', 'extra1.txt', 'extra2.txt']);
      expect(result.arguments).toEqual(['file.txt']);
    });
  });

  describe('Argument Parsing', () => {
    test('should parse arguments with custom parser', () => {
      const parseNumber = (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          throw new InvalidArgumentError(`Invalid number: ${value}`);
        }
        return num;
      };
      
      command.argument('<count>', 'number of items', parseNumber);
      
      const result = command._parseWithJS(['42']);
      expect(result.arguments).toEqual([42]);
    });

    test('should handle parser errors', () => {
      const parseNumber = (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          throw new Error(`Invalid number: ${value}`);
        }
        return num;
      };
      
      command.argument('<count>', 'number of items', parseNumber);
      
      expect(() => {
        command._parseWithJS(['not-a-number']);
      }).toThrow(/invalid number/i);
    });

    test('should parse variadic arguments with parser', () => {
      const parseNumber = (value, previous) => {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          throw new Error(`Invalid number: ${value}`);
        }
        return num;
      };
      
      command.argument('<numbers...>', 'list of numbers', parseNumber);
      
      const result = command._parseWithJS(['1', '2', '3']);
      expect(result.arguments).toEqual([[1, 2, 3]]);
    });
  });

  describe('Argument Choices', () => {
    test('should validate argument choices', () => {
      const arg = command.createArgument('<level>', 'log level');
      arg.choices(['debug', 'info', 'warn', 'error']);
      command.addArgument(arg);
      
      const result = command._parseWithJS(['info']);
      expect(result.arguments).toEqual(['info']);
    });

    test('should reject invalid choices', () => {
      const arg = command.createArgument('<level>', 'log level');
      arg.choices(['debug', 'info', 'warn', 'error']);
      command.addArgument(arg);
      
      expect(() => {
        command._parseWithJS(['invalid']);
      }).toThrow(/invalid choice/i);
    });

    test('should handle optional argument choices', () => {
      const arg = command.createArgument('[level]', 'log level');
      arg.choices(['debug', 'info', 'warn', 'error']);
      arg.default('info');
      command.addArgument(arg);
      
      // With valid choice
      let result = command._parseWithJS(['debug']);
      expect(result.arguments).toEqual(['debug']);
      
      // Without choice (should use default)
      result = command._parseWithJS([]);
      expect(result.arguments).toEqual(['info']);
    });
  });

  describe('Argument Description and Help', () => {
    test('should generate argument help text', () => {
      command.argument('<file>', 'input file');
      command.argument('[output]', 'output file', 'result.txt');
      command.argument('<dirs...>', 'directories to process');
      
      const helpInfo = command.helpInformation();
      expect(helpInfo).toContain('<file>');
      expect(helpInfo).toContain('[output]');
      expect(helpInfo).toContain('<dirs...>');
      expect(helpInfo).toContain('input file');
      expect(helpInfo).toContain('output file');
      expect(helpInfo).toContain('directories to process');
    });

    test('should show default values in help', () => {
      command.argument('[output]', 'output file', 'default.txt');
      
      const helpInfo = command.helpInformation();
      expect(helpInfo).toContain('default.txt');
    });

    test('should show choices in help', () => {
      const arg = command.createArgument('<level>', 'log level');
      arg.choices(['debug', 'info', 'warn']);
      command.addArgument(arg);
      
      const helpInfo = command.helpInformation();
      expect(helpInfo).toContain('debug');
      expect(helpInfo).toContain('info');
      expect(helpInfo).toContain('warn');
    });
  });

  describe('Argument Structure Validation', () => {
    test('should prevent required arguments after optional', () => {
      command.argument('[optional]', 'optional argument');
      
      expect(() => {
        command.argument('<required>', 'required argument');
      }).toThrow(/required.*optional/i);
    });

    test('should prevent arguments after variadic', () => {
      command.argument('<files...>', 'input files');
      
      expect(() => {
        command.argument('<output>', 'output file');
      }).toThrow(/variadic/i);
    });

    test('should allow proper argument order', () => {
      expect(() => {
        command.argument('<required1>', 'first required');
        command.argument('<required2>', 'second required');
        command.argument('[optional1]', 'first optional');
        command.argument('[optional2]', 'second optional');
        command.argument('[files...]', 'variadic files');
      }).not.toThrow();
    });
  });

  describe('Complex Argument Scenarios', () => {
    test('should handle command with subcommands and arguments', () => {
      command.argument('<action>', 'action to perform');
      
      const buildCmd = command.command('build <source>', 'build project');
      buildCmd.argument('[target]', 'build target', 'dist');
      
      // Test main command
      let result = command._parseWithJS(['deploy']);
      expect(result.arguments).toEqual(['deploy']);
      
      // Test subcommand (would be handled by subcommand parsing)
      result = buildCmd._parseWithJS(['src/main.js', 'output']);
      expect(result.arguments).toEqual(['src/main.js', 'output']);
    });

    test('should handle arguments with options mixed', () => {
      command.option('-v, --verbose', 'verbose output');
      command.argument('<file>', 'input file');
      command.option('-o, --output <file>', 'output file');
      
      const result = command._parseWithJS(['-v', 'input.txt', '--output', 'result.txt']);
      expect(result.arguments).toEqual(['input.txt']);
      expect(result.options.verbose).toBe(true);
      expect(result.options.output).toBe('result.txt');
    });

    test('should handle positional options when enabled', () => {
      command.enablePositionalOptions(true);
      command.option('-f, --format <type>', 'output format');
      command.setPositionalOption(0, 'format');
      command.argument('[file]', 'input file');
      
      const result = command._parseWithJS(['json', 'data.txt']);
      expect(result.options.format).toBe('json');
      expect(result.arguments).toEqual(['data.txt']);
    });
  });

  describe('Argument Processing with Actions', () => {
    test('should pass processed arguments to action', () => {
      const actionSpy = jest.fn();
      
      command.argument('<file>', 'input file');
      command.argument('[count]', 'number of items', '10');
      command.action(actionSpy);
      
      command._parseWithJS(['test.txt', '5']);
      
      expect(actionSpy).toHaveBeenCalledWith('test.txt', '5', expect.any(Object), command);
    });

    test('should handle variadic arguments in action', () => {
      const actionSpy = jest.fn();
      
      command.argument('<command>', 'command name');
      command.argument('<files...>', 'input files');
      command.action(actionSpy);
      
      command._parseWithJS(['process', 'file1.txt', 'file2.txt', 'file3.txt']);
      
      expect(actionSpy).toHaveBeenCalledWith(
        'process',
        ['file1.txt', 'file2.txt', 'file3.txt'],
        expect.any(Object),
        command
      );
    });

    test('should handle parsed arguments in action', () => {
      const actionSpy = jest.fn();
      const parseNumber = (value) => parseInt(value, 10);
      
      command.argument('<count>', 'number of items', parseNumber);
      command.action(actionSpy);
      
      command._parseWithJS(['42']);
      
      expect(actionSpy).toHaveBeenCalledWith(42, expect.any(Object), command);
    });
  });

  describe('Argument Error Handling', () => {
    test('should provide helpful error messages', () => {
      command.argument('<file>', 'input file');
      command.argument('<count>', 'number of items');
      
      expect(() => {
        command._parseWithJS(['file.txt']);
      }).toThrow(/missing required argument.*count/i);
    });

    test('should handle custom argument validation errors', () => {
      const validateFile = (value) => {
        if (!value.endsWith('.txt')) {
          throw new Error('File must have .txt extension');
        }
        return value;
      };
      
      command.argument('<file>', 'input file', validateFile);
      
      expect(() => {
        command._parseWithJS(['file.pdf']);
      }).toThrow(/txt extension/i);
    });

    test('should handle argument parsing with exit override', () => {
      const exitHandler = jest.fn();
      command.exitOverride(exitHandler);
      command.argument('<file>', 'input file');
      
      command._parseWithJS([]);
      
      expect(exitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          code: expect.stringContaining('missing')
        })
      );
    });
  });

  describe('Argument Compatibility', () => {
    test('should maintain Commander.js argument API', () => {
      // Test that all Commander.js argument methods exist and work
      const arg = command.createArgument('<test>', 'test argument');
      
      expect(typeof arg.name).toBe('function');
      expect(typeof arg.default).toBe('function');
      expect(typeof arg.choices).toBe('function');
      expect(typeof arg.argParser).toBe('function');
      expect(typeof arg.argRequired).toBe('function');
      expect(typeof arg.argOptional).toBe('function');
      
      // Test method chaining
      const result = arg
        .default('default-value')
        .choices(['a', 'b', 'c'])
        .argParser((value) => value.toUpperCase());
      
      expect(result).toBe(arg);
    });

    test('should handle argument description with args description', () => {
      command.description('Test command', {
        file: 'Input file path',
        count: 'Number of items to process'
      });
      
      command.argument('<file>', 'input file');
      command.argument('[count]', 'item count', '1');
      
      expect(command._argsDescription).toBeDefined();
    });

    test('should support legacy arguments method', () => {
      command.arguments('<source> <dest> [options...]');
      
      expect(command.registeredArguments).toHaveLength(3);
      expect(command.registeredArguments[0].name()).toBe('source');
      expect(command.registeredArguments[1].name()).toBe('dest');
      expect(command.registeredArguments[2].name()).toBe('options');
      expect(command.registeredArguments[2].variadic).toBe(true);
    });
  });
});