@echo off
REM Build script for GoCommander WASM (Windows)

echo Building GoCommander WASM...

REM Set WASM environment variables
set GOOS=js
set GOARCH=wasm

REM Create output directory
if not exist wasm mkdir wasm

REM Build the WASM binary
echo Compiling Go to WASM...
go build -o wasm/gocommander.wasm bridge/interface.go

REM Copy the Go WASM support file
echo Copying WASM support files...
for /f "tokens=*" %%i in ('go env GOROOT') do set GOROOT=%%i
copy "%GOROOT%\misc\wasm\wasm_exec.js" wasm\

REM Create a minimal HTML test file for WASM
echo ^<!DOCTYPE html^> > wasm\test.html
echo ^<html^> >> wasm\test.html
echo ^<head^> >> wasm\test.html
echo     ^<meta charset="utf-8"^> >> wasm\test.html
echo     ^<title^>GoCommander WASM Test^</title^> >> wasm\test.html
echo ^</head^> >> wasm\test.html
echo ^<body^> >> wasm\test.html
echo     ^<h1^>GoCommander WASM Test^</h1^> >> wasm\test.html
echo     ^<div id="output"^>^</div^> >> wasm\test.html
echo     ^<script src="wasm_exec.js"^>^</script^> >> wasm\test.html
echo     ^<script^> >> wasm\test.html
echo         const go = new Go(); >> wasm\test.html
echo         WebAssembly.instantiateStreaming(fetch("gocommander.wasm"), go.importObject).then((result) =^> { >> wasm\test.html
echo             go.run(result.instance); >> wasm\test.html
echo             if (typeof gocommander !== 'undefined') { >> wasm\test.html
echo                 console.log('GoCommander WASM loaded successfully!'); >> wasm\test.html
echo                 const cmd = gocommander.createCommand('test', 'Test command'); >> wasm\test.html
echo                 console.log('Created command:', cmd); >> wasm\test.html
echo                 document.getElementById('output').innerHTML = 'GoCommander WASM loaded successfully!'; >> wasm\test.html
echo             } else { >> wasm\test.html
echo                 console.error('GoCommander WASM failed to load'); >> wasm\test.html
echo                 document.getElementById('output').innerHTML = 'GoCommander WASM failed to load'; >> wasm\test.html
echo             } >> wasm\test.html
echo         }).catch((err) =^> { >> wasm\test.html
echo             console.error('Failed to load WASM:', err); >> wasm\test.html
echo             document.getElementById('output').innerHTML = 'Failed to load WASM: ' + err; >> wasm\test.html
echo         }); >> wasm\test.html
echo     ^</script^> >> wasm\test.html
echo ^</body^> >> wasm\test.html
echo ^</html^> >> wasm\test.html

echo WASM build complete!
echo Files generated:
echo   - wasm/gocommander.wasm
echo   - wasm/wasm_exec.js
echo   - wasm/test.html
echo.
echo To test in browser, serve the wasm directory with an HTTP server
echo Then open the test.html file