const { Command, program, createCommand } = require('../lib/index.js');

describe('GoCommander Basic Structure', () => {
  test('should export main classes and functions', () => {
    expect(Command).toBeDefined();
    expect(program).toBeDefined();
    expect(createCommand).toBeDefined();
    expect(typeof Command).toBe('function');
    expect(typeof createCommand).toBe('function');
  });

  test('should create a command instance', () => {
    const cmd = new Command('test');
    expect(cmd).toBeInstanceOf(Command);
    expect(cmd.name()).toBe('test');
  });

  test('should create command with factory function', () => {
    const cmd = createCommand('factory-test');
    expect(cmd).toBeInstanceOf(Command);
    expect(cmd.name()).toBe('factory-test');
  });

  test('should allow method chaining', () => {
    const cmd = new Command('chain-test')
      .description('Test description')
      .option('-v, --verbose', 'verbose output');
    
    expect(cmd.description()).toBe('Test description');
    expect(cmd._options).toHaveLength(1);
  });

  test('program should be a Command instance', () => {
    expect(program).toBeInstanceOf(Command);
  });
});