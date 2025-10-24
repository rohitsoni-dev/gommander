#!/usr/bin/env node

/**
 * Quick validation script for release readiness
 * Performs essential checks without hanging operations
 */

const fs = require('fs');
const path = require('path');

function validatePackageStructure() {
  console.log('📦 Validating package structure...');
  
  const requiredFiles = [
    'package.json',
    'README.md', 
    'LICENSE',
    'CHANGELOG.md',
    'CONTRIBUTING.md'
  ];
  
  const requiredDirs = [
    'src',
    'scripts', 
    'docs',
    'examples',
    '.github/workflows'
  ];
  
  let valid = true;
  
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ Missing: ${file}`);
      valid = false;
    }
  }
  
  for (const dir of requiredDirs) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      console.log(`✅ ${dir}/`);
    } else {
      console.log(`❌ Missing: ${dir}/`);
      valid = false;
    }
  }
  
  return valid;
}

function validatePackageJson() {
  console.log('\n📋 Validating package.json...');
  
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  let valid = true;
  
  const requiredFields = [
    'name', 'version', 'description', 'main', 'module', 'types',
    'author', 'license', 'repository', 'keywords'
  ];
  
  for (const field of requiredFields) {
    if (packageJson[field]) {
      console.log(`✅ ${field}: ${typeof packageJson[field] === 'object' ? 'configured' : packageJson[field]}`);
    } else {
      console.log(`❌ Missing: ${field}`);
      valid = false;
    }
  }
  
  // Check exports
  if (packageJson.exports) {
    console.log('✅ exports: configured');
  } else {
    console.log('❌ Missing: exports');
    valid = false;
  }
  
  // Check files array
  if (packageJson.files && Array.isArray(packageJson.files)) {
    console.log(`✅ files: ${packageJson.files.length} entries`);
  } else {
    console.log('❌ Missing: files array');
    valid = false;
  }
  
  return valid;
}

function validateBuildOutput() {
  console.log('\n🔨 Validating build output...');
  
  const buildFiles = [
    'lib/index.js',
    'lib/index.esm.js', 
    'lib/index.d.ts'
  ];
  
  let valid = true;
  
  for (const file of buildFiles) {
    if (fs.existsSync(file)) {
      const size = fs.statSync(file).size;
      console.log(`✅ ${file} (${(size/1024).toFixed(1)}KB)`);
    } else {
      console.log(`❌ Missing: ${file}`);
      valid = false;
    }
  }
  
  return valid;
}

function validateDocumentation() {
  console.log('\n📚 Validating documentation...');
  
  let valid = true;
  
  // Check README content
  if (fs.existsSync('README.md')) {
    const readme = fs.readFileSync('README.md', 'utf8');
    const sections = ['Installation', 'Quick Start', 'Performance', 'License'];
    
    for (const section of sections) {
      if (readme.includes(section)) {
        console.log(`✅ README has ${section} section`);
      } else {
        console.log(`⚠️  README missing ${section} section`);
      }
    }
  }
  
  // Check API docs
  const apiDocs = ['docs/api/command.md', 'docs/api/option.md', 'docs/api/argument.md'];
  for (const doc of apiDocs) {
    if (fs.existsSync(doc)) {
      console.log(`✅ ${doc}`);
    } else {
      console.log(`⚠️  Missing: ${doc}`);
    }
  }
  
  // Check examples
  if (fs.existsSync('examples')) {
    const examples = fs.readdirSync('examples').filter(f => f.endsWith('.js'));
    console.log(`✅ ${examples.length} example files`);
  } else {
    console.log('⚠️  No examples directory');
  }
  
  return valid;
}

function validateChangelog() {
  console.log('\n📝 Validating CHANGELOG...');
  
  if (!fs.existsSync('CHANGELOG.md')) {
    console.log('❌ Missing CHANGELOG.md');
    return false;
  }
  
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const version = packageJson.version;
  
  if (changelog.includes(`## [${version}]`)) {
    console.log(`✅ CHANGELOG has entry for v${version}`);
  } else {
    console.log(`❌ CHANGELOG missing entry for v${version}`);
    return false;
  }
  
  if (changelog.includes('## [Unreleased]')) {
    console.log('✅ CHANGELOG has Unreleased section');
  } else {
    console.log('⚠️  CHANGELOG missing Unreleased section');
  }
  
  return true;
}

function main() {
  console.log('🚀 GoCommander Quick Release Validation');
  console.log('═'.repeat(50));
  
  const results = [
    validatePackageStructure(),
    validatePackageJson(),
    validateBuildOutput(),
    validateDocumentation(),
    validateChangelog()
  ];
  
  const allValid = results.every(r => r);
  
  console.log('\n📊 Validation Summary');
  console.log('─'.repeat(30));
  
  if (allValid) {
    console.log('🎉 All essential validations passed!');
    console.log('📦 Package appears ready for release.');
    console.log('\nNext steps:');
    console.log('1. Run: npm run build');
    console.log('2. Run: npm test');
    console.log('3. Run: npm run release:prepare');
  } else {
    console.log('❌ Some validations failed.');
    console.log('🔧 Please fix the issues above before releasing.');
  }
  
  return allValid;
}

if (require.main === module) {
  const success = main();
  process.exit(success ? 0 : 1);
}

module.exports = { main };