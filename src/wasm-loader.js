const fs = require('fs');
const path = require('path');

class WASMLoader {
  constructor() {
    this.wasmInstance = null;
    this.go = null;
    this.isLoaded = false;
    this.loadPromise = null;
    this.loadAttempts = 0;
    this.maxLoadAttempts = 3;
    this.cache = new Map();
    this.fallbackMode = false;
  }

  async loadWASM(options = {}) {
    // Return cached promise if already loading
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Return immediately if already loaded
    if (this.isLoaded) {
      return this.wasmInstance;
    }

    // Check if we should use fallback mode
    if (options.fallback || this.fallbackMode) {
      this.fallbackMode = true;
      return null;
    }

    this.loadPromise = this._doLoadWASM(options);
    return this.loadPromise;
  }

  async loadWASMLazy() {
    // Lazy loading - only load when actually needed
    if (!this.isLoaded && !this.loadPromise) {
      return this.loadWASM({ lazy: true });
    }
    return this.wasmInstance;
  }

  async _doLoadWASM(options = {}) {
    if (this.isLoaded) {
      return this.wasmInstance;
    }

    this.loadAttempts++;

    try {
      // Check if WASM is supported
      if (typeof WebAssembly === 'undefined') {
        throw new Error('WebAssembly is not supported in this environment');
      }

      // Load the Go WASM support
      const wasmExecPath = this._resolveWASMPath('../wasm/wasm_exec.js');
      if (!fs.existsSync(wasmExecPath)) {
        throw new Error('WASM support file not found. Run build script first.');
      }

      // Set up the global environment for Go WASM
      this._setupGlobalEnvironment();

      // Load the Go WASM runtime (only once)
      if (!global.Go) {
        require(wasmExecPath);
      }
      
      this.go = new global.Go();

      // Load the WASM binary
      const wasmPath = this._resolveWASMPath('../wasm/gocommander.wasm');
      if (!fs.existsSync(wasmPath)) {
        throw new Error('WASM binary not found. Run build script first.');
      }

      // Check cache first
      const cacheKey = `wasm_${fs.statSync(wasmPath).mtime.getTime()}`;
      let wasmModule = this.cache.get(cacheKey);

      if (!wasmModule) {
        const wasmBuffer = fs.readFileSync(wasmPath);
        wasmModule = await WebAssembly.instantiate(wasmBuffer, this.go.importObject);
        
        // Cache the compiled module
        this.cache.set(cacheKey, wasmModule);
      }
      
      this.wasmInstance = wasmModule.instance;
      
      // Start the Go program
      this.go.run(this.wasmInstance);
      
      // Wait for initialization with timeout
      await this._waitForInitialization(options.timeout || 5000);
      
      // Verify the interface is available
      if (typeof global.gocommander === 'undefined') {
        throw new Error('GoCommander WASM interface not available after initialization');
      }

      this.isLoaded = true;
      this.loadAttempts = 0; // Reset on success
      return this.wasmInstance;

    } catch (error) {
      this.loadPromise = null;
      
      // If we've exceeded max attempts, switch to fallback mode
      if (this.loadAttempts >= this.maxLoadAttempts) {
        console.warn(`WASM loading failed after ${this.maxLoadAttempts} attempts, switching to JavaScript fallback:`, error.message);
        this.fallbackMode = true;
        return null;
      }
      
      throw new Error(`Failed to load WASM (attempt ${this.loadAttempts}/${this.maxLoadAttempts}): ${error.message}`);
    }
  }

  _resolveWASMPath(relativePath) {
    // Try multiple possible locations for WASM files
    const possiblePaths = [
      path.join(__dirname, relativePath),
      path.join(process.cwd(), 'node_modules/gocommander/wasm', path.basename(relativePath)),
      path.join(process.cwd(), 'wasm', path.basename(relativePath))
    ];

    for (const wasmPath of possiblePaths) {
      if (fs.existsSync(wasmPath)) {
        return wasmPath;
      }
    }

    return possiblePaths[0]; // Return first path as fallback
  }

  _setupGlobalEnvironment() {
    // Set up Node.js globals for Go WASM
    if (typeof global !== 'undefined') {
      global.require = global.require || require;
      global.fs = global.fs || fs;
      global.TextEncoder = global.TextEncoder || TextEncoder;
      global.TextDecoder = global.TextDecoder || TextDecoder;
      global.performance = global.performance || performance;
      
      // Set up crypto
      if (!global.crypto) {
        try {
          global.crypto = require('crypto').webcrypto || require('crypto');
        } catch (e) {
          // Fallback crypto implementation
          global.crypto = {
            getRandomValues: (arr) => {
              const crypto = require('crypto');
              const bytes = crypto.randomBytes(arr.length);
              arr.set(bytes);
              return arr;
            }
          };
        }
      }
    }
  }

  async _waitForInitialization(timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (typeof global.gocommander !== 'undefined') {
        // Additional check to ensure the interface is fully ready
        try {
          if (global.gocommander.isReady && global.gocommander.isReady()) {
            return;
          }
        } catch (e) {
          // Interface exists but not ready yet
        }
        
        // If no isReady method, assume it's ready
        if (!global.gocommander.isReady) {
          return;
        }
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    throw new Error(`WASM initialization timeout after ${timeout}ms`);
  }

  getInterface() {
    if (this.fallbackMode) {
      return null;
    }
    
    if (!this.isLoaded) {
      throw new Error('WASM not loaded. Call loadWASM() first.');
    }
    
    return global.gocommander;
  }

  isWASMLoaded() {
    return this.isLoaded && !this.fallbackMode;
  }

  isFallbackMode() {
    return this.fallbackMode;
  }

  // Force fallback mode (useful for testing or when WASM is not available)
  enableFallbackMode() {
    this.fallbackMode = true;
    this.isLoaded = false;
    this.loadPromise = null;
  }

  // Reset loader state
  reset() {
    this.wasmInstance = null;
    this.go = null;
    this.isLoaded = false;
    this.loadPromise = null;
    this.loadAttempts = 0;
    this.fallbackMode = false;
    this.cache.clear();
  }

  // Get loader statistics
  getStats() {
    return {
      isLoaded: this.isLoaded,
      fallbackMode: this.fallbackMode,
      loadAttempts: this.loadAttempts,
      cacheSize: this.cache.size,
      hasInstance: !!this.wasmInstance
    };
  }

  // Preload WASM in the background
  async preload() {
    if (!this.isLoaded && !this.loadPromise && !this.fallbackMode) {
      // Start loading in background without waiting
      this.loadWASM({ lazy: true }).catch(error => {
        console.warn('WASM preload failed:', error.message);
      });
    }
  }
}

// Singleton instance
const wasmLoader = new WASMLoader();

module.exports = {
  WASMLoader,
  wasmLoader,
};