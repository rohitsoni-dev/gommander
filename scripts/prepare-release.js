#!/usr/bin/env node

/**
 * Release preparation script
 * Automates the release preparation process
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json');
const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  return packageJson.version;
}

function updateChangelog(version, releaseType = 'patch') {
  const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Replace [Unreleased] with the new version
  const updatedChangelog = changelog.replace(
    '## [Unreleased]',
    `## [Unreleased]

### Added
- Placeholder for next release

### Changed
- Placeholder for next release

### Fixed
- Placeholder for next release

## [${version}] - ${currentDate}`
  );
  
  fs.writeFileSync(CHANGELOG_PATH, updatedChangelog);
  console.log(`✅ Updated CHANGELOG.md for version ${version}`);
}

function validateRelease() {
  console.log('🔍 Validating release...');
  
  // Check if working directory is clean
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      console.error('❌ Working directory is not clean. Please commit or stash changes.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Git status check failed:', error.message);
    process.exit(1);
  }
  
  // Check if on main branch
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    if (branch !== 'main') {
      console.error(`❌ Not on main branch (currently on ${branch}). Please switch to main.`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Branch check failed:', error.message);
    process.exit(1);
  }
  
  // Pull latest changes
  try {
    execSync('git pull origin main', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Failed to pull latest changes:', error.message);
    process.exit(1);
  }
  
  console.log('✅ Release validation passed');
}

function runTests() {
  console.log('🧪 Running comprehensive tests...');
  
  try {
    execSync('npm run test:ci', { stdio: 'inherit' });
    console.log('✅ All tests passed');
  } catch (error) {
    console.error('❌ Tests failed. Please fix before releasing.');
    process.exit(1);
  }
}

function buildProject() {
  console.log('🔨 Building project...');
  
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Build completed successfully');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

function checkBundleSize() {
  console.log('📦 Checking bundle size...');
  
  try {
    execSync('npm run size-check', { stdio: 'inherit' });
    console.log('✅ Bundle size check passed');
  } catch (error) {
    console.error('❌ Bundle size check failed:', error.message);
    process.exit(1);
  }
}

function runBenchmarks() {
  console.log('⚡ Running performance benchmarks...');
  
  try {
    execSync('npm run benchmark', { stdio: 'inherit' });
    console.log('✅ Benchmarks completed');
  } catch (error) {
    console.warn('⚠️ Benchmarks failed, but continuing with release');
  }
}

function prepareRelease(releaseType = 'patch') {
  console.log(`🚀 Preparing ${releaseType} release...`);
  
  // Validate environment
  validateRelease();
  
  // Run tests
  runTests();
  
  // Build project
  buildProject();
  
  // Check bundle size
  checkBundleSize();
  
  // Run benchmarks
  runBenchmarks();
  
  // Update version
  const oldVersion = getCurrentVersion();
  console.log(`📝 Updating version from ${oldVersion}...`);
  
  try {
    const result = execSync(`npm version ${releaseType} --no-git-tag-version`, { encoding: 'utf8' });
    const newVersion = result.trim().replace('v', '');
    console.log(`✅ Version updated to ${newVersion}`);
    
    // Update changelog
    updateChangelog(newVersion, releaseType);
    
    // Commit changes
    execSync('git add package.json package-lock.json CHANGELOG.md', { stdio: 'inherit' });
    execSync(`git commit -m "chore: prepare release ${newVersion}"`, { stdio: 'inherit' });
    
    console.log('🎉 Release preparation completed!');
    console.log('');
    console.log('Next steps:');
    console.log(`1. Review the changes: git show HEAD`);
    console.log(`2. Push changes: git push origin main`);
    console.log(`3. Create and push tag: git tag v${newVersion} && git push origin v${newVersion}`);
    console.log(`4. Or use GitHub CLI: gh release create v${newVersion} --generate-notes`);
    console.log('');
    console.log('The GitHub Actions workflow will automatically:');
    console.log('- Build and test on all platforms');
    console.log('- Publish to npm');
    console.log('- Create GitHub release');
    console.log('- Update documentation');
    
  } catch (error) {
    console.error('❌ Version update failed:', error.message);
    process.exit(1);
  }
}

function showUsage() {
  console.log('Usage: node scripts/prepare-release.js [patch|minor|major]');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/prepare-release.js patch   # 1.0.0 -> 1.0.1');
  console.log('  node scripts/prepare-release.js minor   # 1.0.0 -> 1.1.0');
  console.log('  node scripts/prepare-release.js major   # 1.0.0 -> 2.0.0');
  console.log('');
  console.log('This script will:');
  console.log('- Validate git status and branch');
  console.log('- Run comprehensive tests');
  console.log('- Build the project');
  console.log('- Check bundle size');
  console.log('- Run performance benchmarks');
  console.log('- Update package version');
  console.log('- Update CHANGELOG.md');
  console.log('- Commit changes');
}

// Main execution
if (require.main === module) {
  const releaseType = process.argv[2] || 'patch';
  
  if (!['patch', 'minor', 'major'].includes(releaseType)) {
    console.error(`❌ Invalid release type: ${releaseType}`);
    showUsage();
    process.exit(1);
  }
  
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsage();
    process.exit(0);
  }
  
  prepareRelease(releaseType);
}

module.exports = {
  prepareRelease,
  getCurrentVersion,
  updateChangelog,
  validateRelease,
  runTests,
  buildProject,
  checkBundleSize,
  runBenchmarks
};