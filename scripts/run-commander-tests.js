#!/usr/bin/env node

/**
 * Run Commander.js test suite against GoCommander implementation
 * This validates API compatibility by running the original tests
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running Commander.js test suite against GoCommander...\n');

const projectRoot = path.resolve(__dirname, '..');
const tempDir = path.join(projectRoot, 'temp-commander-tests');

async function runCommanderTests() {
  try {
    // Step 1: Download Commander.js source
    console.log('📥 Downloading Commander.js source...');
    await downloadCommanderSource();

    // Step 2: Patch tests to use GoCommander
    console.log('🔧 Patching tests to use GoCommander...');
    await patchTestsForGoCommander();

    // Step 3: Run the tests
    console.log('🏃 Running Commander.js tests...');
    const results = await runTests();

    // Step 4: Generate compatibility report
    console.log('📊 Generating compatibility report...');
    generateCompatibilityReport(results);

    // Step 5: Cleanup
    console.log('🧹 Cleaning up...');
    cleanup();

    console.log('\n✅ Commander.js compatibility validation completed!');
    return results;

  } catch (error) {
    console.error('\n❌ Commander.js compatibility validation failed:', error.message);
    cleanup();
    throw error;
  }
}

async function downloadCommanderSource() {
  // Create temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  // Clone Commander.js repository
  try {
    execSync('git clone https://github.com/tj/commander.js.git commander-source', {
      cwd: tempDir,
      stdio: 'inherit'
    });
  } catch (error) {
    // Fallback: try to use npm to get commander source
    console.log('Git clone failed, trying npm...');
    execSync('npm pack commander', { cwd: tempDir });
    
    const tarFile = fs.readdirSync(tempDir).find(f => f.startsWith('commander-') && f.endsWith('.tgz'));
    if (tarFile) {
      execSync(`tar -xzf ${tarFile}`, { cwd: tempDir });
      const packageDir = path.join(tempDir, 'package');
      if (fs.existsSync(packageDir)) {
        fs.renameSync(packageDir, path.join(tempDir, 'commander-source'));
      }
    }
  }

  const sourceDir = path.join(tempDir, 'commander-source');
  if (!fs.existsSync(sourceDir)) {
    throw new Error('Failed to download Commander.js source');
  }

  console.log('✅ Commander.js source downloaded');
}

async function patchTestsForGoCommander() {
  const sourceDir = path.join(tempDir, 'commander-source');
  const testsDir = path.join(sourceDir, 'tests');
  
  if (!fs.existsSync(testsDir)) {
    console.log('⚠️  No tests directory found in Commander.js source');
    return;
  }

  // Find all test files
  const testFiles = findTestFiles(testsDir);
  console.log(`Found ${testFiles.length} test files`);

  // Patch each test file
  for (const testFile of testFiles) {
    patchTestFile(testFile);
  }

  // Create a custom package.json for testing
  const testPackageJson = {
    name: 'commander-compatibility-tests',
    version: '1.0.0',
    scripts: {
      test: 'jest --testTimeout=30000'
    },
    dependencies: {
      jest: '^29.0.0'
    }
  };

  fs.writeFileSync(
    path.join(sourceDir, 'package.json'),
    JSON.stringify(testPackageJson, null, 2)
  );

  console.log('✅ Tests patched for GoCommander');
}

function findTestFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (item.endsWith('.test.js') || item.endsWith('.spec.js')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

function patchTestFile(testFile) {
  let content = fs.readFileSync(testFile, 'utf8');
  
  // Replace Commander.js imports with GoCommander
  const goCommanderPath = path.relative(
    path.dirname(testFile),
    path.join(projectRoot, 'lib', 'index.js')
  );
  
  // Common import patterns to replace
  const replacements = [
    // require('../index.js') -> require('path/to/gocommander')
    {
      pattern: /require\(['"]\.\.\/index\.js['"]\)/g,
      replacement: `require('${goCommanderPath}')`
    },
    // require('../') -> require('path/to/gocommander')
    {
      pattern: /require\(['"]\.\.\/['"]\)/g,
      replacement: `require('${goCommanderPath}')`
    },
    // require('commander') -> require('path/to/gocommander')
    {
      pattern: /require\(['"]commander['"]\)/g,
      replacement: `require('${goCommanderPath}')`
    },
    // import from '../index.js'
    {
      pattern: /from ['"]\.\.\/index\.js['"]/g,
      replacement: `from '${goCommanderPath}'`
    },
    // import from '../'
    {
      pattern: /from ['"]\.\.\/['"]/g,
      replacement: `from '${goCommanderPath}'`
    },
    // import from 'commander'
    {
      pattern: /from ['"]commander['"]/g,
      replacement: `from '${goCommanderPath}'`
    }
  ];

  // Apply replacements
  for (const { pattern, replacement } of replacements) {
    content = content.replace(pattern, replacement);
  }

  // Add GoCommander-specific test setup if needed
  if (content.includes('describe(') && !content.includes('// GoCommander patched')) {
    const setupCode = `
// GoCommander patched - compatibility test setup
beforeAll(async () => {
  // Ensure WASM is loaded before running tests
  const { wasmLoader } = require('${goCommanderPath}');
  if (wasmLoader && typeof wasmLoader.loadWASM === 'function') {
    try {
      await wasmLoader.loadWASM();
    } catch (error) {
      console.warn('WASM loading failed, using JavaScript fallback:', error.message);
    }
  }
});

`;
    content = setupCode + content;
  }

  fs.writeFileSync(testFile, content);
}

async function runTests() {
  const sourceDir = path.join(tempDir, 'commander-source');
  
  // Install test dependencies
  console.log('📦 Installing test dependencies...');
  try {
    execSync('npm install', { cwd: sourceDir, stdio: 'inherit' });
  } catch (error) {
    console.log('⚠️  npm install failed, continuing with existing dependencies');
  }

  // Run tests and capture results
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    summary: ''
  };

  try {
    const output = execSync('npm test', { 
      cwd: sourceDir, 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    results.summary = output;
    
    // Parse Jest output
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('Tests:')) {
        const match = line.match(/(\d+) passed.*?(\d+) total/);
        if (match) {
          results.passed = parseInt(match[1]);
          results.total = parseInt(match[2]);
          results.failed = results.total - results.passed;
        }
      }
    }
    
  } catch (error) {
    // Tests failed, but we still want to parse the output
    results.summary = error.stdout || error.message;
    results.errors.push(error.message);
    
    // Try to parse failed test output
    if (error.stdout) {
      const lines = error.stdout.split('\n');
      for (const line of lines) {
        if (line.includes('Tests:')) {
          const match = line.match(/(\d+) failed.*?(\d+) passed.*?(\d+) total/);
          if (match) {
            results.failed = parseInt(match[1]);
            results.passed = parseInt(match[2]);
            results.total = parseInt(match[3]);
          }
        }
      }
    }
  }

  return results;
}

function generateCompatibilityReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    goCommanderVersion: require('../package.json').version,
    commanderJsVersion: 'latest', // Could be extracted from downloaded source
    testResults: results,
    compatibility: {
      percentage: results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0,
      status: results.passed === results.total ? 'FULL' : 
              results.passed > results.total * 0.9 ? 'HIGH' :
              results.passed > results.total * 0.7 ? 'MEDIUM' : 'LOW'
    },
    recommendations: generateRecommendations(results)
  };

  // Save detailed report
  const reportPath = path.join(projectRoot, 'commander-compatibility-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Display summary
  console.log('\n📊 Commander.js Compatibility Report');
  console.log('═'.repeat(50));
  console.log(`Total tests:           ${results.total}`);
  console.log(`Passed:                ${results.passed}`);
  console.log(`Failed:                ${results.failed}`);
  console.log(`Skipped:               ${results.skipped}`);
  console.log(`Compatibility:         ${report.compatibility.percentage}% (${report.compatibility.status})`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    results.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
  }

  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    report.recommendations.forEach((rec, index) => {
      console.log(`${index + 1}. ${rec}`);
    });
  }

  console.log(`\nDetailed report saved to: ${reportPath}`);
  
  return report;
}

function generateRecommendations(results) {
  const recommendations = [];
  
  if (results.failed > 0) {
    recommendations.push('Review failed tests to identify API compatibility gaps');
    recommendations.push('Implement missing methods or fix behavioral differences');
  }
  
  if (results.total === 0) {
    recommendations.push('No tests were found or executed - verify Commander.js source download');
  }
  
  if (results.passed < results.total * 0.9) {
    recommendations.push('Compatibility is below 90% - significant work needed for full compatibility');
  }
  
  if (results.errors.length > 0) {
    recommendations.push('Fix test execution errors to get accurate compatibility metrics');
  }
  
  return recommendations;
}

function cleanup() {
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('⚠️  Failed to cleanup temp directory:', error.message);
    }
  }
}

// Run if called directly
if (require.main === module) {
  runCommanderTests()
    .then((results) => {
      const success = results.failed === 0 && results.total > 0;
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runCommanderTests };