// Jest setup file for GoCommander tests

// Mock WASM loading for tests
global.WebAssembly = {
  instantiate: jest.fn().mockResolvedValue({
    instance: {
      exports: {}
    }
  }),
  instantiateStreaming: jest.fn().mockResolvedValue({
    instance: {
      exports: {}
    }
  })
};

// Mock Go WASM runtime
global.Go = jest.fn().mockImplementation(() => ({
  importObject: {},
  run: jest.fn()
}));

// Mock gocommander WASM interface
global.gocommander = {
  createCommand: jest.fn().mockReturnValue({ id: 'test-id', name: 'test' }),
  addOption: jest.fn().mockReturnValue({ success: true }),
  addArgument: jest.fn().mockReturnValue({ success: true }),
  parseArguments: jest.fn().mockReturnValue({
    command: 'test',
    options: {},
    arguments: [],
    unknown: []
  })
};

// Suppress console warnings in tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && args[0].includes('WASM')) {
    return; // Suppress WASM warnings in tests
  }
  originalWarn.apply(console, args);
};