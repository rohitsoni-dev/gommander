const { Command } = require('./src/index');

const command = new Command('test');
const option = command.createOption('-l, --level <level>', 'log level');

console.log('Option created:', option);
console.log('Option constructor:', option.constructor.name);
console.log('Option prototype:', Object.getPrototypeOf(option));
console.log('Has choices method:', typeof option.choices);
console.log('Option methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(option)));

try {
    option.choices(['debug', 'info', 'warn', 'error']);
    console.log('choices() method worked!');
    console.log('argChoices:', option.argChoices);
} catch (error) {
    console.error('Error calling choices():', error.message);
    console.error('Stack:', error.stack);
}