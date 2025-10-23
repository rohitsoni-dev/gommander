#!/bin/bash

# Build script for GoCommander WASM

set -e

echo "Building GoCommander WASM..."

# Set WASM environment variables
export GOOS=js
export GOARCH=wasm

# Create output directory
mkdir -p wasm

# Build the WASM binary
echo "Compiling Go to WASM..."
go build -o wasm/gocommander.wasm bridge/interface.go

# Copy the Go WASM support file
echo "Copying WASM support files..."
cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" wasm/

# Create a minimal HTML test file for WASM
cat > wasm/test.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>GoCommander WASM Test</title>
</head>
<body>
    <h1>GoCommander WASM Test</h1>
    <div id="output"></div>
    
    <script src="wasm_exec.js"></script>
    <script>
        const go = new Go();
        WebAssembly.instantiateStreaming(fetch("gocommander.wasm"), go.importObject).then((result) => {
            go.run(result.instance);
            
            // Test the WASM interface
            if (typeof gocommander !== 'undefined') {
                console.log('GoCommander WASM loaded successfully!');
                
                // Create a test command
                const cmd = gocommander.createCommand('test', 'Test command');
                console.log('Created command:', cmd);
                
                document.getElementById('output').innerHTML = 'GoCommander WASM loaded successfully!';
            } else {
                console.error('GoCommander WASM failed to load');
                document.getElementById('output').innerHTML = 'GoCommander WASM failed to load';
            }
        }).catch((err) => {
            console.error('Failed to load WASM:', err);
            document.getElementById('output').innerHTML = 'Failed to load WASM: ' + err;
        });
    </script>
</body>
</html>
EOF

echo "WASM build complete!"
echo "Files generated:"
echo "  - wasm/gocommander.wasm"
echo "  - wasm/wasm_exec.js"
echo "  - wasm/test.html"
echo ""
echo "To test in browser, serve the wasm directory with an HTTP server:"
echo "  cd wasm && python3 -m http.server 8080"
echo "  Then open http://localhost:8080/test.html"