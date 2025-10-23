// Jest setup file for GoCommander tests
const path = require('path');
const fs = require('fs');

// Set test environment
process.env.NODE_ENV = 'test';

// Ensure WASM directory and minimal binary exist for tests
const wasmDir = path.join(__dirname, '../wasm');
const wasmPath = path.join(wasmDir, 'gocommander.wasm');

try {
  // Create wasm directory if it doesn't exist
  if (!fs.existsSync(wasmDir)) {
    fs.mkdirSync(wasmDir, { recursive: true });
  }
  
  // Create minimal WASM binary if it doesn't exist
  if (!fs.existsSync(wasmPath)) {
    const minimalWasm = Buffer.from([
      0x00, 0x61, 0x73, 0x6d, // WASM magic number
      0x01, 0x00, 0x00, 0x00  // WASM version
    ]);
    fs.writeFileSync(wasmPath, minimalWasm);
  }
} catch (error) {
  console.warn('Failed to create minimal WASM binary for tests:', error.message);
}

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
  isReady: jest.fn().mockReturnValue(true),
  createCommand: jest.fn().mockReturnValue({ id: 'test-id', name: 'test' }),
  addOption: jest.fn().mockReturnValue({ success: true }),
  addArgument: jest.fn().mockReturnValue({ success: true }),
  parseArguments: jest.fn().mockReturnValue({
    command: 'test',
    options: {},
    arguments: [],
    unknown: []
  }),
  setParsingConfig: jest.fn().mockReturnValue({ success: true }),
  configureOutput: jest.fn().mockReturnValue({ success: true }),
  addHook: jest.fn().mockReturnValue({ success: true }),
  executeHooks: jest.fn().mockReturnValue({ success: true })
};

// Suppress console warnings in tests
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args) => {
  if (args[0] && (args[0].includes('WASM') || args[0].includes('not implemented'))) {
    return; // Suppress WASM and implementation warnings in tests
  }
  originalWarn.apply(console, args);
};

console.error = (...args) => {
  if (args[0] && args[0].includes('WASM')) {
    return; // Suppress WASM errors in tests
  }
  originalError.apply(console, args);
};