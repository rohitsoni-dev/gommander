#!/usr/bin/env node

/**
 * Release validation script for GoCommander v1.0.4
 * Validates that the package is ready for production deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json');
const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');
const README_PATH = path.join(__dirname, '..', 'README.md');

class ReleaseValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.packageJson = null;
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '📋',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }[type];
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  error(message) {
    this.errors.push(message);
    this.log(message, 'error');
  }

  warning(message) {
    this.warnings.push(message);
    this.log(message, 'warning');
  }

  success(message) {
    this.log(message, 'success');
  }

  info(message) {
    this.log(message, 'info');
  }

  validatePackageJson() {
    this.info('Validating package.json...');
    
    try {
      this.packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    } catch (error) {
      this.error(`Failed to read package.json: ${error.message}`);
      return false;
    }

    // Validate version
    if (this.packageJson.version !== '1.0.4') {
      this.error(`Expected version 1.0.4, got ${this.packageJson.version}`);
    } else {
      this.success('Version is correct: 1.0.4');
    }

    // Validate name
    if (this.packageJson.name !== 'gocommander') {
      this.error(`Expected name 'gocommander', got '${this.packageJson.name}'`);
    } else {
      this.success('Package name is correct');
    }

    // Validate main entry points
    const requiredFields = {
      main: 'lib/index.js',
      module: 'lib/index.esm.js',
      types: 'lib/index.d.ts'
    };

    for (const [field, expected] of Object.entries(requiredFields)) {
      if (this.packageJson[field] !== expected) {
        this.error(`Expected ${field} to be '${expected}', got '${this.packageJson[field]}'`);
      } else {
        this.success(`${field} is correctly configured`);
      }
    }

    // Validate exports
    if (!this.packageJson.exports || !this.packageJson.exports['.']) {
      this.error('Package exports are not properly configured');
    } else {
      this.success('Package exports are configured');
    }

    // Validate files array
    const requiredFiles = ['lib/', 'wasm/', 'README.md', 'LICENSE', 'CHANGELOG.md', 'docs/', 'examples/'];
    const files = this.packageJson.files || [];
    
    for (const file of requiredFiles) {
      if (!files.includes(file)) {
        this.error(`Missing required file in files array: ${file}`);
      } else {
        this.success(`Required file included: ${file}`);
      }
    }

    // Validate dependencies
    if (Object.keys(this.packageJson.dependencies || {}).length > 0) {
      this.error('Package should have zero runtime dependencies');
    } else {
      this.success('Zero runtime dependencies confirmed');
    }

    // Validate keywords
    const requiredKeywords = ['cli', 'commander', 'go', 'wasm', 'performance'];
    const keywords = this.packageJson.keywords || [];
    
    for (const keyword of requiredKeywords) {
      if (!keywords.includes(keyword)) {
        this.warning(`Missing recommended keyword: ${keyword}`);
      }
    }

    if (keywords.length >= 10) {
      this.success(`Good keyword coverage: ${keywords.length} keywords`);
    }

    return true;
  }

  validateFileStructure() {
    this.info('Validating file structure...');

    const requiredFiles = [
      'lib/index.js',
      'lib/index.esm.js', 
      'lib/index.d.ts',
      'wasm/gocommander.wasm',
      'README.md',
      'LICENSE',
      'CHANGELOG.md',
      'package.json'
    ];

    const requiredDirs = [
      'lib',
      'wasm',
      'docs',
      'docs/api',
      'examples',
      'scripts'
    ];

    // Check required files
    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, '..', file);
      if (!fs.existsSync(filePath)) {
        this.error(`Missing required file: ${file}`);
      } else {
        this.success(`Required file exists: ${file}`);
      }
    }

    // Check required directories
    for (const dir of requiredDirs) {
      const dirPath = path.join(__dirname, '..', dir);
      if (!fs.existsSync(dirPath)) {
        this.error(`Missing required directory: ${dir}`);
      } else {
        this.success(`Required directory exists: ${dir}`);
      }
    }

    // Check WASM file size
    const wasmPath = path.join(__dirname, '..', 'wasm', 'gocommander.wasm');
    if (fs.existsSync(wasmPath)) {
      const stats = fs.statSync(wasmPath);
      const sizeKB = Math.round(stats.size / 1024);
      
      if (sizeKB > 400) {
        this.warning(`WASM file is large: ${sizeKB}KB (consider optimization)`);
      } else {
        this.success(`WASM file size is good: ${sizeKB}KB`);
      }
    }

    return true;
  }

  validateDocumentation() {
    this.info('Validating documentation...');

    // Check README
    if (fs.existsSync(README_PATH)) {
      const readme = fs.readFileSync(README_PATH, 'utf8');
      
      if (readme.includes('v1.0.4')) {
        this.success('README includes correct version');
      } else {
        this.warning('README may not include correct version');
      }

      if (readme.includes('Production Ready')) {
        this.success('README indicates production readiness');
      } else {
        this.warning('README should indicate production readiness');
      }
    } else {
      this.error('README.md is missing');
    }

    // Check CHANGELOG
    if (fs.existsSync(CHANGELOG_PATH)) {
      const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
      
      if (changelog.includes('[1.0.4]')) {
        this.success('CHANGELOG includes v1.0.4 entry');
      } else {
        this.error('CHANGELOG missing v1.0.4 entry');
      }

      if (changelog.includes('2024-10-24')) {
        this.success('CHANGELOG includes correct release date');
      } else {
        this.warning('CHANGELOG may not include correct release date');
      }
    } else {
      this.error('CHANGELOG.md is missing');
    }

    // Check API documentation
    const apiDocs = [
      'docs/api/index.md',
      'docs/api/command.md',
      'docs/api/option.md',
      'docs/api/argument.md',
      'docs/api/help.md',
      'docs/api/errors.md'
    ];

    for (const doc of apiDocs) {
      const docPath = path.join(__dirname, '..', doc);
      if (fs.existsSync(docPath)) {
        this.success(`API documentation exists: ${doc}`);
      } else {
        this.error(`Missing API documentation: ${doc}`);
      }
    }

    // Check migration guide
    const migrationPath = path.join(__dirname, '..', 'docs', 'migration-guide.md');
    if (fs.existsSync(migrationPath)) {
      this.success('Migration guide exists');
    } else {
      this.error('Migration guide is missing');
    }

    return true;
  }

  validateBuild() {
    this.info('Validating build artifacts...');

    try {
      // Check if build directory exists and has content
      const libPath = path.join(__dirname, '..', 'lib');
      if (!fs.existsSync(libPath)) {
        this.error('Build directory (lib/) does not exist');
        return false;
      }

      const libFiles = fs.readdirSync(libPath);
      if (libFiles.length === 0) {
        this.error('Build directory (lib/) is empty');
        return false;
      }

      this.success(`Build directory contains ${libFiles.length} files`);

      // Check WASM file
      const wasmPath = path.join(__dirname, '..', 'wasm', 'gocommander.wasm');
      if (!fs.existsSync(wasmPath)) {
        this.error('WASM binary does not exist');
        return false;
      }

      const wasmStats = fs.statSync(wasmPath);
      if (wasmStats.size === 0) {
        this.error('WASM binary is empty');
        return false;
      }

      this.success(`WASM binary exists (${Math.round(wasmStats.size / 1024)}KB)`);

      return true;
    } catch (error) {
      this.error(`Build validation failed: ${error.message}`);
      return false;
    }
  }

  validatePackageSize() {
    this.info('Validating package size...');

    try {
      // Calculate total package size
      const calculateDirSize = (dirPath) => {
        let totalSize = 0;
        
        if (!fs.existsSync(dirPath)) return 0;
        
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
          const itemPath = path.join(dirPath, item);
          const stats = fs.statSync(itemPath);
          
          if (stats.isDirectory()) {
            totalSize += calculateDirSize(itemPath);
          } else {
            totalSize += stats.size;
          }
        }
        
        return totalSize;
      };

      const packageRoot = path.join(__dirname, '..');
      const includedDirs = ['lib', 'wasm', 'docs', 'examples'];
      const includedFiles = ['README.md', 'LICENSE', 'CHANGELOG.md', 'package.json'];

      let totalSize = 0;

      // Calculate directory sizes
      for (const dir of includedDirs) {
        const dirPath = path.join(packageRoot, dir);
        const dirSize = calculateDirSize(dirPath);
        totalSize += dirSize;
        
        if (dirSize > 0) {
          this.info(`${dir}/ size: ${Math.round(dirSize / 1024)}KB`);
        }
      }

      // Calculate file sizes
      for (const file of includedFiles) {
        const filePath = path.join(packageRoot, file);
        if (fs.existsSync(filePath)) {
          const fileSize = fs.statSync(filePath).size;
          totalSize += fileSize;
        }
      }

      const totalSizeKB = Math.round(totalSize / 1024);
      
      // Note: The actual published package will be smaller due to npm's file filtering
      // and compression. This is the uncompressed size of included files.
      if (totalSizeKB > 2500) {
        this.error(`Package size too large: ${totalSizeKB}KB (max ~2500KB uncompressed)`);
      } else if (totalSizeKB > 1500) {
        this.warning(`Package size is large: ${totalSizeKB}KB (will be compressed by npm)`);
        this.success(`Package size is acceptable for development build`);
      } else {
        this.success(`Package size is acceptable: ${totalSizeKB}KB`);
      }

      return totalSizeKB <= 2500;
    } catch (error) {
      this.error(`Package size validation failed: ${error.message}`);
      return false;
    }
  }

  validateGitStatus() {
    this.info('Validating git status...');

    try {
      // Check if we're on main branch
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
      if (branch !== 'main') {
        this.warning(`Not on main branch (currently on ${branch})`);
      } else {
        this.success('On main branch');
      }

      // Check if working directory is clean
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      if (status.trim()) {
        this.warning('Working directory has uncommitted changes');
      } else {
        this.success('Working directory is clean');
      }

      // Check if we have the v1.0.4 tag
      try {
        execSync('git rev-parse v1.0.4', { stdio: 'ignore' });
        this.info('Git tag v1.0.4 exists');
      } catch {
        this.info('Git tag v1.0.4 does not exist yet (will be created during release)');
      }

      return true;
    } catch (error) {
      this.warning(`Git validation failed: ${error.message}`);
      return true; // Don't fail validation for git issues
    }
  }

  generateReport() {
    this.info('Generating validation report...');

    const report = {
      timestamp: new Date().toISOString(),
      version: this.packageJson?.version || 'unknown',
      validation: {
        errors: this.errors.length,
        warnings: this.warnings.length,
        passed: this.errors.length === 0
      },
      errors: this.errors,
      warnings: this.warnings
    };

    const reportPath = path.join(__dirname, '..', 'validation-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    this.success(`Validation report saved to: ${reportPath}`);
    return report;
  }

  async validate() {
    this.info('Starting GoCommander v1.0.4 release validation...');
    this.info('='.repeat(60));

    // Run all validations
    this.validatePackageJson();
    this.validateFileStructure();
    this.validateDocumentation();
    this.validateBuild();
    this.validatePackageSize();
    this.validateGitStatus();

    // Generate report
    const report = this.generateReport();

    // Print summary
    this.info('='.repeat(60));
    this.info('VALIDATION SUMMARY');
    this.info('='.repeat(60));

    if (this.errors.length === 0) {
      this.success('🎉 ALL VALIDATIONS PASSED!');
      this.success('GoCommander v1.0.4 is ready for production release!');
      
      if (this.warnings.length > 0) {
        this.warning(`Note: ${this.warnings.length} warnings found (non-blocking)`);
      }
      
      this.info('');
      this.info('Next steps:');
      this.info('1. Run: npm run build');
      this.info('2. Run: npm run test:ci');
      this.info('3. Run: npm publish');
      this.info('4. Create GitHub release with tag v1.0.4');
      
    } else {
      this.error(`❌ VALIDATION FAILED: ${this.errors.length} errors found`);
      this.error('Please fix all errors before proceeding with release');
      
      this.info('');
      this.info('Errors to fix:');
      this.errors.forEach((error, index) => {
        this.info(`${index + 1}. ${error}`);
      });
    }

    if (this.warnings.length > 0) {
      this.info('');
      this.info('Warnings (optional fixes):');
      this.warnings.forEach((warning, index) => {
        this.info(`${index + 1}. ${warning}`);
      });
    }

    return {
      passed: this.errors.length === 0,
      errors: this.errors.length,
      warnings: this.warnings.length,
      report
    };
  }
}

// Main execution
if (require.main === module) {
  const validator = new ReleaseValidator();
  
  validator.validate()
    .then((result) => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Validation failed with error:', error.message);
      process.exit(1);
    });
}

module.exports = ReleaseValidator;