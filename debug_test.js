const { Command } = require('./lib/index.js');

const command = new Command('test');
command.option('-v, --verbose', 'verbose output');
command.argument('[files...]', 'input files');

console.log('Testing double dash separator...');
const result = command._parseWithJS(['-v', '--', '--not-an-option', 'file.txt']);
console.log('Result:', JSON.stringify(result, null, 2));
console.log('Arguments:', result.arguments);
console.log('Arguments type:', typeof result.arguments);
console.log('Arguments length:', result.arguments.length);
console.log('First argument:', result.arguments[0]);
console.log('First argument type:', typeof result.arguments[0]);