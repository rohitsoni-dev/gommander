# GoCommander Integration Tests

This directory contains comprehensive integration and end-to-end tests for GoCommander, ensuring compatibility, performance, and cross-platform functionality.

## Test Categories

### 1. End-to-End WASM Integration (`e2e-wasm.test.js`)

Tests the complete GoCommander pipeline from Go source code to JavaScript execution through WebAssembly.

**Key Test Areas:**
- WASM binary loading and initialization
- Real WASM command processing with complex scenarios
- Memory management and string marshaling
- Error handling through the WASM bridge
- Performance under load
- Real-world usage scenarios

**Requirements Covered:**
- 9.5: Performance and memory efficiency
- 10.5: Complete functionality validation

### 2. Commander.js Compatibility (`commander-compatibility.test.js`)

Validates 100% API compatibility with Commander.js to ensure GoCommander can be used as a drop-in replacement.

**Key Test Areas:**
- Core API surface compatibility
- Command creation and configuration
- Option and argument processing
- Parsing behavior consistency
- Error handling compatibility
- Help system compatibility
- Configuration method compatibility
- Lifecycle hooks compatibility

**Requirements Covered:**
- 1.1, 1.2, 1.3, 1.4: Complete API compatibility
- All functional requirements for feature parity

### 3. Cross-Platform Compatibility (`cross-platform.test.js`)

Ensures GoCommander works consistently across Windows, macOS, and Linux platforms.

**Key Test Areas:**
- Platform detection and adaptation
- File path handling (separators, normalization)
- Line ending handling (Unix, Windows, Mac)
- Character encoding support (UTF-8, Unicode)
- Process and environment integration
- File system operations
- Shell integration
- Platform-specific features
- Performance consistency across platforms

**Requirements Covered:**
- 7.1, 7.2, 7.4: Node.js runtime integration
- Cross-platform compatibility requirements

### 4. Performance Benchmarking (`performance-benchmark.test.js`)

Measures and compares GoCommander performance against Commander.js baseline.

**Key Test Areas:**
- Command creation performance
- Parsing performance (simple and complex)
- Memory usage and cleanup
- Startup performance and WASM initialization
- Scalability with large command trees
- Concurrent operation handling
- Real-world scenario performance
- Performance regression detection

**Requirements Covered:**
- 9.2, 9.3, 9.4: Performance and efficiency
- 10.5: Performance benchmarking

## Running Tests

### Prerequisites

1. **Build Requirements:**
   ```bash
   npm run build:wasm  # Build WASM binary
   npm run build:js    # Build JavaScript
   ```

2. **Dependencies:**
   - Node.js 14+ (tested on 14, 16, 18, 20)
   - Go 1.21+ (for WASM compilation)
   - Jest testing framework

### Running Individual Test Categories

```bash
# Run all integration tests
npm run test:integration

# Run specific test categories
npm run test:e2e              # End-to-end WASM tests
npm run test:compatibility    # Commander.js compatibility
npm run test:cross-platform   # Cross-platform tests
npm run test:performance      # Performance benchmarks

# Run all tests (unit + integration)
npm run test:all
```

### Using the Test Runner Script

```bash
# Run specific categories
node scripts/run-integration-tests.js e2e compatibility

# Run all categories
node scripts/run-integration-tests.js

# Available categories: e2e, compatibility, cross-platform, performance
```

### Platform-Specific Testing

The tests automatically adapt to the current platform:

- **Windows:** Handles Windows-specific paths, line endings, and environment variables
- **macOS:** Tests macOS-specific features and paths
- **Linux:** Validates Unix-style behavior and file systems

### CI/CD Integration

Integration tests run automatically in GitHub Actions across multiple platforms and Node.js versions:

```yaml
# .github/workflows/integration-tests.yml
- Ubuntu Latest (Node 14, 16, 18, 20)
- Windows Latest (Node 14, 16, 18, 20)  
- macOS Latest (Node 14, 16, 18, 20)
```

## Test Configuration

### Jest Configuration

```javascript
// jest.config.js - Integration test project
{
  displayName: 'integration',
  testMatch: ['<rootDir>/tests/integration/*.test.js'],
  testTimeout: 60000, // Longer timeout for integration tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
}
```

### Timeouts

- **Unit Tests:** 10 seconds
- **Integration Tests:** 60 seconds  
- **Performance Tests:** 120 seconds
- **E2E Tests:** 60 seconds

### Environment Variables

Tests use these environment variables for configuration:

- `NODE_ENV=test` - Test environment
- `FORCE_COLOR=1` - Colored output in CI
- Platform-specific variables for cross-platform testing

## Performance Benchmarks

### Target Performance Metrics

1. **Command Creation:**
   - GoCommander should be within 3x of Commander.js speed
   - Memory usage < 10KB per command

2. **Parsing Performance:**
   - Simple parsing: within 2x of Commander.js
   - Complex parsing: within 3x of Commander.js
   - Concurrent operations: < 5 seconds for 1000 operations

3. **Memory Usage:**
   - Total memory increase < 50MB for 1000 commands
   - Proper cleanup and garbage collection

4. **Startup Performance:**
   - Module loading: < 100ms
   - WASM initialization: < 500ms

### Benchmark Output Example

```
Command Creation Performance (10000 iterations):
  GoCommander: 245.67ms (0.0246ms per command)
  Commander.js: 123.45ms (0.0123ms per command)
  Ratio: 1.99x

Simple Parsing Performance (10000 iterations):
  GoCommander: 156.78ms (0.0157ms per parse)
  Commander.js: 89.12ms (0.0089ms per parse)
  Ratio: 1.76x
```

## Troubleshooting

### Common Issues

1. **WASM Binary Missing:**
   ```bash
   npm run build:wasm
   ```

2. **JavaScript Build Missing:**
   ```bash
   npm run build:js
   ```

3. **Test Timeouts:**
   - Increase timeout in jest.config.js
   - Check for memory leaks or infinite loops

4. **Platform-Specific Failures:**
   - Check file path separators
   - Verify environment variable access
   - Test with different Node.js versions

### Debug Mode

Enable verbose logging:

```bash
DEBUG=gocommander:* npm run test:integration
```

### Memory Debugging

Force garbage collection in tests:

```bash
node --expose-gc scripts/run-integration-tests.js performance
```

## Contributing

When adding new integration tests:

1. **Follow the existing test structure**
2. **Add appropriate timeouts**
3. **Include cross-platform considerations**
4. **Document performance expectations**
5. **Update this README with new test categories**

### Test Naming Convention

- `*.test.js` - Test files
- `describe('Category Name')` - Test categories
- `test('should do something specific')` - Individual tests

### Performance Test Guidelines

- Use `performance.now()` for timing
- Run multiple iterations for accuracy
- Compare against baseline when possible
- Log results for CI analysis
- Set reasonable performance thresholds

## Requirements Traceability

| Requirement | Test File | Test Description |
|-------------|-----------|------------------|
| 1.1-1.4 | commander-compatibility.test.js | API compatibility validation |
| 7.1, 7.2, 7.4 | cross-platform.test.js | Node.js integration |
| 9.2-9.5 | performance-benchmark.test.js | Performance metrics |
| 10.5 | e2e-wasm.test.js | End-to-end validation |

All integration tests contribute to validating the complete GoCommander system against the specified requirements.