#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building GoCommander WASM...');

// Ensure we're in the right directory
const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

try {
  // Create output directory
  const wasmDir = path.join(projectRoot, 'wasm');
  if (!fs.existsSync(wasmDir)) {
    fs.mkdirSync(wasmDir, { recursive: true });
  }

  // Set environment variables for WASM build
  const env = {
    ...process.env,
    GOOS: 'js',
    GOARCH: 'wasm'
  };

  console.log('Compiling Go to WASM...');
  
  // Check if TinyGo is available for smaller binaries
  let useTinyGo = false;
  try {
    execSync('tinygo version', { stdio: 'ignore' });
    useTinyGo = true;
    console.log('Using TinyGo for optimized WASM build...');
  } catch (error) {
    console.log('TinyGo not found, using standard Go compiler...');
  }
  
  // Build command with optimization flags
  let buildCmd;
  if (useTinyGo) {
    // TinyGo with optimization flags
    buildCmd = 'tinygo build -o wasm/gocommander.wasm -target wasm -opt 2 -gc leaking -no-debug ./bridge';
  } else {
    // Standard Go with optimization flags
    buildCmd = 'go build -ldflags="-s -w" -o wasm/gocommander.wasm ./bridge';
  }
  
  execSync(buildCmd, {
    env,
    stdio: 'inherit',
    cwd: projectRoot
  });

  // Get Go root for wasm_exec.js
  const goRoot = execSync('go env GOROOT', { encoding: 'utf8' }).trim();
  const wasmExecSource = path.join(goRoot, 'misc', 'wasm', 'wasm_exec.js');
  const wasmExecDest = path.join(wasmDir, 'wasm_exec.js');

  console.log('Copying WASM support files...');
  
  if (fs.existsSync(wasmExecSource)) {
    fs.copyFileSync(wasmExecSource, wasmExecDest);
  } else {
    console.error('Warning: wasm_exec.js not found in Go installation');
  }

  // Create a test HTML file
  const testHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>GoCommander WASM Test</title>
</head>
<body>
    <h1>GoCommander WASM Test</h1>
    <div id="output"></div>
    <button onclick="testGoCommander()">Test GoCommander</button>
    
    <script src="wasm_exec.js"></script>
    <script>
        let goCommanderReady = false;
        
        const go = new Go();
        WebAssembly.instantiateStreaming(fetch("gocommander.wasm"), go.importObject).then((result) => {
            go.run(result.instance);
            
            // Wait for gocommander to be available
            const checkReady = () => {
                if (typeof gocommander !== 'undefined') {
                    goCommanderReady = true;
                    document.getElementById('output').innerHTML = 'GoCommander WASM loaded successfully!';
                    console.log('GoCommander WASM loaded successfully!');
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            checkReady();
        }).catch((err) => {
            console.error('Failed to load WASM:', err);
            document.getElementById('output').innerHTML = 'Failed to load WASM: ' + err;
        });
        
        function testGoCommander() {
            if (!goCommanderReady) {
                alert('GoCommander WASM not ready yet');
                return;
            }
            
            try {
                // Create a test command
                const cmd = gocommander.createCommand('test', 'Test command');
                console.log('Created command:', cmd);
                
                // Add an option
                const optResult = gocommander.addOption(cmd.id, '-v, --verbose', 'Verbose output', false, false);
                console.log('Added option:', optResult);
                
                // Add an argument
                const argResult = gocommander.addArgument(cmd.id, 'file', 'Input file', true);
                console.log('Added argument:', argResult);
                
                // Test parsing
                const parseResult = gocommander.parseArguments(cmd.id, ['--verbose', 'test.txt']);
                console.log('Parse result:', parseResult);
                
                document.getElementById('output').innerHTML = 
                    'GoCommander test completed successfully!<br>' +
                    'Check console for details.';
            } catch (error) {
                console.error('Test failed:', error);
                document.getElementById('output').innerHTML = 'Test failed: ' + error;
            }
        }
    </script>
</body>
</html>`;

  fs.writeFileSync(path.join(wasmDir, 'test.html'), testHtml);

  console.log('WASM build complete!');
  console.log('Files generated:');
  console.log('  - wasm/gocommander.wasm');
  console.log('  - wasm/wasm_exec.js');
  console.log('  - wasm/test.html');
  console.log('');
  console.log('To test in browser:');
  console.log('  1. Start a local server: cd wasm && python3 -m http.server 8080');
  console.log('  2. Open http://localhost:8080/test.html');

} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}