const { Command } = require('../src/command');
const { Option } = require('../src/option');
const { OptionProcessor, OptionGroup, OptionParsers } = require('../src/option-processor');

describe('Option Processing System', () => {
  let command;

  beforeEach(() => {
    command = new Command('test');
  });

  describe('Boolean Options', () => {
    test('should handle basic boolean options', () => {
      command.booleanOption('-v, --verbose', 'verbose output');
      
      const result = command._parseWithJS(['--verbose']);
      expect(result.options.verbose).toBe(true);
    });

    test('should handle short boolean flags', () => {
      command.booleanOption('-v, --verbose', 'verbose output');
      
      const result = command._parseWithJS(['-v']);
      expect(result.options.verbose).toBe(true);
    });

    test('should use default value when not provided', () => {
      command.booleanOption('-v, --verbose', 'verbose output', false);
      
      const result = command._parseWithJS([]);
      expect(result.options.verbose).toBe(false);
    });
  });

  describe('Negatable Options', () => {
    test('should handle negatable options', () => {
      command.negatableOption('--color', 'colorize output');
      
      const result1 = command._parseWithJS(['--color']);
      expect(result1.options.color).toBe(true);
      
      // Reset for second test
      command._optionProcessor = new OptionProcessor();
      command.negatableOption('--color', 'colorize output');
      
      const result2 = command._parseWithJS(['--no-color']);
      expect(result2.options.color).toBe(false);
    });

    test('should recognize negated flags', () => {
      const option = Option.createNegatable('--color', 'colorize output');
      
      expect(option.is('color')).toBe(true);
      expect(option.is('no-color')).toBe(true);
      expect(option.isNegated('no-color')).toBe(true);
      expect(option.isNegated('color')).toBe(false);
    });
  });

  describe('Value Options', () => {
    test('should handle options with required values', () => {
      command.option('-f, --file <path>', 'input file');
      
      const result = command._parseWithJS(['--file', 'test.txt']);
      expect(result.options.file).toBe('test.txt');
    });

    test('should handle options with optional values', () => {
      command.optionalValueOption('-p, --port [number]', 'port number', 3000);
      
      const result1 = command._parseWithJS(['--port', '8080']);
      expect(result1.options.port).toBe('8080');
      
      // Reset for second test
      command._optionProcessor = new OptionProcessor();
      command.optionalValueOption('-p, --port [number]', 'port number', 3000);
      
      const result2 = command._parseWithJS(['--port']);
      expect(result2.options.port).toBe(3000);
    });

    test('should throw error when required value is missing', () => {
      command.option('-f, --file <path>', 'input file');
      
      expect(() => {
        command._parseWithJS(['--file']);
      }).toThrow('Option --file requires a value');
    });
  });

  describe('Variadic Options', () => {
    test('should handle variadic options', () => {
      command.variadicOption('-I, --include <dirs...>', 'include directories');
      
      const result = command._parseWithJS(['--include', 'dir1', '--include', 'dir2']);
      expect(result.options.include).toEqual(['dir1', 'dir2']);
    });

    test('should initialize variadic options with empty array', () => {
      command.variadicOption('-I, --include <dirs...>', 'include directories');
      
      const result = command._parseWithJS([]);
      expect(result.options.include).toEqual([]);
    });
  });

  describe('Choice Options', () => {
    test('should handle options with predefined choices', () => {
      command.choiceOption('-l, --level <level>', 'log level', ['debug', 'info', 'warn', 'error'], 'info');
      
      const result = command._parseWithJS(['--level', 'debug']);
      expect(result.options.level).toBe('debug');
    });

    test('should throw error for invalid choices', () => {
      command.choiceOption('-l, --level <level>', 'log level', ['debug', 'info', 'warn', 'error']);
      
      expect(() => {
        command._parseWithJS(['--level', 'invalid']);
      }).toThrow('Invalid choice for option -l, --level <level>. Expected one of: debug, info, warn, error');
    });
  });

  describe('Custom Option Parsers', () => {
    test('should handle custom integer parser', () => {
      command.customOption('-n, --number <num>', 'number value', OptionParsers.int);
      
      const result = command._parseWithJS(['--number', '42']);
      expect(result.options.number).toBe(42);
    });

    test('should handle custom float parser', () => {
      command.customOption('-r, --ratio <ratio>', 'ratio value', OptionParsers.float);
      
      const result = command._parseWithJS(['--ratio', '3.14']);
      expect(result.options.ratio).toBe(3.14);
    });

    test('should handle custom list parser', () => {
      command.customOption('-t, --tags <tags>', 'tag list', OptionParsers.list);
      
      const result = command._parseWithJS(['--tags', 'tag1,tag2,tag3']);
      expect(result.options.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    test('should handle custom JSON parser', () => {
      command.customOption('-c, --config <json>', 'config object', OptionParsers.json);
      
      const result = command._parseWithJS(['--config', '{"key": "value"}']);
      expect(result.options.config).toEqual({ key: 'value' });
    });

    test('should throw error for invalid custom parser input', () => {
      command.customOption('-n, --number <num>', 'number value', OptionParsers.int);
      
      expect(() => {
        command._parseWithJS(['--number', 'not-a-number']);
      }).toThrow('Invalid integer: not-a-number');
    });
  });

  describe('Environment Variable Options', () => {
    test('should read from environment variables', () => {
      process.env.TEST_PORT = '8080';
      
      command.envOption('-p, --port <number>', 'port number', 'TEST_PORT', 3000);
      
      const result = command._parseWithJS([]);
      expect(result.options.port).toBe('8080');
      
      delete process.env.TEST_PORT;
    });

    test('should prefer command line over environment', () => {
      process.env.TEST_PORT = '8080';
      
      command.envOption('-p, --port <number>', 'port number', 'TEST_PORT', 3000);
      
      const result = command._parseWithJS(['--port', '9000']);
      expect(result.options.port).toBe('9000');
      
      delete process.env.TEST_PORT;
    });
  });

  describe('Required Options', () => {
    test('should validate required options', () => {
      command.requiredOption('-f, --file <path>', 'input file');
      
      expect(() => {
        command._parseWithJS([]);
      }).toThrow('Missing required option: -f, --file <path>');
    });

    test('should pass validation when required option is provided', () => {
      command.requiredOption('-f, --file <path>', 'input file');
      
      const result = command._parseWithJS(['--file', 'test.txt']);
      expect(result.options.file).toBe('test.txt');
    });
  });

  describe('Option Groups', () => {
    test('should handle mutually exclusive options', () => {
      const group = command.createOptionGroup('output', 'Output format options')
        .setExclusive(true);
      
      group.addOption(new Option('-j, --json', 'JSON output'));
      group.addOption(new Option('-x, --xml', 'XML output'));
      
      command.addOptionGroup(group);
      
      expect(() => {
        command._parseWithJS(['--json', '--xml']);
      }).toThrow("Options in group 'output' are mutually exclusive");
    });

    test('should handle required option groups', () => {
      const group = command.createOptionGroup('input', 'Input source options')
        .setRequired(true);
      
      group.addOption(new Option('-f, --file <path>', 'input file'));
      group.addOption(new Option('-u, --url <url>', 'input URL'));
      
      command.addOptionGroup(group);
      
      expect(() => {
        command._parseWithJS([]);
      }).toThrow("At least one option from group 'input' is required");
    });
  });

  describe('Option Conflicts and Implications', () => {
    test('should handle conflicting options', () => {
      const option1 = new Option('-v, --verbose', 'verbose output');
      const option2 = new Option('-q, --quiet', 'quiet output');
      
      option1.conflicts(['quiet']);
      
      command.addOption(option1);
      command.addOption(option2);
      
      expect(() => {
        command._parseWithJS(['--verbose', '--quiet']);
      }).toThrow('Conflicting options: -v, --verbose and -q, --quiet');
    });

    test('should handle option implications', () => {
      const verboseOption = new Option('-v, --verbose', 'verbose output');
      const debugOption = new Option('-d, --debug', 'debug output');
      
      verboseOption.implies(['debug']);
      debugOption.default(false);
      
      command.addOption(verboseOption);
      command.addOption(debugOption);
      
      const result = command._parseWithJS(['--verbose']);
      expect(result.options.verbose).toBe(true);
      expect(result.options.debug).toBe(false); // Should be set by implication
    });
  });

  describe('OptionProcessor', () => {
    let processor;

    beforeEach(() => {
      processor = new OptionProcessor();
    });

    test('should process boolean options', () => {
      const option = Option.createBoolean('-v, --verbose', 'verbose output');
      processor.addOption(option);
      
      processor.processBooleanOption('verbose');
      
      expect(processor.getValue('verbose')).toBe(true);
    });

    test('should process value options', () => {
      const option = new Option('-f, --file <path>', 'input file');
      processor.addOption(option);
      
      processor.processOption('file', 'test.txt');
      
      expect(processor.getValue('file')).toBe('test.txt');
    });

    test('should process variadic options', () => {
      const option = Option.createVariadic('-I, --include <dirs...>', 'include directories');
      processor.addOption(option);
      
      processor.processVariadicOption('include', ['dir1', 'dir2', 'dir3']);
      
      expect(processor.getValue('include')).toEqual(['dir1', 'dir2', 'dir3']);
    });

    test('should validate all options', () => {
      const requiredOption = Option.createRequired('-f, --file <path>', 'input file');
      processor.addOption(requiredOption);
      
      expect(() => {
        processor.validate();
      }).toThrow('Missing required option: -f, --file <path>');
    });
  });

  describe('Built-in Parsers', () => {
    test('should parse integers correctly', () => {
      expect(OptionParsers.int('42')).toBe(42);
      expect(OptionParsers.int('-10')).toBe(-10);
      expect(() => OptionParsers.int('not-a-number')).toThrow('Invalid integer: not-a-number');
    });

    test('should parse floats correctly', () => {
      expect(OptionParsers.float('3.14')).toBe(3.14);
      expect(OptionParsers.float('-2.5')).toBe(-2.5);
      expect(() => OptionParsers.float('not-a-number')).toThrow('Invalid float: not-a-number');
    });

    test('should parse booleans correctly', () => {
      expect(OptionParsers.boolean('true')).toBe(true);
      expect(OptionParsers.boolean('false')).toBe(false);
      expect(OptionParsers.boolean('yes')).toBe(true);
      expect(OptionParsers.boolean('no')).toBe(false);
      expect(OptionParsers.boolean('1')).toBe(true);
      expect(OptionParsers.boolean('0')).toBe(false);
      expect(() => OptionParsers.boolean('maybe')).toThrow('Invalid boolean value: maybe');
    });

    test('should parse lists correctly', () => {
      expect(OptionParsers.list('a,b,c')).toEqual(['a', 'b', 'c']);
      expect(OptionParsers.list('a, b, c')).toEqual(['a', 'b', 'c']);
      expect(OptionParsers.list('')).toEqual([]);
    });

    test('should parse JSON correctly', () => {
      expect(OptionParsers.json('{"key": "value"}')).toEqual({ key: 'value' });
      expect(OptionParsers.json('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(() => OptionParsers.json('invalid-json')).toThrow('Invalid JSON');
    });
  });

  describe('Enhanced Option Processing Integration', () => {
    test('should handle environment variable precedence correctly', () => {
      process.env.TEST_VALUE = 'env-value';
      
      command.envOption('-v, --value <val>', 'test value', 'TEST_VALUE', 'default-value');
      
      // Environment variable should be used when no CLI value provided
      const result1 = command._parseWithJS([]);
      expect(result1.options.value).toBe('env-value');
      
      // CLI value should override environment variable
      command._optionProcessor = new OptionProcessor();
      command.envOption('-v, --value <val>', 'test value', 'TEST_VALUE', 'default-value');
      
      const result2 = command._parseWithJS(['--value', 'cli-value']);
      expect(result2.options.value).toBe('cli-value');
      
      delete process.env.TEST_VALUE;
    });

    test('should handle option preprocessing and postprocessing', () => {
      command.option('-n, --number <num>', 'number value');
      
      // Add preprocessor to convert string to uppercase
      command.addOptionPreprocessor('number', (value) => value.toUpperCase());
      
      // Add postprocessor to add prefix
      command.addOptionPostprocessor('number', (value) => `processed-${value}`);
      
      const result = command._parseWithJS(['--number', 'test']);
      expect(result.options.number).toBe('processed-TEST');
    });

    test('should handle advanced option validation', () => {
      const validator = (values) => {
        if (values.port && values.port < 1024) {
          return { valid: false, message: 'Port must be >= 1024' };
        }
        return true;
      };
      
      command.option('-p, --port <number>', 'port number', OptionParsers.int);
      command.addCustomOptionValidator(validator);
      
      expect(() => {
        command._parseWithJS(['--port', '80']);
      }).toThrow('Custom validation failed: Port must be >= 1024');
      
      // Should pass with valid port
      command._optionProcessor = new OptionProcessor();
      command.option('-p, --port <number>', 'port number', OptionParsers.int);
      command.addCustomOptionValidator(validator);
      
      const result = command._parseWithJS(['--port', '8080']);
      expect(result.options.port).toBe(8080);
    });

    test('should handle complex option groups with mixed constraints', () => {
      const inputGroup = command.createOptionGroup('input', 'Input source')
        .setRequired(true)
        .setExclusive(false);
      
      inputGroup.addOption(new Option('-f, --file <path>', 'input file'));
      inputGroup.addOption(new Option('-u, --url <url>', 'input URL'));
      
      const outputGroup = command.createOptionGroup('output', 'Output format')
        .setRequired(false)
        .setExclusive(true);
      
      outputGroup.addOption(new Option('-j, --json', 'JSON output'));
      outputGroup.addOption(new Option('-x, --xml', 'XML output'));
      
      command.addOptionGroup(inputGroup);
      command.addOptionGroup(outputGroup);
      
      // Should require at least one input option
      expect(() => {
        command._parseWithJS(['--json']);
      }).toThrow("At least one option from group 'input' is required");
      
      // Should allow multiple input options (not exclusive)
      command._optionProcessor = new OptionProcessor();
      command.addOptionGroup(inputGroup);
      command.addOptionGroup(outputGroup);
      
      const result1 = command._parseWithJS(['--file', 'test.txt', '--url', 'http://example.com']);
      expect(result1.options.file).toBe('test.txt');
      expect(result1.options.url).toBe('http://example.com');
      
      // Should reject multiple exclusive output options
      command._optionProcessor = new OptionProcessor();
      command.addOptionGroup(inputGroup);
      command.addOptionGroup(outputGroup);
      
      expect(() => {
        command._parseWithJS(['--file', 'test.txt', '--json', '--xml']);
      }).toThrow("Options in group 'output' are mutually exclusive");
    });

    test('should handle variadic options with custom parsers', () => {
      const numberListParser = (value, previous) => {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          throw new Error(`Invalid number: ${value}`);
        }
        return num;
      };
      
      command.customOption('-n, --numbers <nums...>', 'list of numbers', numberListParser);
      
      const result = command._parseWithJS(['--numbers', '1', '--numbers', '2', '--numbers', '3']);
      expect(result.options.numbers).toEqual([1, 2, 3]);
      
      // Should validate individual values
      expect(() => {
        command._parseWithJS(['--numbers', '1', '--numbers', 'invalid']);
      }).toThrow('Invalid number: invalid');
    });

    test('should handle option implications correctly', () => {
      command.implyingOption('-v, --verbose', 'verbose output', ['debug']);
      command.booleanOption('-d, --debug', 'debug output', false);
      
      const result = command._parseWithJS(['--verbose']);
      expect(result.options.verbose).toBe(true);
      expect(result.options.debug).toBe(false); // Should be implied
    });

    test('should handle conflicting options correctly', () => {
      command.conflictingOption('-v, --verbose', 'verbose output', ['quiet']);
      command.conflictingOption('-q, --quiet', 'quiet output', ['verbose']);
      
      expect(() => {
        command._parseWithJS(['--verbose', '--quiet']);
      }).toThrow('Option -v, --verbose cannot be used with option -q, --quiet');
    });

    test('should handle validated options with custom validation', () => {
      const portValidator = (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          return { valid: false, message: 'Port must be a number' };
        }
        if (num < 1 || num > 65535) {
          return { valid: false, message: 'Port must be between 1 and 65535' };
        }
        return { valid: true, value: num };
      };
      
      command.validatedOption('-p, --port <number>', 'port number', portValidator, 3000);
      
      const result1 = command._parseWithJS(['--port', '8080']);
      expect(result1.options.port).toBe(8080);
      
      expect(() => {
        command._parseWithJS(['--port', '99999']);
      }).toThrow('Port must be between 1 and 65535');
      
      expect(() => {
        command._parseWithJS(['--port', 'invalid']);
      }).toThrow('Port must be a number');
    });
  });
});