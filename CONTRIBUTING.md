# Contributing to GoCommander

Thank you for your interest in contributing to GoCommander! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)
- [Getting Help](#getting-help)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- **Node.js**: Version 14 or later
- **Go**: Version 1.21 or later
- **Git**: For version control
- **npm**: For package management

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/gocommander.git
   cd gocommander
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Project**
   ```bash
   npm run build
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

5. **Verify Everything Works**
   ```bash
   npm run dev
   ```

## Project Structure

```
gocommander/
├── cmd/                    # Go source code (core logic)
│   ├── command.go         # Command structures and logic
│   ├── option.go          # Option parsing and validation
│   └── parser.go          # Main parsing engine
├── bridge/                # WASM bridge layer
│   ├── interface.go       # Go-to-JS interface
│   ├── memory.go          # Memory management
│   └── convert.go         # Type conversion utilities
├── src/                   # JavaScript API layer
│   ├── command.js         # Command class implementation
│   ├── option.js          # Option class implementation
│   ├── argument.js        # Argument class implementation
│   └── wasm-loader.js     # WASM loading utilities
├── tests/                 # Test suites
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── e2e/               # End-to-end tests
├── scripts/               # Build and utility scripts
├── docs/                  # Documentation
├── examples/              # Example applications
└── lib/                   # Built output (generated)
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make Changes

- **Go Code**: Edit files in `cmd/` and `bridge/` directories
- **JavaScript Code**: Edit files in `src/` directory
- **Tests**: Add or update tests in `tests/` directory
- **Documentation**: Update relevant documentation

### 3. Build and Test

```bash
# Build WASM and JavaScript
npm run build

# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run all tests
npm run test:all
```

### 4. Code Quality

```bash
# Check formatting
npm run format:check

# Fix formatting
npm run format

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

## Testing

### Test Types

1. **Unit Tests**: Test individual functions and components
   ```bash
   npm test
   ```

2. **Integration Tests**: Test WASM integration and API compatibility
   ```bash
   npm run test:integration
   ```

3. **End-to-End Tests**: Test complete CLI scenarios
   ```bash
   npm run test:e2e
   ```

4. **Performance Tests**: Benchmark performance against Commander.js
   ```bash
   npm run test:performance
   ```

5. **Compatibility Tests**: Ensure Commander.js API compatibility
   ```bash
   npm run test:compatibility
   ```

### Writing Tests

- **Go Tests**: Use Go's built-in testing framework
  ```go
  func TestCommandParsing(t *testing.T) {
      // Test implementation
  }
  ```

- **JavaScript Tests**: Use Jest
  ```javascript
  describe('Command', () => {
    test('should parse options correctly', () => {
      // Test implementation
    });
  });
  ```

### Test Guidelines

- Write tests for all new features
- Maintain or improve test coverage
- Test both success and error cases
- Include performance regression tests for critical paths
- Test cross-platform compatibility

## Code Style

### Go Code Style

- Follow standard Go formatting (`gofmt`)
- Use meaningful variable and function names
- Add comments for exported functions
- Handle errors appropriately
- Use Go modules for dependencies

### JavaScript Code Style

- Use ESLint and Prettier configurations
- Follow modern JavaScript practices
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Prefer `const` and `let` over `var`

### General Guidelines

- Keep functions small and focused
- Use descriptive commit messages
- Write self-documenting code
- Add comments for complex logic
- Follow existing patterns in the codebase

## Submitting Changes

### Pull Request Process

1. **Update Documentation**
   - Update README.md if needed
   - Update API documentation
   - Add or update examples

2. **Update Tests**
   - Add tests for new features
   - Update existing tests if needed
   - Ensure all tests pass

3. **Update Changelog**
   - Add entry to CHANGELOG.md under "Unreleased"
   - Follow the existing format
   - Include breaking changes if any

4. **Create Pull Request**
   - Use a descriptive title
   - Fill out the PR template
   - Link related issues
   - Request review from maintainers

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] Changelog updated
```

### Commit Message Format

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

Examples:
```
feat(parser): add support for variadic options
fix(wasm): resolve memory leak in bridge layer
docs(api): update Command class documentation
```

## Release Process

### For Maintainers

1. **Prepare Release**
   ```bash
   npm run release:prepare patch  # or minor/major
   ```

2. **Review Changes**
   ```bash
   git show HEAD
   ```

3. **Push and Tag**
   ```bash
   git push origin main
   git tag v1.2.3
   git push origin v1.2.3
   ```

4. **GitHub Actions** will automatically:
   - Run comprehensive tests
   - Build and publish to npm
   - Create GitHub release
   - Update documentation

### Version Management

- **Patch**: Bug fixes and small improvements
- **Minor**: New features, backward compatible
- **Major**: Breaking changes

## Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and discussions
- **Pull Request Reviews**: Code-specific discussions

### Documentation

- **API Documentation**: `docs/api/`
- **Examples**: `examples/`
- **Migration Guide**: `docs/migration-guide.md`
- **Performance Guide**: `docs/performance.md`

### Common Issues

1. **WASM Build Fails**
   - Ensure Go 1.21+ is installed
   - Check GOPATH and GOROOT settings
   - Try `go clean -cache`

2. **Tests Fail**
   - Run `npm run build` first
   - Check Node.js version (14+)
   - Clear npm cache: `npm cache clean --force`

3. **Performance Issues**
   - Run benchmarks: `npm run benchmark`
   - Check bundle size: `npm run size-check`
   - Profile with Node.js tools

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes for significant contributions
- Documentation acknowledgments

Thank you for contributing to GoCommander! 🚀