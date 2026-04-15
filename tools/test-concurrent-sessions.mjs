// test-concurrent-sessions.mjs — Test if two SDK sessions can run turns simultaneously
// Specifically tests: session A running a tool while session B starts a turn
import { CopilotClient, approveAll } from '@github/copilot-sdk';

const client = new CopilotClient();

async function run() {
	console.log('Creating two sessions...');

	const sessionA = await client.createSession({
		workingDirectory: process.cwd(),
		onPermissionRequest: approveAll,
	});
	console.log(`Session A: ${sessionA.sessionId.slice(0, 8)}`);

	const sessionB = await client.createSession({
		workingDirectory: process.cwd(),
		onPermissionRequest: approveAll,
	});
	console.log(`Session B: ${sessionB.sessionId.slice(0, 8)}`);

	// Listen for events on both
	sessionA.on((event) => {
		if (event.type === 'assistant.message') {
			console.log(`[A ${((Date.now() - startTime) / 1000).toFixed(1)}s] message: ${(event.data?.content ?? '').slice(0, 80)}`);
		} else if (event.type === 'session.idle') {
			console.log(`[A ${((Date.now() - startTime) / 1000).toFixed(1)}s] idle`);
		} else if (event.type === 'tool.execution_start') {
			console.log(`[A ${((Date.now() - startTime) / 1000).toFixed(1)}s] tool start: ${event.data?.toolName ?? '?'}`);
		} else if (event.type === 'tool.execution_complete') {
			console.log(`[A ${((Date.now() - startTime) / 1000).toFixed(1)}s] tool complete: ${event.data?.toolName ?? '?'}`);
		}
	});

	sessionB.on((event) => {
		if (event.type === 'assistant.message') {
			console.log(`[B ${((Date.now() - startTime) / 1000).toFixed(1)}s] message: ${(event.data?.content ?? '').slice(0, 80)}`);
		} else if (event.type === 'session.idle') {
			console.log(`[B ${((Date.now() - startTime) / 1000).toFixed(1)}s] idle`);
		} else if (event.type === 'tool.execution_start') {
			console.log(`[B ${((Date.now() - startTime) / 1000).toFixed(1)}s] tool start: ${event.data?.toolName ?? '?'}`);
		} else if (event.type === 'tool.execution_complete') {
			console.log(`[B ${((Date.now() - startTime) / 1000).toFixed(1)}s] tool complete: ${event.data?.toolName ?? '?'}`);
		}
	});

	// Session A: ask it to run a slow PowerShell command (tool execution)
	// Session B: start a turn WHILE session A's tool is running
	console.log('\nSending long-running task to Session A...');
	const startTime = Date.now();

	const promiseA = sessionA.sendAndWait({
		prompt: 'Run this PowerShell command and tell me the result: Start-Sleep -Seconds 8; Write-Output "done sleeping"'
	});

	// Wait 2s for session A's tool to be in-flight, then start session B
	await new Promise(r => setTimeout(r, 2000));
	console.log(`\n[${((Date.now() - startTime) / 1000).toFixed(1)}s] Session A should have a tool running now. Starting Session B...`);

	const promiseB = sessionB.sendAndWait({
		prompt: 'Reply with exactly: "Session B completed while A was busy"'
	});

	// Wait for both
	const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log(`\nBoth completed in ${elapsed}s`);

	// Cleanup
	await sessionA.disconnect();
	await sessionB.disconnect();
	await client.stop();
	console.log('Done!');
}

run().catch((e) => {
	console.error('ERROR:', e);
	client.stop().catch(() => {});
	process.exit(1);
});
