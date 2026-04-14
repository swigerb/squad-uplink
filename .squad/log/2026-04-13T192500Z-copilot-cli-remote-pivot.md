# Session: GitHub Copilot CLI Remote Pivot Analysis

**Timestamp:** 2026-04-13T19:25:00Z  
**Type:** Architecture Review

## Summary

Brady reported that GitHub has removed Squad RC in favor of a native `copilot --remote` feature (real-time remote CLI access via github.com/OWNER/REPO/tasks/TASK_ID). This eliminates squad-uplink's core Remote Control value prop.

Jobs analyzed the impact, evaluated 3 strategic options, and recommended **Option 1: Launcher/Dashboard**. squad-uplink pivots from Remote Control tool to retro-themed session launcher for `copilot --remote`. Preserves 100% UI investment, delivers 2-week MVP, positions squad-uplink as premium local session chrome.

**Obsolete Code:** ConnectionManager.ts, commands.ts, squad-rc.ts, squad-rc-launch.mjs  
**Retained Code:** xterm.js, theme engine, audio, TelemetryDrawer  
**New Implementation:** LocalProcessManager, dashboard panel, process monitoring  
**Timeline:** 2 weeks

Decision inbox entry written. History updated. Awaiting Brady approval and team consensus.
