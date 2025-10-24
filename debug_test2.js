const { Command } = require('./lib/index.js');

const command = new Command('test');
console.log('Available methods on command:');
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(command)).filter(name => name.includes('parse')));

// Check if _parseWithJS exists
console.log('_parseWithJS exists:', typeof command._parseWithJS);
console.log('_parseWithJS:', command._parseWithJS);