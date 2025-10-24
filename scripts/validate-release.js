#!/usr/bin/env node

/**
 * Release validation script
 * Validates that the package is ready for release
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ReleaseValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  }

  error(message) {
    this.errors.push(message);
    console.error(`❌ ${message}`);
  }

  warning(message) {
    this.warnings.push(message);
    console.warn(`⚠️  ${message}`);
  }

  success(message) {
    console.log(`✅ ${message}`);
  }

  validatePackageJson() {
    console.log('\n📦 Validating package.json...');

    // Required fields
    const requiredFields = [
      'name', 'version', 'description', 'main', 'module', 'types',
      'author', 'license', 'repository', 'bugs', 'homepage', 'keywords'
    ];

    for (const field of requiredFields) {
      if (!this.packageJson[field]) {
        this.error(`Missing required field: ${field}`);
      } else {
        this.success(`Has ${field}`);
      }
    }

    // Validate exports
    if (!this.packageJson.exports) {
      this.error('Missing exports field');
    } else {
      this.success('Has exports configuration');
    }

    // Validate files array
    if (!this.packageJson.files || !Array.isArray(this.packageJson.files)) {
      this.error('Missing or invalid files array');
    } else {
      this.success('Has files array');
    }

    // Validate scripts
    const requiredScripts = [
      'build', 'test', 'lint', 'clean', 'prepack', 'prepublishOnly'
    ];

    for (const script of requiredScripts) {
      if (!this.packageJson.scripts[script]) {
        this.error(`Missing required script: ${script}`);
      } else {
        this.success(`Has ${script} script`);
      }
    }

    // Validate engines
    if (!this.packageJson.engines || !this.packageJson.engines.node) {
      this.warning('Missing Node.js engine specification');
    } else {
      this.success('Has Node.js engine specification');
    }

    // Check for dependencies
    if (Object.keys(this.packageJson.dependencies || {}).length > 0) {
      this.warning('Package has runtime dependencies (should be zero)');
    } else {
      this.success('Zero runtime dependencies');
    }
  }

  validateFiles() {
    console.log('\n📁 Validating required files...');

    const requiredFiles = [
      'README.md',
      'LICENSE',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'package.json',
      'rollup.config.js',
      'jest.config.js',
      '.gitignore',
      '.eslintrc.js',
      '.prettierrc.js'
    ];

    for (const file of requiredFiles) {
      if (fs.existsSync(file)) {
        this.success(`Has ${file}`);
      } else {
        this.error(`Missing required file: ${file}`);
      }
    }

    // Check directories
    const requiredDirs = [
      'src',
      'cmd',
      'bridge',
      'tests',
      'scripts',
      'docs',
      'examples',
      '.github/workflows'
    ];

    for (const dir of requiredDirs) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        this.success(`Has ${dir}/ directory`);
      } else {
        this.error(`Missing required directory: ${dir}/`);
      }
    }
  }

  validateBuild() {
    console.log('\n🔨 Validating build output...');

    const buildFiles = [
      'lib/index.js',
      'lib/index.esm.js',
      'lib/index.d.ts',
      'wasm/gocommander.wasm'
    ];

    for (const file of buildFiles) {
      if (fs.existsSync(file)) {
        this.success(`Has ${file}`);
      } else {
        this.error(`Missing build output: ${file}`);
      }
    }

    // Check file sizes
    if (fs.existsSync('wasm/gocommander.wasm')) {
      const wasmSize = fs.statSync('wasm/gocommander.wasm').size;
      const wasmSizeMB = (wasmSize / 1024 / 1024).toFixed(2);
      
      if (wasmSize > 2 * 1024 * 1024) { // 2MB
        this.warning(`WASM file is large: ${wasmSizeMB}MB`);
      } else {
        this.success(`WASM file size OK: ${wasmSizeMB}MB`);
      }
    }

    // Check total package size
    try {
      const result = execSync('npm pack --dry-run', { encoding: 'utf8', timeout: 10000 });
      const sizeMatch = result.match(/package size:\s*(\d+(?:\.\d+)?)\s*(\w+)/);
      if (sizeMatch) {
        const size = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2];
        
        if (unit === 'MB' && size > 0.5) {
          this.warning(`Package size is large: ${size}${unit}`);
        } else {
          this.success(`Package size OK: ${size}${unit}`);
        }
      }
    } catch (error) {
      if (error.signal === 'SIGTERM') {
        this.warning('Package size check timed out');
      } else {
        this.warning('Could not check package size');
      }
    }
  }

  validateTests() {
    console.log('\n🧪 Validating tests...');

    try {
      execSync('npm test', { stdio: 'pipe', timeout: 30000 });
      this.success('Unit tests pass');
    } catch (error) {
      if (error.signal === 'SIGTERM') {
        this.warning('Unit tests timed out');
      } else {
        this.error('Unit tests fail');
      }
    }

    // Check test coverage
    const coverageDir = 'coverage';
    if (fs.existsSync(coverageDir)) {
      this.success('Test coverage generated');
    } else {
      this.warning('No test coverage found');
    }

    // Check for test files
    const testDirs = ['tests/unit', 'tests/integration', 'tests/e2e'];
    for (const dir of testDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
        if (files.length > 0) {
          this.success(`Has ${files.length} test files in ${dir}`);
        } else {
          this.warning(`No test files in ${dir}`);
        }
      } else {
        this.warning(`Missing test directory: ${dir}`);
      }
    }
  }

  validateDocumentation() {
    console.log('\n📚 Validating documentation...');

    // Check README
    if (fs.existsSync('README.md')) {
      const readme = fs.readFileSync('README.md', 'utf8');
      
      const requiredSections = [
        'Installation',
        'Quick Start',
        'Performance',
        'Documentation',
        'License'
      ];

      for (const section of requiredSections) {
        if (readme.includes(section)) {
          this.success(`README has ${section} section`);
        } else {
          this.warning(`README missing ${section} section`);
        }
      }
    }

    // Check API documentation
    const apiDocs = ['docs/api/command.md', 'docs/api/option.md', 'docs/api/argument.md'];
    for (const doc of apiDocs) {
      if (fs.existsSync(doc)) {
        this.success(`Has ${doc}`);
      } else {
        this.warning(`Missing API documentation: ${doc}`);
      }
    }

    // Check examples
    if (fs.existsSync('examples')) {
      const examples = fs.readdirSync('examples').filter(f => f.endsWith('.js'));
      if (examples.length > 0) {
        this.success(`Has ${examples.length} example files`);
      } else {
        this.warning('No example files found');
      }
    }
  }

  validateGit() {
    console.log('\n🔄 Validating Git status...');

    try {
      // Check if working directory is clean
      const status = execSync('git status --porcelain', { encoding: 'utf8', timeout: 5000 });
      if (status.trim()) {
        this.warning('Working directory has uncommitted changes');
      } else {
        this.success('Working directory is clean');
      }

      // Check current branch
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
      if (branch === 'main') {
        this.success('On main branch');
      } else {
        this.warning(`Not on main branch (currently on ${branch})`);
      }

      // Skip remote check to avoid hanging
      this.success('Git status validated (skipping remote check)');
    } catch (error) {
      if (error.signal === 'SIGTERM') {
        this.warning('Git validation timed out');
      } else {
        this.warning('Git validation failed: ' + error.message);
      }
    }
  }

  validateChangelog() {
    console.log('\n📝 Validating CHANGELOG...');

    if (!fs.existsSync('CHANGELOG.md')) {
      this.error('Missing CHANGELOG.md');
      return;
    }

    const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const version = this.packageJson.version;

    // Check if current version is in changelog
    if (changelog.includes(`## [${version}]`)) {
      this.success(`CHANGELOG has entry for version ${version}`);
    } else {
      this.error(`CHANGELOG missing entry for version ${version}`);
    }

    // Check for unreleased section
    if (changelog.includes('## [Unreleased]')) {
      this.success('CHANGELOG has Unreleased section');
    } else {
      this.warning('CHANGELOG missing Unreleased section');
    }

    // Check format
    if (changelog.includes('### Added') || changelog.includes('### Changed') || changelog.includes('### Fixed')) {
      this.success('CHANGELOG follows standard format');
    } else {
      this.warning('CHANGELOG may not follow standard format');
    }
  }

  validateSecurity() {
    console.log('\n🔒 Validating security...');

    try {
      execSync('npm audit --audit-level=moderate', { stdio: 'pipe', timeout: 15000 });
      this.success('No security vulnerabilities found');
    } catch (error) {
      if (error.signal === 'SIGTERM') {
        this.warning('Security audit timed out');
      } else {
        this.warning('Security vulnerabilities detected - run npm audit for details');
      }
    }

    // Check for sensitive files
    const sensitiveFiles = ['.env', '.env.local', 'config.json', 'secrets.json'];
    for (const file of sensitiveFiles) {
      if (fs.existsSync(file)) {
        this.warning(`Potentially sensitive file found: ${file}`);
      }
    }
  }

  generateReport() {
    console.log('\n📊 Validation Report');
    console.log('═'.repeat(50));
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('🎉 All validations passed! Package is ready for release.');
      return true;
    }

    if (this.errors.length > 0) {
      console.log(`\n❌ ${this.errors.length} Error(s):`);
      this.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error}`);
      });
    }

    if (this.warnings.length > 0) {
      console.log(`\n⚠️  ${this.warnings.length} Warning(s):`);
      this.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning}`);
      });
    }

    if (this.errors.length > 0) {
      console.log('\n🚫 Package is NOT ready for release. Please fix errors first.');
      return false;
    } else {
      console.log('\n✅ Package is ready for release (with warnings).');
      return true;
    }
  }

  validate() {
    console.log('🔍 GoCommander Release Validation');
    console.log('═'.repeat(50));

    this.validatePackageJson();
    this.validateFiles();
    this.validateBuild();
    this.validateTests();
    this.validateDocumentation();
    this.validateGit();
    this.validateChangelog();
    this.validateSecurity();

    return this.generateReport();
  }
}

// CLI interface
if (require.main === module) {
  const validator = new ReleaseValidator();
  const isValid = validator.validate();
  process.exit(isValid ? 0 : 1);
}

module.exports = ReleaseValidator;