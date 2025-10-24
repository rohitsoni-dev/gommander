#!/usr/bin/env node

/**
 * Run Commander.js test suite against GoCommander implementation
 * This script runs the original Commander.js tests with GoCommander as a drop-in replacement
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('GoCommander vs Commander.js Test Suite Runner');
console.log('===========================================');

const projectRoot = path.resolve(__dirname, '..');
const commanderJsPath = path.join(projectRoot, '..', 'commander.js');
const goCommanderPath = projectRoot;

// Check if Commander.js directory exists
if (!fs.existsSync(commanderJsPath)) {
    console.error('❌ Commander.js directory not found at:', commanderJsPath);
    console.log('Please ensure commander.js is cloned in the parent directory');
    process.exit(1);
}

// Test categories to run
const testCategories = [
    // Core functionality
    { pattern: 'command.*.test.js', description: 'Command functionality' },
    { pattern: 'createCommand.test.js', description: 'Command creation' },
    { pattern: 'program.test.js', description: 'Program instance' },
    
    // Options
    { pattern: 'options.*.test.js', description: 'Option processing' },
    { pattern: 'option.*.test.js', description: 'Option class' },
    
    // Arguments
    { pattern: 'argument.*.test.js', description: 'Argument handling' },
    { pattern: 'args.*.test.js', description: 'Argument parsing' },
    
    // Help system
    { pattern: 'help.*.test.js', description: 'Help system' },
    { pattern: 'command.help.test.js', description: 'Command help' },
    
    // Error handling
    { pattern: 'command.error.test.js', description: 'Error handling' },
    { pattern: 'negatives.test.js', description: 'Negative cases' }
];

// Results tracking
const results = {
    total: 0,
    passed: 0,
    failed: 0,
    categories: {}
};

async function runTestCategory(category) {
    console.log(`\n📋 Running ${category.description} tests...`);
    console.log(`Pattern: ${category.pattern}`);
    
    try {
        // Create a temporary test runner that uses GoCommander instead of Commander.js
        const testRunnerContent = `
const path = require('path');

// Mock Commander.js with GoCommander
const goCommanderPath = '${goCommanderPath}/lib/index.js';
const goCommander = require(goCommanderPath);

// Replace Commander.js module resolution
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
    if (id === '../index.js' || id === '../../index.js' || id === '../../../index.js') {
        // Commander.js tests trying to import the main module
        return goCommander;
    }
    if (id === 'commander' || id === '../commander' || id === '../../commander') {
        return goCommander;
    }
    return originalRequire.apply(this, arguments);
};

// Set up test environment
process.chdir('${commanderJsPath}');

// Run the actual test
require('${commanderJsPath}/tests/${category.pattern.replace('*', '')}');
`;

        const tempTestFile = path.join(projectRoot, 'temp-test-runner.js');
        fs.writeFileSync(tempTestFile, testRunnerContent);
        
        // Find matching test files
        const testsDir = path.join(commanderJsPath, 'tests');
        const testFiles = fs.readdirSync(testsDir)
            .filter(file => {
                const pattern = category.pattern.replace('*', '.*');
                return new RegExp(pattern).test(file);
            });
        
        if (testFiles.length === 0) {
            console.log(`⚠️  No test files found for pattern: ${category.pattern}`);
            return { passed: 0, failed: 0, total: 0 };
        }
        
        console.log(`Found ${testFiles.length} test files:`, testFiles.join(', '));
        
        let categoryResults = { passed: 0, failed: 0, total: 0 };
        
        for (const testFile of testFiles) {
            console.log(`\n  🧪 Running ${testFile}...`);
            
            try {
                // Run Jest on the specific test file with GoCommander
                const jestCmd = `npx jest "${path.join(testsDir, testFile)}" --testTimeout=10000 --verbose`;
                
                const result = execSync(jestCmd, {
                    cwd: commanderJsPath,
                    stdio: 'pipe',
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        NODE_PATH: `${goCommanderPath}/lib:${process.env.NODE_PATH || ''}`
                    }
                });
                
                // Parse Jest output for results
                const output = result.toString();
                const passMatch = output.match(/(\d+) passing/);
                const failMatch = output.match(/(\d+) failing/);
                
                const passed = passMatch ? parseInt(passMatch[1]) : 0;
                const failed = failMatch ? parseInt(failMatch[1]) : 0;
                
                categoryResults.passed += passed;
                categoryResults.failed += failed;
                categoryResults.total += passed + failed;
                
                console.log(`    ✅ ${passed} passed, ❌ ${failed} failed`);
                
            } catch (error) {
                console.log(`    ❌ Test file failed: ${error.message}`);
                categoryResults.failed += 1;
                categoryResults.total += 1;
            }
        }
        
        // Clean up temp file
        if (fs.existsSync(tempTestFile)) {
            fs.unlinkSync(tempTestFile);
        }
        
        return categoryResults;
        
    } catch (error) {
        console.error(`❌ Failed to run ${category.description} tests:`, error.message);
        return { passed: 0, failed: 1, total: 1 };
    }
}

async function runAllTests() {
    console.log(`\n🚀 Starting Commander.js compatibility test suite...`);
    console.log(`Commander.js path: ${commanderJsPath}`);
    console.log(`GoCommander path: ${goCommanderPath}`);
    
    // Ensure GoCommander is built
    console.log('\n🔨 Building GoCommander...');
    try {
        execSync('npm run build', { cwd: goCommanderPath, stdio: 'inherit' });
        console.log('✅ GoCommander build complete');
    } catch (error) {
        console.error('❌ GoCommander build failed:', error.message);
        process.exit(1);
    }
    
    // Run each test category
    for (const category of testCategories) {
        const categoryResult = await runTestCategory(category);
        
        results.categories[category.description] = categoryResult;
        results.total += categoryResult.total;
        results.passed += categoryResult.passed;
        results.failed += categoryResult.failed;
        
        const passRate = categoryResult.total > 0 ? 
            ((categoryResult.passed / categoryResult.total) * 100).toFixed(1) : '0.0';
        
        console.log(`📊 ${category.description}: ${categoryResult.passed}/${categoryResult.total} passed (${passRate}%)`);
    }
    
    // Generate final report
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL COMPATIBILITY REPORT');
    console.log('='.repeat(60));
    
    const overallPassRate = results.total > 0 ? 
        ((results.passed / results.total) * 100).toFixed(1) : '0.0';
    
    console.log(`\n🎯 Overall Results:`);
    console.log(`   Total Tests: ${results.total}`);
    console.log(`   Passed: ${results.passed}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Pass Rate: ${overallPassRate}%`);
    
    console.log(`\n📋 Category Breakdown:`);
    for (const [category, result] of Object.entries(results.categories)) {
        const passRate = result.total > 0 ? 
            ((result.passed / result.total) * 100).toFixed(1) : '0.0';
        const status = passRate === '100.0' ? '✅' : passRate >= '80.0' ? '⚠️' : '❌';
        console.log(`   ${status} ${category}: ${result.passed}/${result.total} (${passRate}%)`);
    }
    
    // Save detailed report
    const reportPath = path.join(goCommanderPath, 'docs', 'COMMANDER_TEST_RESULTS.md');
    const reportContent = generateDetailedReport(results);
    fs.writeFileSync(reportPath, reportContent);
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    
    // Exit with appropriate code
    const exitCode = results.failed > 0 ? 1 : 0;
    console.log(`\n${exitCode === 0 ? '🎉' : '💥'} Test suite completed with exit code: ${exitCode}`);
    process.exit(exitCode);
}

function generateDetailedReport(results) {
    const timestamp = new Date().toISOString();
    const overallPassRate = results.total > 0 ? 
        ((results.passed / results.total) * 100).toFixed(1) : '0.0';
    
    let report = `# Commander.js Test Suite Results

Generated: ${timestamp}
Platform: ${process.platform} ${process.arch}
Node.js: ${process.version}

## Summary

- **Total Tests**: ${results.total}
- **Passed**: ${results.passed}
- **Failed**: ${results.failed}
- **Pass Rate**: ${overallPassRate}%

## Category Results

| Category | Passed | Failed | Total | Pass Rate | Status |
|----------|--------|--------|-------|-----------|--------|
`;

    for (const [category, result] of Object.entries(results.categories)) {
        const passRate = result.total > 0 ? 
            ((result.passed / result.total) * 100).toFixed(1) : '0.0';
        const status = passRate === '100.0' ? '✅ PASS' : passRate >= '80.0' ? '⚠️ PARTIAL' : '❌ FAIL';
        report += `| ${category} | ${result.passed} | ${result.failed} | ${result.total} | ${passRate}% | ${status} |\n`;
    }
    
    report += `\n## Compatibility Assessment

`;

    if (overallPassRate >= 95) {
        report += `🎉 **EXCELLENT**: GoCommander has excellent compatibility with Commander.js (${overallPassRate}% pass rate).\n`;
    } else if (overallPassRate >= 80) {
        report += `⚠️ **GOOD**: GoCommander has good compatibility with Commander.js (${overallPassRate}% pass rate) but needs some fixes.\n`;
    } else if (overallPassRate >= 60) {
        report += `⚠️ **PARTIAL**: GoCommander has partial compatibility with Commander.js (${overallPassRate}% pass rate) and needs significant work.\n`;
    } else {
        report += `❌ **POOR**: GoCommander has poor compatibility with Commander.js (${overallPassRate}% pass rate) and needs major fixes.\n`;
    }
    
    report += `\n## Next Steps

Based on these results, the following actions are recommended:

1. **Fix Critical Issues**: Focus on categories with <80% pass rate
2. **Address Failing Tests**: Investigate and fix individual test failures
3. **Improve Edge Cases**: Work on categories with 80-95% pass rate
4. **Validate Fixes**: Re-run tests after implementing fixes

## Test Execution Details

This report was generated by running the original Commander.js test suite against GoCommander as a drop-in replacement. The tests were executed using Jest with GoCommander substituted for Commander.js imports.

For more details on specific test failures, check the console output during test execution.
`;

    return report;
}

// Run the tests
runAllTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
});