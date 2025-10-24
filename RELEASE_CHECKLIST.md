# GoCommander Release Checklist

This checklist ensures a smooth and reliable release process for GoCommander.

## Pre-Release Checklist

### 🔍 Code Quality
- [ ] All tests pass (`npm test`)
- [ ] Integration tests pass (`npm run test:integration`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code formatting is correct (`npm run format:check`)
- [ ] No security vulnerabilities (`npm audit`)

### 📦 Package Validation
- [ ] Quick validation passes (`npm run validate`)
- [ ] Full validation passes (`npm run validate:full`)
- [ ] Build completes successfully (`npm run build`)
- [ ] Bundle size is acceptable (`npm run size-check`)
- [ ] Examples work correctly (`npm run examples:run`)

### 📚 Documentation
- [ ] README.md is up to date
- [ ] CHANGELOG.md has entry for new version
- [ ] API documentation is current
- [ ] Migration guide is accurate
- [ ] Examples demonstrate key features

### 🔄 Version Management
- [ ] Version number follows semantic versioning
- [ ] Version is updated in package.json
- [ ] CHANGELOG.md reflects the version
- [ ] No version conflicts with npm registry

### 🌐 Git Repository
- [ ] Working directory is clean
- [ ] All changes are committed
- [ ] On main branch
- [ ] Up to date with remote
- [ ] All required files are tracked

## Release Process

### 1. Prepare Release
```bash
# Automated preparation
npm run release:prepare [patch|minor|major]

# Manual steps if needed
npm run version:info
npm run version:bump patch
```

### 2. Validate Release
```bash
# Quick validation
npm run validate

# Full validation (optional)
npm run validate:full

# Final build and test
npm run build
npm run test:ci
```

### 3. Create Release
```bash
# Push changes
git push origin main

# Create and push tag
git tag v1.0.3
git push origin v1.0.3

# Or use GitHub CLI
gh release create v1.0.3 --generate-notes
```

### 4. Automated Release (GitHub Actions)
The release workflow will automatically:
- [ ] Build on all platforms (Windows, macOS, Linux)
- [ ] Test on multiple Node.js versions (14, 16, 18, 20)
- [ ] Run comprehensive test suite
- [ ] Check bundle size and performance
- [ ] Publish to npm registry
- [ ] Create GitHub release with assets
- [ ] Update documentation site
- [ ] Send notifications

## Post-Release Checklist

### ✅ Verification
- [ ] Package is available on npm (`npm view gocommander`)
- [ ] Installation works (`npm install gocommander`)
- [ ] Basic functionality works
- [ ] Documentation site is updated
- [ ] GitHub release is created

### 📢 Communication
- [ ] Release notes are published
- [ ] Social media announcements (if major release)
- [ ] Update dependent projects
- [ ] Notify community/users

### 🔍 Monitoring
- [ ] Monitor for installation issues
- [ ] Watch for bug reports
- [ ] Check download statistics
- [ ] Review user feedback

## Emergency Procedures

### 🚨 If Release Fails
1. **Check GitHub Actions logs** for failure details
2. **Fix issues** in a new commit
3. **Re-run release process** or trigger manual workflow
4. **Communicate delays** if significant

### 🔄 If Rollback Needed
1. **Deprecate problematic version**: `npm deprecate gocommander@1.0.3 "Issue found, use 1.0.2"`
2. **Publish hotfix version**: Follow emergency release process
3. **Update documentation** to reflect changes
4. **Communicate issue** to users

### 📞 Emergency Contacts
- **Primary Maintainer**: [Contact Info]
- **Backup Maintainer**: [Contact Info]
- **npm Account**: [Account Details]
- **GitHub Admin**: [Contact Info]

## Release Types

### 🔧 Patch Release (1.0.0 → 1.0.1)
- Bug fixes
- Security patches
- Documentation updates
- Performance improvements (non-breaking)

### ✨ Minor Release (1.0.0 → 1.1.0)
- New features (backward compatible)
- New APIs (backward compatible)
- Deprecations (with migration path)
- Significant performance improvements

### 🚀 Major Release (1.0.0 → 2.0.0)
- Breaking changes
- API removals
- Major architecture changes
- Minimum Node.js version changes

## Automation Scripts

### Available Commands
```bash
# Version management
npm run version:info          # Show version information
npm run version:bump patch    # Bump patch version
npm run version:set 1.2.3     # Set specific version

# Release preparation
npm run release:prepare       # Prepare patch release
npm run release:prepare minor # Prepare minor release
npm run release:prepare major # Prepare major release

# Validation
npm run validate              # Quick validation
npm run validate:full         # Comprehensive validation

# Build and test
npm run build                 # Build project
npm run test:ci               # Run CI test suite
npm run benchmark             # Performance benchmarks
```

### Manual Release (if automation fails)
```bash
# 1. Prepare
npm run build
npm run test:ci
npm run validate

# 2. Version
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to 1.0.4"

# 3. Tag and push
git tag v1.0.4
git push origin main
git push origin v1.0.4

# 4. Publish
npm publish

# 5. Create GitHub release
gh release create v1.0.4 --generate-notes
```

## Quality Gates

### Minimum Requirements
- [ ] ✅ All unit tests pass
- [ ] ✅ No linting errors
- [ ] ✅ Bundle size < 500KB
- [ ] ✅ Performance benchmarks pass
- [ ] ✅ Cross-platform compatibility
- [ ] ✅ Node.js 14+ compatibility
- [ ] ✅ Zero security vulnerabilities

### Performance Benchmarks
- [ ] ✅ 2-5x faster than Commander.js
- [ ] ✅ Memory usage within acceptable limits
- [ ] ✅ Startup time < 10ms additional overhead
- [ ] ✅ WASM loading time < 50ms

### Compatibility Requirements
- [ ] ✅ 100% Commander.js API compatibility
- [ ] ✅ TypeScript definitions accurate
- [ ] ✅ CommonJS and ES modules support
- [ ] ✅ Works in all supported Node.js versions

---

**Remember**: It's better to delay a release than to ship a broken one. When in doubt, run additional tests and validations.