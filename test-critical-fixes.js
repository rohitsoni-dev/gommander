const { Command } = require('./lib/index.js');

console.log('Testing critical JavaScript API fixes...\n');

// Test 1: Option.choices() method should be callable
console.log('1. Testing Option.choices() method:');
try {
    const command = new Command('test');
    const option = command.createOption('-l, --level <level>', 'log level');
    option.choices(['debug', 'info', 'warn', 'error']);
    console.log('✅ Option.choices() method works correctly');
    console.log('   Choices:', option.argChoices);
} catch (error) {
    console.log('❌ Option.choices() method failed:', error.message);
}

// Test 2: Argument validation should throw errors for missing required arguments
console.log('\n2. Testing required argument validation:');
try {
    const command = new Command('test');
    command.argument('<file>', 'input file');
    command._parseWithJS([]);
    console.log('❌ Required argument validation failed - no error thrown');
} catch (error) {
    if (error.message.includes('missing required argument')) {
        console.log('✅ Required argument validation works correctly');
        console.log('   Error:', error.message);
    } else {
        console.log('❌ Wrong error type:', error.message);
    }
}

// Test 3: Option value storage and retrieval
console.log('\n3. Testing option value storage and retrieval:');
try {
    const command = new Command('test');
    command.option('-v, --verbose', 'verbose output');
    const result = command._parseWithJS(['--verbose']);
    if (result.options.verbose === true) {
        console.log('✅ Option value storage and retrieval works correctly');
        console.log('   Options:', result.options);
    } else {
        console.log('❌ Option value not stored correctly:', result.options);
    }
} catch (error) {
    console.log('❌ Option value storage failed:', error.message);
}

// Test 4: Choice validation should reject invalid option values
console.log('\n4. Testing choice validation:');
try {
    const command = new Command('test');
    const option = command.createOption('-l, --level <level>', 'log level');
    option.choices(['debug', 'info', 'warn', 'error']);
    command.addOption(option);
    command._parseWithJS(['--level', 'invalid']);
    console.log('❌ Choice validation failed - no error thrown');
} catch (error) {
    if (error.message.includes('invalid choice') || error.message.includes('Invalid choice')) {
        console.log('✅ Choice validation works correctly');
        console.log('   Error:', error.message);
    } else {
        console.log('❌ Wrong error type:', error.message);
    }
}

// Test 5: Conflicting options should be detected
console.log('\n5. Testing conflicting options:');
try {
    const command = new Command('test');
    const verbose = command.createOption('-v, --verbose', 'verbose output');
    const quiet = command.createOption('-q, --quiet', 'quiet output');
    verbose.conflicts(['quiet']);
    command.addOption(verbose);
    command.addOption(quiet);
    command._parseWithJS(['--verbose', '--quiet']);
    console.log('❌ Conflicting options not detected - no error thrown');
} catch (error) {
    if (error.message.includes('cannot be used with') || error.message.includes('Conflicting options')) {
        console.log('✅ Conflicting options detection works correctly');
        console.log('   Error:', error.message);
    } else {
        console.log('❌ Wrong error type:', error.message);
    }
}

console.log('\nCritical fixes test completed!');