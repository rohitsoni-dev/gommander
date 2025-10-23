const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

/**
 * Node.js runtime integration for GoCommander
 * Provides process.argv parsing, child process spawning, and stream integration
 */
class NodeJSIntegration extends EventEmitter {
    constructor() {
        super();
        this.processEnv = process.env;
        this.processArgv = process.argv;
        this.processStdout = process.stdout;
        this.processStderr = process.stderr;
        this.processStdin = process.stdin;
        this.processCwd = process.cwd();
        this.processExit = process.exit.bind(process);
        
        // Track spawned processes for cleanup
        this.spawnedProcesses = new Set();
        
        // Handle process cleanup
        this._setupProcessCleanup();
    }

    /**
     * Parse process.argv with enhanced Node.js environment detection
     */
    parseProcessArgv(argv = null, options = {}) {
        const targetArgv = argv || this.processArgv;
        const parseOptions = {
            from: 'node',
            ...options
        };

        // Detect execution environment
        if (process.versions?.electron) {
            parseOptions.from = 'electron';
        } else if (process.pkg) {
            parseOptions.from = 'pkg';
        } else if (process.env.NODE_ENV === 'test') {
            parseOptions.from = 'test';
        }

        let scriptPath = null;
        let userArgs = [];

        switch (parseOptions.from) {
            case 'node':
                // Standard Node.js execution: node script.js args...
                scriptPath = targetArgv[1];
                userArgs = targetArgv.slice(2);
                break;
                
            case 'electron':
                // Electron execution
                if (process.defaultApp) {
                    // electron . args... or electron script.js args...
                    scriptPath = targetArgv[1];
                    userArgs = targetArgv.slice(2);
                } else {
                    // packaged electron app
                    userArgs = targetArgv.slice(1);
                }
                break;
                
            case 'pkg':
                // PKG packaged executable
                userArgs = targetArgv.slice(1);
                break;
                
            case 'test':
                // Test environment
                scriptPath = targetArgv[1];
                userArgs = targetArgv.slice(2);
                break;
                
            case 'user':
                // User-provided args
                userArgs = targetArgv.slice(0);
                break;
                
            case 'eval':
                // node -e "code" args...
                userArgs = targetArgv.slice(1);
                break;
                
            default:
                throw new Error(`Unexpected parse option { from: '${parseOptions.from}' }`);
        }

        return {
            scriptPath,
            userArgs,
            rawArgs: targetArgv.slice(),
            execPath: process.execPath,
            execArgv: process.execArgv,
            platform: process.platform,
            arch: process.arch,
            version: process.version,
            versions: process.versions,
            env: { ...this.processEnv },
            cwd: this.processCwd,
            pid: process.pid,
            ppid: process.ppid,
            parseOptions
        };
    }

    /**
     * Enhanced environment variable handling with type conversion
     */
    getEnvironmentVariable(name, options = {}) {
        const {
            defaultValue = undefined,
            type = 'string',
            required = false,
            transform = null
        } = options;

        let value = this.processEnv[name];

        if (value === undefined) {
            if (required) {
                throw new Error(`Required environment variable ${name} is not set`);
            }
            return defaultValue;
        }

        // Type conversion
        try {
            switch (type) {
                case 'string':
                    break; // Already a string
                case 'number':
                    value = Number(value);
                    if (isNaN(value)) {
                        throw new Error(`Environment variable ${name} is not a valid number: ${this.processEnv[name]}`);
                    }
                    break;
                case 'boolean':
                    value = value.toLowerCase();
                    if (['true', '1', 'yes', 'on'].includes(value)) {
                        value = true;
                    } else if (['false', '0', 'no', 'off'].includes(value)) {
                        value = false;
                    } else {
                        throw new Error(`Environment variable ${name} is not a valid boolean: ${this.processEnv[name]}`);
                    }
                    break;
                case 'json':
                    value = JSON.parse(value);
                    break;
                case 'array':
                    value = value.split(',').map(item => item.trim());
                    break;
                default:
                    throw new Error(`Unsupported environment variable type: ${type}`);
            }

            // Apply transformation if provided
            if (transform && typeof transform === 'function') {
                value = transform(value);
            }

            return value;
        } catch (error) {
            throw new Error(`Error processing environment variable ${name}: ${error.message}`);
        }
    }

    /**
     * Set environment variable with validation
     */
    setEnvironmentVariable(name, value, options = {}) {
        const { validate = null, transform = null } = options;

        let processedValue = value;

        // Apply transformation
        if (transform && typeof transform === 'function') {
            processedValue = transform(processedValue);
        }

        // Convert to string for environment
        if (typeof processedValue !== 'string') {
            if (typeof processedValue === 'object') {
                processedValue = JSON.stringify(processedValue);
            } else {
                processedValue = String(processedValue);
            }
        }

        // Validate if validator provided
        if (validate && typeof validate === 'function') {
            const isValid = validate(processedValue);
            if (!isValid) {
                throw new Error(`Environment variable ${name} failed validation`);
            }
        }

        this.processEnv[name] = processedValue;
        return this;
    }

    /**
     * Spawn executable subcommand with enhanced options
     */
    async spawnExecutableSubcommand(executablePath, args = [], options = {}) {
        const {
            cwd = this.processCwd,
            env = this.processEnv,
            stdio = 'inherit',
            shell = false,
            timeout = 0,
            killSignal = 'SIGTERM',
            windowsHide = true,
            detached = false,
            uid = undefined,
            gid = undefined,
            serialization = 'json',
            silent = false,
            encoding = 'utf8',
            maxBuffer = 1024 * 1024, // 1MB
            async = true
        } = options;

        // Resolve executable path
        const resolvedPath = this._resolveExecutablePath(executablePath, options);

        const spawnOptions = {
            cwd,
            env,
            stdio: silent ? 'pipe' : stdio,
            shell,
            windowsHide,
            detached,
            uid,
            gid,
            encoding,
            maxBuffer
        };

        if (timeout > 0) {
            spawnOptions.timeout = timeout;
            spawnOptions.killSignal = killSignal;
        }

        try {
            if (async) {
                return await this._spawnAsync(resolvedPath, args, spawnOptions, { silent, serialization });
            } else {
                return this._spawnSync(resolvedPath, args, spawnOptions, { silent, serialization });
            }
        } catch (error) {
            throw new Error(`Failed to spawn executable subcommand ${executablePath}: ${error.message}`);
        }
    }

    /**
     * Asynchronous process spawning
     */
    async _spawnAsync(executablePath, args, spawnOptions, { silent, serialization }) {
        return new Promise((resolve, reject) => {
            const child = spawn(executablePath, args, spawnOptions);
            
            // Track spawned process
            this.spawnedProcesses.add(child);

            let stdout = '';
            let stderr = '';

            if (silent) {
                child.stdout?.on('data', (data) => {
                    stdout += data.toString();
                });

                child.stderr?.on('data', (data) => {
                    stderr += data.toString();
                });
            }

            child.on('close', (code, signal) => {
                this.spawnedProcesses.delete(child);
                
                const result = {
                    code,
                    signal,
                    stdout: silent ? stdout : null,
                    stderr: silent ? stderr : null,
                    pid: child.pid,
                    spawnfile: child.spawnfile,
                    spawnargs: child.spawnargs
                };

                // Parse output if requested
                if (silent && serialization === 'json' && stdout) {
                    try {
                        result.parsedOutput = JSON.parse(stdout);
                    } catch (error) {
                        result.parseError = error.message;
                    }
                }

                if (code === 0) {
                    resolve(result);
                } else {
                    const error = new Error(`Process exited with code ${code}`);
                    error.result = result;
                    reject(error);
                }
            });

            child.on('error', (error) => {
                this.spawnedProcesses.delete(child);
                reject(error);
            });

            // Handle timeout
            if (spawnOptions.timeout) {
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill(spawnOptions.killSignal);
                        const error = new Error(`Process timed out after ${spawnOptions.timeout}ms`);
                        error.code = 'TIMEOUT';
                        reject(error);
                    }
                }, spawnOptions.timeout);
            }
        });
    }

    /**
     * Synchronous process spawning
     */
    _spawnSync(executablePath, args, spawnOptions, { silent, serialization }) {
        const result = spawnSync(executablePath, args, spawnOptions);
        
        const processResult = {
            code: result.status,
            signal: result.signal,
            stdout: silent ? result.stdout?.toString() : null,
            stderr: silent ? result.stderr?.toString() : null,
            pid: result.pid,
            error: result.error,
            spawnfile: executablePath,
            spawnargs: args
        };

        // Parse output if requested
        if (silent && serialization === 'json' && processResult.stdout) {
            try {
                processResult.parsedOutput = JSON.parse(processResult.stdout);
            } catch (error) {
                processResult.parseError = error.message;
            }
        }

        if (result.error) {
            const error = new Error(`Spawn sync failed: ${result.error.message}`);
            error.result = processResult;
            throw error;
        }

        if (result.status !== 0) {
            const error = new Error(`Process exited with code ${result.status}`);
            error.result = processResult;
            throw error;
        }

        return processResult;
    }

    /**
     * Resolve executable path with search logic
     */
    _resolveExecutablePath(executablePath, options = {}) {
        const { executableDir = null, searchPath = true } = options;

        // If absolute path, use as-is
        if (path.isAbsolute(executablePath)) {
            return executablePath;
        }

        // Check in specified executable directory first
        if (executableDir) {
            const dirPath = path.resolve(executableDir, executablePath);
            if (fs.existsSync(dirPath)) {
                return dirPath;
            }
        }

        // Check relative to current working directory
        const cwdPath = path.resolve(this.processCwd, executablePath);
        if (fs.existsSync(cwdPath)) {
            return cwdPath;
        }

        // Search in PATH if enabled
        if (searchPath) {
            const pathEnv = this.processEnv.PATH || this.processEnv.Path || '';
            const pathDirs = pathEnv.split(path.delimiter);
            
            for (const dir of pathDirs) {
                if (!dir) continue;
                
                const fullPath = path.join(dir, executablePath);
                if (fs.existsSync(fullPath)) {
                    return fullPath;
                }
                
                // On Windows, also try with .exe extension
                if (process.platform === 'win32') {
                    const exePath = fullPath + '.exe';
                    if (fs.existsSync(exePath)) {
                        return exePath;
                    }
                }
            }
        }

        // Return original path if not found (let spawn handle the error)
        return executablePath;
    }

    /**
     * Stream integration for input/output operations
     */
    createStreamInterface(options = {}) {
        const {
            input = this.processStdin,
            output = this.processStdout,
            error = this.processStderr,
            prompt = '> ',
            encoding = 'utf8'
        } = options;

        return {
            input,
            output,
            error,
            
            // Write to output stream
            write(data) {
                return output.write(data, encoding);
            },
            
            // Write to error stream
            writeError(data) {
                return error.write(data, encoding);
            },
            
            // Read from input stream
            async read() {
                return new Promise((resolve) => {
                    input.once('data', (data) => {
                        resolve(data.toString(encoding).trim());
                    });
                });
            },
            
            // Prompt for input
            async prompt(message = prompt) {
                output.write(message);
                return this.read();
            },
            
            // Check if streams are TTY
            get isTTY() {
                return {
                    input: input.isTTY,
                    output: output.isTTY,
                    error: error.isTTY
                };
            },
            
            // Get stream dimensions
            get dimensions() {
                return {
                    output: output.isTTY ? { columns: output.columns, rows: output.rows } : null,
                    error: error.isTTY ? { columns: error.columns, rows: error.rows } : null
                };
            },
            
            // Color support detection
            get hasColors() {
                return {
                    output: output.isTTY && output.hasColors?.(),
                    error: error.isTTY && error.hasColors?.()
                };
            }
        };
    }

    /**
     * Enhanced debugging and profiling integration
     */
    getDebuggingInfo() {
        return {
            // Process information
            process: {
                pid: process.pid,
                ppid: process.ppid,
                platform: process.platform,
                arch: process.arch,
                version: process.version,
                versions: { ...process.versions },
                execPath: process.execPath,
                execArgv: [...process.execArgv],
                argv: [...process.argv],
                cwd: process.cwd(),
                uptime: process.uptime(),
                hrtime: process.hrtime()
            },
            
            // Memory usage
            memory: process.memoryUsage(),
            
            // CPU usage
            cpuUsage: process.cpuUsage(),
            
            // Resource usage (if available)
            resourceUsage: process.resourceUsage ? process.resourceUsage() : null,
            
            // Environment variables (filtered for security)
            environment: this._getFilteredEnvironment(),
            
            // Node.js features
            features: {
                inspector: !!process.binding('inspector'),
                async_hooks: !!process.binding('async_wrap'),
                worker_threads: !!process.binding('worker'),
                wasi: !!process.binding('wasi')
            },
            
            // Debugging state
            debugging: {
                isDebugging: !!process.env.NODE_OPTIONS?.includes('--inspect'),
                debugPort: process.debugPort,
                hasInspector: typeof process.binding === 'function'
            }
        };
    }

    /**
     * Filter environment variables for security
     */
    _getFilteredEnvironment() {
        const sensitiveKeys = [
            'PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'CREDENTIAL',
            'API_KEY', 'PRIVATE_KEY', 'CERT', 'PASSPHRASE'
        ];
        
        const filtered = {};
        
        for (const [key, value] of Object.entries(this.processEnv)) {
            const isSensitive = sensitiveKeys.some(sensitive => 
                key.toUpperCase().includes(sensitive)
            );
            
            if (isSensitive) {
                filtered[key] = '[REDACTED]';
            } else {
                filtered[key] = value;
            }
        }
        
        return filtered;
    }

    /**
     * Setup process cleanup handlers
     */
    _setupProcessCleanup() {
        const cleanup = () => {
            // Kill all spawned processes
            for (const child of this.spawnedProcesses) {
                if (!child.killed) {
                    child.kill('SIGTERM');
                }
            }
            this.spawnedProcesses.clear();
        };

        // Handle various exit scenarios
        process.on('exit', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            cleanup();
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            cleanup();
        });
    }

    /**
     * Kill all spawned processes
     */
    killAllSpawnedProcesses(signal = 'SIGTERM') {
        for (const child of this.spawnedProcesses) {
            if (!child.killed) {
                child.kill(signal);
            }
        }
        this.spawnedProcesses.clear();
    }

    /**
     * Get information about spawned processes
     */
    getSpawnedProcessInfo() {
        return Array.from(this.spawnedProcesses).map(child => ({
            pid: child.pid,
            killed: child.killed,
            exitCode: child.exitCode,
            signalCode: child.signalCode,
            spawnfile: child.spawnfile,
            spawnargs: child.spawnargs,
            connected: child.connected
        }));
    }
}

// Create singleton instance
const nodeJSIntegration = new NodeJSIntegration();

module.exports = {
    NodeJSIntegration,
    nodeJSIntegration
};