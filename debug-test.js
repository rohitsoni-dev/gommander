const { Command } = require('./src/command');
const { Option } = require('./src/option');

console.log('Testing Option creation...');

// Test 1: Direct Option creation
console.log('\n1. Direct Option creation:');
const directOption = new Option('-l, --level <level>', 'log level');
console.log('directOption:', directOption);
console.log('directOption.choices type:', typeof directOption.choices);
console.log('directOption has choices method:', 'choices' in directOption);

// Test 2: Command.createOption
console.log('\n2. Command.createOption:');
const command = new Command('test');
const createdOption = command.createOption('-l, --level <level>', 'log level');
console.log('createdOption:', createdOption);
console.log('createdOption.choices type:', typeof createdOption.choices);
console.log('createdOption has choices method:', 'choices' in createdOption);

// Test 3: Try calling choices method
console.log('\n3. Calling choices method:');
try {
  const result = createdOption.choices(['debug', 'info', 'warn', 'error']);
  console.log('choices() call successful, result:', result);
} catch (error) {
  console.log('choices() call failed:', error.message);
}