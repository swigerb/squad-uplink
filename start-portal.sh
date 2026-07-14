#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# ---- Quick checks (skip if already set up) ----

# Node.js
if ! command -v node &>/dev/null; then
    echo
    echo "  Node.js not found."
    echo "  Please install Node.js v22+ from https://nodejs.org"
    echo "  then re-run this script."
    exit 1
fi

# Dependencies (only if node_modules is missing)
if [ ! -d node_modules ]; then
    echo
    echo "  First-time setup — installing dependencies..."
    echo
    npm install --no-fund --no-audit
    if [ -f patch.mjs ]; then
        echo "  Applying compatibility patch..."
        node patch.mjs
    fi
    echo
fi

# PowerShell 7 (check once, don't block startup)
if ! command -v pwsh &>/dev/null; then
    echo
    echo "  NOTE: PowerShell 7 is not installed."
    echo "  Copilot CLI uses it for running commands — some tools won't work without it."
    echo "  Install: https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell"
    echo
fi

# GitHub authentication
if ! node -e "try{const f=require('fs').readFileSync(require('path').join(require('os').homedir(),'.copilot','config.json'),'utf8').replace(/^\s*\/\/.*$/gm,'');const c=JSON.parse(f);const u=c.logged_in_users||c.loggedInUsers;process.exit(u&&u.length?0:1)}catch{process.exit(1)}" 2>/dev/null; then
    echo
    echo "  Not signed in to GitHub yet — the portal will open with a sign-in"
    echo "  screen. Click \"Sign in with GitHub\" and follow the device-code"
    echo "  prompt in your browser; no terminal interaction needed."
    echo
    echo "  (Prefer the terminal? You can still run 'npx copilot login' here"
    echo "   before starting, or press Ctrl-C and do so now.)"
    echo
fi

# ---- Start the portal ----
npm start
