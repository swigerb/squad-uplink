@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Copilot Portal

echo.
echo ========================================
echo   Copilot Portal - Setup
echo ========================================
echo.

:: ---- Step 1: Node.js ----
echo [1/4] Checking for Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo       Node.js not found. Installing via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    title Copilot Portal
    if !errorlevel! neq 0 (
        echo.
        echo  ERROR: Could not install Node.js automatically.
        echo  Please install Node.js v22+ from https://nodejs.org
        echo  then re-run this script.
        goto :done
    )
    echo.
    echo  Node.js installed. Please close this window, open a
    echo  new terminal, and re-run start-portal.cmd.
    goto :done
)
for /f "tokens=*" %%v in ('node --version') do echo       Found Node.js %%v

:: ---- Step 2: Dependencies ----
echo.
echo [2/4] Checking dependencies...
if exist node_modules goto :deps_ok
echo       Installing npm packages (first-time setup)...
call npm install --no-fund --no-audit
title Copilot Portal
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: npm install failed. See errors above.
    goto :done
)
echo       Done.
goto :deps_done
:deps_ok
echo       Dependencies already installed.
:deps_done

:: ---- Step 3: PowerShell 7 ----
echo.
echo [3/4] Checking for PowerShell 7...
pwsh --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('pwsh --version') do echo       Found %%v
    goto :pwsh_done
)
echo       PowerShell 7 is not installed.
echo       Copilot CLI uses it for running commands - some tools won't work without it.
echo.
set /p INSTALL_PWSH="       Install PowerShell 7 now? (Y/n): "
if /i "!INSTALL_PWSH!"=="n" goto :pwsh_done
winget install Microsoft.PowerShell --accept-source-agreements --accept-package-agreements
title Copilot Portal
if %errorlevel% neq 0 (
    echo.
    echo       Could not install automatically. You can install later with:
    echo         winget install Microsoft.PowerShell
) else (
    echo       PowerShell 7 installed successfully.
)
:pwsh_done

:: ---- Step 4: GitHub authentication ----
echo.
echo [4/4] Checking GitHub authentication...
node -e "try{const c=JSON.parse(require('fs').readFileSync(require('path').join(require('os').homedir(),'.copilot','config.json'),'utf8'));process.exit(c.logged_in_users&&c.logged_in_users.length?0:1)}catch{process.exit(1)}" >nul 2>&1
if %errorlevel% equ 0 (
    echo       Already authenticated.
    goto :auth_done
)
echo       Not signed in. A browser window will open so you
echo       can sign in with your GitHub account.
echo.
call node_modules\.bin\copilot.cmd login
title Copilot Portal
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: GitHub login failed. Please try again.
    goto :done
)
:auth_done

:: Check if port is already in use
netstat -ano 2>nul | findstr ":3847.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo  Port 3847 is already in use - the portal may already be running.
    echo  Close the other instance first, or use: npm start -- --port 3849
    goto :done
)

:: ---- Start the portal ----
echo.
echo ========================================
echo   Starting Copilot Portal...
echo ========================================
echo.
call npm start -- %*
title Copilot Portal

:done
echo.
pause
