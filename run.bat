@echo off
REM ResourceGuard: one-command setup for Windows (needs gcc from MinGW-w64/MSYS2 and Node.js 18+).
REM   run.bat         build C engine + tests, build dashboard, serve on :4000
REM   run.bat --dev   use the Vite dev server on :5173
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=4000

where gcc >nul 2>nul || (echo [x] gcc not found. Install MinGW-w64 or MSYS2 and add gcc to PATH. & exit /b 1)
where node >nul 2>nul || (echo [x] Node.js not found. Install Node 18+. & exit /b 1)

echo.
echo == Building the C engine (C17, -Wall -Wextra -Werror)
if not exist core\build mkdir core\build
set CFLAGS=-std=c17 -Wall -Wextra -Werror -pedantic -O2 -Icore\include
set SRC=core\src\state.c core\src\banker.c core\src\json.c core\src\print.c core\src\jsonmode.c core\src\cli.c
gcc %CFLAGS% %SRC% core\src\main.c -o core\build\resourceguard.exe || exit /b 1
echo [ok] core\build\resourceguard.exe

echo == Running C unit tests
gcc -std=c17 -Wall -Wextra -Werror -pedantic -O0 -g -DRG_DEBUG -Icore\include core\tests\test_banker.c %SRC% -o core\build\test_banker.exe || exit /b 1
core\build\test_banker.exe > core\build\test-output.txt || (type core\build\test-output.txt & echo [x] C tests failed & exit /b 1)
echo [ok] C tests passed

echo == Installing web dependencies
if not exist server\node_modules (pushd server & call npm install --no-audit --no-fund --loglevel=error & popd)
if not exist web\node_modules (pushd web & call npm install --no-audit --no-fund --loglevel=error & popd)

if "%1"=="--dev" (
  start "ResourceGuard API" cmd /c "cd server && node index.js"
  echo.
  echo   ResourceGuard is running at  http://localhost:5173
  pushd web & call npx vite --port 5173 & popd
  goto :eof
)

echo == Building the dashboard
pushd web & call npm run build --silent & popd
echo.
echo   ResourceGuard is running at  http://localhost:%PORT%
echo   Press Ctrl+C to stop.
cd server && node index.js
