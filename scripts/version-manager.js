#!/usr/bin/env node

/**
 * Version management utilities
 * Handles version bumping, validation, and release preparation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_JSON_PATH = path.join(__dirname, '..', 'package.json');

class VersionManager {
  constructor() {
    this.packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  }

  getCurrentVersion() {
    return this.packageJson.version;
  }

  parseVersion(version) {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
    if (!match) {
      throw new Error(`Invalid version format: ${version}`);
    }
    
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4] || null
    };
  }

  bumpVersion(type, prerelease = null) {
    const current = this.parseVersion(this.getCurrentVersion());
    let newVersion;

    switch (type) {
      case 'major':
        newVersion = `${current.major + 1}.0.0`;
        break;
      case 'minor':
        newVersion = `${current.major}.${current.minor + 1}.0`;
        break;
      case 'patch':
        newVersion = `${current.major}.${current.minor}.${current.patch + 1}`;
        break;
      case 'prerelease':
        if (current.prerelease) {
          const prereleaseMatch = current.prerelease.match(/^(.+)\.(\d+)$/);
          if (prereleaseMatch) {
            const prereleaseType = prereleaseMatch[1];
            const prereleaseNumber = parseInt(prereleaseMatch[2], 10) + 1;
            newVersion = `${current.major}.${current.minor}.${current.patch}-${prereleaseType}.${prereleaseNumber}`;
          } else {
            newVersion = `${current.major}.${current.minor}.${current.patch}-${current.prerelease}.1`;
          }
        } else {
          const prereleaseType = prerelease || 'alpha';
          newVersion = `${current.major}.${current.minor}.${current.patch + 1}-${prereleaseType}.0`;
        }
        break;
      default:
        throw new Error(`Invalid version type: ${type}`);
    }

    return newVersion;
  }

  updatePackageVersion(newVersion) {
    this.packageJson.version = newVersion;
    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(this.packageJson, null, 2) + '\n');
    console.log(`✅ Updated package.json version to ${newVersion}`);
  }

  validateVersion(version) {
    try {
      this.parseVersion(version);
      return true;
    } catch (error) {
      return false;
    }
  }

  getNextVersions() {
    const current = this.getCurrentVersion();
    return {
      current,
      patch: this.bumpVersion('patch'),
      minor: this.bumpVersion('minor'),
      major: this.bumpVersion('major'),
      prerelease: this.bumpVersion('prerelease', 'alpha')
    };
  }

  checkNpmVersion(version) {
    try {
      const result = execSync(`npm view gocommander@${version} version`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return result.trim() === version;
    } catch (error) {
      return false;
    }
  }

  getLatestNpmVersion() {
    try {
      const result = execSync('npm view gocommander version', { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      return result.trim();
    } catch (error) {
      return null;
    }
  }

  compareVersions(v1, v2) {
    const version1 = this.parseVersion(v1);
    const version2 = this.parseVersion(v2);

    if (version1.major !== version2.major) {
      return version1.major - version2.major;
    }
    if (version1.minor !== version2.minor) {
      return version1.minor - version2.minor;
    }
    if (version1.patch !== version2.patch) {
      return version1.patch - version2.patch;
    }

    // Handle prerelease comparison
    if (version1.prerelease && !version2.prerelease) return -1;
    if (!version1.prerelease && version2.prerelease) return 1;
    if (version1.prerelease && version2.prerelease) {
      return version1.prerelease.localeCompare(version2.prerelease);
    }

    return 0;
  }

  generateReleaseNotes(version) {
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    
    // Extract section for this version
    const versionRegex = new RegExp(`## \\[${version}\\]([\\s\\S]*?)(?=## \\[|$)`);
    const match = changelog.match(versionRegex);
    
    if (match) {
      return match[1].trim();
    }
    
    return `Release notes for version ${version} not found in CHANGELOG.md`;
  }

  showVersionInfo() {
    const versions = this.getNextVersions();
    const npmVersion = this.getLatestNpmVersion();
    
    console.log('📦 Version Information');
    console.log('─'.repeat(50));
    console.log(`Current version: ${versions.current}`);
    console.log(`NPM version:     ${npmVersion || 'Not published'}`);
    console.log('');
    console.log('Next versions:');
    console.log(`  Patch:      ${versions.patch}`);
    console.log(`  Minor:      ${versions.minor}`);
    console.log(`  Major:      ${versions.major}`);
    console.log(`  Prerelease: ${versions.prerelease}`);
    
    if (npmVersion) {
      const comparison = this.compareVersions(versions.current, npmVersion);
      if (comparison > 0) {
        console.log('\n✅ Local version is ahead of NPM');
      } else if (comparison < 0) {
        console.log('\n⚠️  Local version is behind NPM');
      } else {
        console.log('\n🔄 Local version matches NPM');
      }
    }
  }
}

// CLI interface
function showUsage() {
  console.log('Usage: node scripts/version-manager.js <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  info                    Show current version information');
  console.log('  bump <type>            Bump version (patch|minor|major|prerelease)');
  console.log('  set <version>          Set specific version');
  console.log('  check <version>        Check if version exists on NPM');
  console.log('  compare <v1> <v2>      Compare two versions');
  console.log('  notes <version>        Generate release notes for version');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/version-manager.js info');
  console.log('  node scripts/version-manager.js bump patch');
  console.log('  node scripts/version-manager.js set 1.2.3');
  console.log('  node scripts/version-manager.js check 1.2.3');
  console.log('  node scripts/version-manager.js compare 1.2.3 1.2.4');
  console.log('  node scripts/version-manager.js notes 1.2.3');
}

if (require.main === module) {
  const versionManager = new VersionManager();
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'info':
        versionManager.showVersionInfo();
        break;

      case 'bump':
        if (!arg || !['patch', 'minor', 'major', 'prerelease'].includes(arg)) {
          console.error('❌ Invalid bump type. Use: patch, minor, major, or prerelease');
          process.exit(1);
        }
        const newVersion = versionManager.bumpVersion(arg);
        console.log(`Bumping ${arg}: ${versionManager.getCurrentVersion()} → ${newVersion}`);
        versionManager.updatePackageVersion(newVersion);
        break;

      case 'set':
        if (!arg || !versionManager.validateVersion(arg)) {
          console.error('❌ Invalid version format. Use semantic versioning (e.g., 1.2.3)');
          process.exit(1);
        }
        console.log(`Setting version: ${versionManager.getCurrentVersion()} → ${arg}`);
        versionManager.updatePackageVersion(arg);
        break;

      case 'check':
        if (!arg) {
          console.error('❌ Please specify a version to check');
          process.exit(1);
        }
        const exists = versionManager.checkNpmVersion(arg);
        console.log(`Version ${arg} ${exists ? 'exists' : 'does not exist'} on NPM`);
        break;

      case 'compare':
        const v2 = process.argv[4];
        if (!arg || !v2) {
          console.error('❌ Please specify two versions to compare');
          process.exit(1);
        }
        const result = versionManager.compareVersions(arg, v2);
        if (result > 0) {
          console.log(`${arg} is newer than ${v2}`);
        } else if (result < 0) {
          console.log(`${arg} is older than ${v2}`);
        } else {
          console.log(`${arg} is the same as ${v2}`);
        }
        break;

      case 'notes':
        if (!arg) {
          console.error('❌ Please specify a version for release notes');
          process.exit(1);
        }
        const notes = versionManager.generateReleaseNotes(arg);
        console.log(`Release notes for version ${arg}:`);
        console.log('─'.repeat(50));
        console.log(notes);
        break;

      default:
        if (command) {
          console.error(`❌ Unknown command: ${command}`);
        }
        showUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

module.exports = VersionManager;