#!/usr/bin/env node

/**
 * Cross-Platform Integration Test Runner
 * Runs integration tests with platform-specific configurations
 */

const { execSync, spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const platform = os.platform();
const arch = os.arch();

console.log('GoCommander Integration Test Runner');
console.log('==================================');
console.log(`Platform: ${platform}`);
console.log(`Architecture: ${arch}`);
console.log(`Node.js: ${process.version}`);
console.log('');

// Test categories
const testCategories = {
  'e2e': {
    name: 'End-to-End WASM Integration',
    pattern: 'tests/integration/e2e-wasm.test.js',
    timeout: 60000
  },
  'compatibility': {
    name: 'Commander.js Compatibility',
    pattern: 'tests/integration/commander-compatibility.test.js',
    timeout: 30000
  },
  'cross-platform': {
    name: 'Cross-Platform Compatibility',
    pattern: 'tests/integration/cross-platform.test.js',
    timeout: 45000
  },
  'performance': {
    name: 'Performance Benchmarks',
    pattern: 'tests/integration/performance-benchmark.test.js',
    timeout: 120000
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
const selectedCategories = args.length > 0 ? args : Object.keys(testCategories);

// Validate categories
for (const category of selectedCategories) {
  if (!testCategories[category]) {
    console.error(`Unknown test category: ${category}`);
    console.error(`Available categories: ${Object.keys(testCategories).join(', ')}`);
    process.exit(1);
  }
}

// Check prerequisites
function checkPrerequisites() {
  console.log('Checking prerequisites...');
  
  // Check if WASM binary exists
  const wasmPath = path.join(__dirname, '../wasm/gocommander.wasm');
  if (!fs.existsSync(wasmPath)) {
    console.log('WASM binary not found, building...');
    try {
      execSync('npm run build:wasm', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });
    } catch (error) {
      console.error('Failed to build WASM binary:', error.message);
      process.exit(1);
    }
  }
  
  // Check if JavaScript build exists
  const jsPath = path.join(__dirname, '../lib/index.js');
  if (!fs.existsSync(jsPath)) {
    console.log('JavaScript build not found, building...');
    try {
      execSync('npm run build:js', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });
    } catch (error) {
      console.error('Failed to build JavaScript:', error.message);
      process.exit(1);
    }
  }
  
  console.log('Prerequisites check completed.\n');
}

// Run a specific test category
function runTestCategory(category) {
  const config = testCategories[category];
  console.log(`Running ${config.name} tests...`);
  console.log(`Pattern: ${config.pattern}`);
  console.log(`Timeout: ${config.timeout}ms`);
  console.log('');
  
  const jestArgs = [
    '--testPathPattern', config.pattern,
    '--testTimeout', config.timeout.toString(),
    '--verbose',
    '--no-cache',
    '--forceExit'
  ];
  
  // Add performance-specific configurations
  if (category === 'performance') {
    jestArgs.push('--runInBand'); // Run performance tests serially
    jestArgs.push('--detectOpenHandles'); // Detect memory leaks
  } else if (platform === 'win32') {
    jestArgs.push('--maxWorkers=1'); // Windows can be slower with parallel tests
  }
  
  try {
    execSync(`npx jest ${jestArgs.join(' ')}`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FORCE_COLOR: '1'
      }
    });
    
    console.log(`✅ ${config.name} tests completed successfully\n`);
    return true;
  } catch (error) {
    console.error(`❌ ${config.name} tests failed\n`);
    return false;
  }
}

// Generate test report
function generateReport(results) {
  console.log('Integration Test Report');
  console.log('======================');
  console.log(`Platform: ${platform} ${arch}`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');
  
  let totalTests = 0;
  let passedTests = 0;
  
  for (const [category, passed] of Object.entries(results)) {
    const config = testCategories[category];
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${config.name}`);
    totalTests++;
    if (passed) passedTests++;
  }
  
  console.log('');
  console.log(`Summary: ${passedTests}/${totalTests} test categories passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All integration tests passed!');
    return 0;
  } else {
    console.log('💥 Some integration tests failed');
    return 1;
  }
}

// Main execution
async function main() {
  console.log(`Running integration tests for categories: ${selectedCategories.join(', ')}\n`);
  
  // Check prerequisites
  checkPrerequisites();
  
  // Run tests
  const results = {};
  
  for (const category of selectedCategories) {
    const passed = runTestCategory(category);
    results[category] = passed;
    
    // Add delay between test categories to prevent resource conflicts
    if (selectedCategories.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Generate report
  const exitCode = generateReport(results);
  process.exit(exitCode);
}

// Handle errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run main function
main().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});