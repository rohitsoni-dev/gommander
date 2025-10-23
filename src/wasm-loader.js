const fs = require('fs');
const path = require('path');

class WASMLoader {
  constructor() {
    this.wasmInstance = null;
    this.go = null;
    this.isLoaded = false;
    this.loadPromise = null;
  }

  async loadWASM() {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._doLoadWASM();
    return this.loadPromise;
  }

  async _doLoadWASM() {
    if (this.isLoaded) {
      return this.wasmInstance;
    }

    try {
      // Load the Go WASM support
      const wasmExecPath = path.join(__dirname, '../wasm/wasm_exec.js');
      if (!fs.existsSync(wasmExecPath)) {
        throw new Error('WASM support file not found. Run build script first.');
      }

      // In Node.js, we need to set up the global environment for Go WASM
      global.require = require;
      global.fs = fs;
      global.TextEncoder = TextEncoder;
      global.TextDecoder = TextDecoder;
      global.performance = performance;
      global.crypto = require('crypto');

      // Load the Go WASM runtime
      require(wasmExecPath);
      this.go = new global.Go();

      // Load the WASM binary
      const wasmPath = path.join(__dirname, '../wasm/gocommander.wasm');
      if (!fs.existsSync(wasmPath)) {
        throw new Error('WASM binary not found. Run build script first.');
      }

      const wasmBuffer = fs.readFileSync(wasmPath);
      const wasmModule = await WebAssembly.instantiate(wasmBuffer, this.go.importObject);
      
      this.wasmInstance = wasmModule.instance;
      
      // Start the Go program
      this.go.run(this.wasmInstance);
      
      // Wait a bit for the Go program to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if the gocommander global is available
      if (typeof global.gocommander === 'undefined') {
        throw new Error('GoCommander WASM interface not available');
      }

      this.isLoaded = true;
      return this.wasmInstance;
    } catch (error) {
      this.loadPromise = null;
      throw new Error(`Failed to load WASM: ${error.message}`);
    }
  }

  getInterface() {
    if (!this.isLoaded) {
      throw new Error('WASM not loaded. Call loadWASM() first.');
    }
    return global.gocommander;
  }

  isWASMLoaded() {
    return this.isLoaded;
  }
}

// Singleton instance
const wasmLoader = new WASMLoader();

module.exports = {
  WASMLoader,
  wasmLoader,
};