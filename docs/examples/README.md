# GoCommander Examples

This directory contains example applications demonstrating various GoCommander features and use cases.

## Basic Examples

- [**basic.js**](basic.js) - Simple CLI with options and commands
- [**arguments.js**](arguments.js) - Working with command arguments
- [**subcommands.js**](subcommands.js) - Creating nested subcommands
- [**options.js**](options.js) - Advanced option handling

## Real-World Examples

- [**file-manager.js**](file-manager.js) - File management CLI tool
- [**git-clone.js**](git-clone.js) - Git-like version control CLI
- [**package-manager.js**](package-manager.js) - npm-like package manager
- [**api-client.js**](api-client.js) - REST API client CLI
- [**build-tool.js**](build-tool.js) - Build system CLI

## Advanced Examples

- [**custom-help.js**](custom-help.js) - Custom help formatting
- [**error-handling.js**](error-handling.js) - Comprehensive error handling
- [**async-actions.js**](async-actions.js) - Asynchronous command actions
- [**validation.js**](validation.js) - Input validation and parsing
- [**plugins.js**](plugins.js) - Plugin system implementation

## Running Examples

Each example can be run directly with Node.js:

```bash
# Basic example
node examples/basic.js --help

# File manager example
node examples/file-manager.js list --recursive

# API client example
node examples/api-client.js get /users --format json
```

## Example Categories

### 🚀 Getting Started
Perfect for learning GoCommander basics:
- [basic.js](basic.js)
- [arguments.js](arguments.js)
- [options.js](options.js)

### 🏗️ Real Applications
Production-ready CLI examples:
- [file-manager.js](file-manager.js)
- [api-client.js](api-client.js)
- [build-tool.js](build-tool.js)

### 🔧 Advanced Techniques
Complex patterns and customizations:
- [custom-help.js](custom-help.js)
- [error-handling.js](error-handling.js)
- [plugins.js](plugins.js)

## Contributing Examples

To add a new example:

1. Create a new `.js` file in this directory
2. Include comprehensive comments explaining the code
3. Add a description to this README
4. Test the example thoroughly
5. Submit a pull request

## Example Template

Use this template for new examples:

```javascript
#!/usr/bin/env node

/**
 * Example: [Example Name]
 * Description: [Brief description of what this example demonstrates]
 * 
 * Usage:
 *   node example-name.js [options] [command]
 * 
 * Features demonstrated:
 *   - Feature 1
 *   - Feature 2
 *   - Feature 3
 */

const { program } = require('gocommander');

// Example implementation here

// Parse command line arguments
program.parse();
```