const fs = require('fs');
const path = require('path');
const { nodeJSIntegration } = require('./nodejs-integration');

/**
 * Enhanced version support for GoCommander
 * Provides version management with custom flags, descriptions, and environment integration
 */
class VersionSupport {
    constructor() {
        this.versionSources = new Map();
        this.versionFormatters = new Map();
        this.versionValidators = new Map();
    }

    /**
     * Enhanced version method with custom flag and description support
     */
    createVersionOption(version, flags = '-V, --version', description = 'display version number', options = {}) {
        const {
            formatter = null,
            validator = null,
            source = 'manual',
            includeNodeVersion = false,
            includePackageInfo = false,
            includeBuildInfo = false,
            customInfo = {},
            exitCode = 0
        } = options;

        // Validate version string
        if (validator) {
            const isValid = validator(version);
            if (!isValid) {
                throw new Error(`Invalid version string: ${version}`);
            }
        }

        // Store version information
        this.versionSources.set('current', {
            version,
            source,
            flags,
            description,
            formatter,
            includeNodeVersion,
            includePackageInfo,
            includeBuildInfo,
            customInfo,
            exitCode,
            timestamp: new Date().toISOString()
        });

        return {
            flags,
            description,
            action: () => this.displayVersion(version, options),
            version,
            options
        };
    }

    /**
     * Display version information with enhanced formatting
     */
    displayVersion(version, options = {}) {
        const versionInfo = this.versionSources.get('current') || {};
        const {
            formatter = null,
            includeNodeVersion = false,
            includePackageInfo = false,
            includeBuildInfo = false,
            customInfo = {},
            exitCode = 0
        } = { ...versionInfo, ...options };

        let output = version;

        // Apply custom formatter
        if (formatter && typeof formatter === 'function') {
            output = formatter(version, this.buildVersionContext());
        } else {
            // Build enhanced version output
            const versionData = {
                version,
                ...customInfo
            };

            if (includeNodeVersion) {
                const nodeInfo = nodeJSIntegration.getDebuggingInfo();
                versionData.node = nodeInfo.process.version;
                versionData.platform = `${nodeInfo.process.platform}-${nodeInfo.process.arch}`;
            }

            if (includePackageInfo) {
                const packageInfo = this.getPackageInfo();
                if (packageInfo) {
                    versionData.package = packageInfo.name;
                    versionData.description = packageInfo.description;
                    versionData.author = packageInfo.author;
                }
            }

            if (includeBuildInfo) {
                const buildInfo = this.getBuildInfo();
                versionData.build = buildInfo;
            }

            // Format output
            if (Object.keys(versionData).length > 1) {
                output = this.formatVersionObject(versionData);
            }
        }

        console.log(output);
        process.exit(exitCode);
    }

    /**
     * Build version context for formatters
     */
    buildVersionContext() {
        const nodeInfo = nodeJSIntegration.getDebuggingInfo();
        const packageInfo = this.getPackageInfo();
        const buildInfo = this.getBuildInfo();

        return {
            node: nodeInfo,
            package: packageInfo,
            build: buildInfo,
            environment: this.getEnvironmentInfo(),
            runtime: this.getRuntimeInfo()
        };
    }

    /**
     * Format version object as readable output
     */
    formatVersionObject(versionData) {
        const lines = [];
        
        // Main version line
        if (versionData.package && versionData.version) {
            lines.push(`${versionData.package} ${versionData.version}`);
        } else {
            lines.push(versionData.version);
        }

        // Description
        if (versionData.description) {
            lines.push(`  ${versionData.description}`);
        }

        // Node.js version
        if (versionData.node) {
            lines.push(`  Node.js: ${versionData.node}`);
        }

        // Platform
        if (versionData.platform) {
            lines.push(`  Platform: ${versionData.platform}`);
        }

        // Build information
        if (versionData.build) {
            if (versionData.build.date) {
                lines.push(`  Built: ${versionData.build.date}`);
            }
            if (versionData.build.commit) {
                lines.push(`  Commit: ${versionData.build.commit}`);
            }
            if (versionData.build.branch) {
                lines.push(`  Branch: ${versionData.build.branch}`);
            }
        }

        // Author
        if (versionData.author) {
            const authorStr = typeof versionData.author === 'string' ? 
                versionData.author : 
                `${versionData.author.name} <${versionData.author.email}>`;
            lines.push(`  Author: ${authorStr}`);
        }

        // Custom information
        for (const [key, value] of Object.entries(versionData)) {
            if (!['version', 'package', 'description', 'node', 'platform', 'build', 'author'].includes(key)) {
                lines.push(`  ${key}: ${value}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Get package information from package.json
     */
    getPackageInfo() {
        try {
            // Try to find package.json starting from current directory
            let currentDir = process.cwd();
            let packagePath = null;

            while (currentDir !== path.dirname(currentDir)) {
                const testPath = path.join(currentDir, 'package.json');
                if (fs.existsSync(testPath)) {
                    packagePath = testPath;
                    break;
                }
                currentDir = path.dirname(currentDir);
            }

            if (packagePath) {
                const packageContent = fs.readFileSync(packagePath, 'utf8');
                return JSON.parse(packageContent);
            }
        } catch (error) {
            // Ignore errors and return null
        }
        return null;
    }

    /**
     * Get build information
     */
    getBuildInfo() {
        const buildInfo = {};

        // Try to get build date from various sources
        try {
            // Check for build timestamp file
            const buildTimestampPath = path.join(process.cwd(), '.build-timestamp');
            if (fs.existsSync(buildTimestampPath)) {
                buildInfo.date = fs.readFileSync(buildTimestampPath, 'utf8').trim();
            }

            // Check for git information
            const gitHeadPath = path.join(process.cwd(), '.git', 'HEAD');
            if (fs.existsSync(gitHeadPath)) {
                const headContent = fs.readFileSync(gitHeadPath, 'utf8').trim();
                if (headContent.startsWith('ref: ')) {
                    // Branch reference
                    const refPath = headContent.substring(5);
                    buildInfo.branch = path.basename(refPath);
                    
                    const refFilePath = path.join(process.cwd(), '.git', refPath);
                    if (fs.existsSync(refFilePath)) {
                        buildInfo.commit = fs.readFileSync(refFilePath, 'utf8').trim().substring(0, 8);
                    }
                } else {
                    // Direct commit hash
                    buildInfo.commit = headContent.substring(0, 8);
                }
            }

            // Check environment variables for build info
            buildInfo.buildNumber = process.env.BUILD_NUMBER || process.env.CI_BUILD_NUMBER;
            buildInfo.buildId = process.env.BUILD_ID || process.env.CI_BUILD_ID;
            buildInfo.buildUrl = process.env.BUILD_URL || process.env.CI_BUILD_URL;
        } catch (error) {
            // Ignore errors
        }

        return Object.keys(buildInfo).length > 0 ? buildInfo : null;
    }

    /**
     * Get environment information relevant to versioning
     */
    getEnvironmentInfo() {
        return {
            nodeEnv: process.env.NODE_ENV,
            ci: !!(process.env.CI || process.env.CONTINUOUS_INTEGRATION),
            docker: fs.existsSync('/.dockerenv'),
            kubernetes: !!(process.env.KUBERNETES_SERVICE_HOST),
            aws: !!(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION),
            heroku: !!(process.env.DYNO),
            vercel: !!(process.env.VERCEL),
            netlify: !!(process.env.NETLIFY)
        };
    }

    /**
     * Get runtime information
     */
    getRuntimeInfo() {
        const nodeInfo = nodeJSIntegration.getDebuggingInfo();
        return {
            uptime: nodeInfo.process.uptime,
            memory: nodeInfo.memory,
            cpuUsage: nodeInfo.cpuUsage,
            platform: nodeInfo.process.platform,
            arch: nodeInfo.process.arch,
            nodeVersion: nodeInfo.process.version
        };
    }

    /**
     * Register custom version formatter
     */
    registerFormatter(name, formatter) {
        if (typeof formatter !== 'function') {
            throw new Error('Version formatter must be a function');
        }
        this.versionFormatters.set(name, formatter);
        return this;
    }

    /**
     * Register custom version validator
     */
    registerValidator(name, validator) {
        if (typeof validator !== 'function') {
            throw new Error('Version validator must be a function');
        }
        this.versionValidators.set(name, validator);
        return this;
    }

    /**
     * Get registered formatter
     */
    getFormatter(name) {
        return this.versionFormatters.get(name);
    }

    /**
     * Get registered validator
     */
    getValidator(name) {
        return this.versionValidators.get(name);
    }

    /**
     * Semantic version validation
     */
    validateSemVer(version) {
        const semVerRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
        return semVerRegex.test(version);
    }

    /**
     * Parse semantic version
     */
    parseSemVer(version) {
        if (!this.validateSemVer(version)) {
            throw new Error(`Invalid semantic version: ${version}`);
        }

        const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+(.+))?$/);
        if (!match) {
            throw new Error(`Failed to parse semantic version: ${version}`);
        }

        return {
            major: parseInt(match[1], 10),
            minor: parseInt(match[2], 10),
            patch: parseInt(match[3], 10),
            prerelease: match[4] || null,
            build: match[5] || null,
            raw: version
        };
    }

    /**
     * Compare semantic versions
     */
    compareSemVer(version1, version2) {
        const v1 = this.parseSemVer(version1);
        const v2 = this.parseSemVer(version2);

        if (v1.major !== v2.major) return v1.major - v2.major;
        if (v1.minor !== v2.minor) return v1.minor - v2.minor;
        if (v1.patch !== v2.patch) return v1.patch - v2.patch;

        // Handle prerelease comparison
        if (v1.prerelease && !v2.prerelease) return -1;
        if (!v1.prerelease && v2.prerelease) return 1;
        if (v1.prerelease && v2.prerelease) {
            return v1.prerelease.localeCompare(v2.prerelease);
        }

        return 0;
    }

    /**
     * Get version from environment variable
     */
    getVersionFromEnv(envVar = 'VERSION', options = {}) {
        return nodeJSIntegration.getEnvironmentVariable(envVar, {
            type: 'string',
            ...options
        });
    }

    /**
     * Set version in environment
     */
    setVersionInEnv(version, envVar = 'VERSION', options = {}) {
        return nodeJSIntegration.setEnvironmentVariable(envVar, version, {
            validate: this.validateSemVer,
            ...options
        });
    }

    /**
     * Create version option from package.json
     */
    createVersionFromPackage(flags, description, options = {}) {
        const packageInfo = this.getPackageInfo();
        if (!packageInfo || !packageInfo.version) {
            throw new Error('No version found in package.json');
        }

        return this.createVersionOption(
            packageInfo.version,
            flags,
            description,
            {
                source: 'package.json',
                includePackageInfo: true,
                ...options
            }
        );
    }

    /**
     * Create version option from environment variable
     */
    createVersionFromEnv(envVar, flags, description, options = {}) {
        const version = this.getVersionFromEnv(envVar, options);
        if (!version) {
            throw new Error(`No version found in environment variable ${envVar}`);
        }

        return this.createVersionOption(
            version,
            flags,
            description,
            {
                source: `env:${envVar}`,
                ...options
            }
        );
    }

    /**
     * Get all version sources
     */
    getVersionSources() {
        return new Map(this.versionSources);
    }

    /**
     * Clear version sources
     */
    clearVersionSources() {
        this.versionSources.clear();
        return this;
    }
}

// Create singleton instance
const versionSupport = new VersionSupport();

// Register default formatters
versionSupport.registerFormatter('simple', (version) => version);
versionSupport.registerFormatter('detailed', (version, context) => {
    return versionSupport.formatVersionObject({
        version,
        node: context.node.process.version,
        platform: `${context.node.process.platform}-${context.node.process.arch}`,
        package: context.package?.name,
        description: context.package?.description
    });
});

// Register default validators
versionSupport.registerValidator('semver', versionSupport.validateSemVer.bind(versionSupport));
versionSupport.registerValidator('any', () => true);

module.exports = {
    VersionSupport,
    versionSupport
};