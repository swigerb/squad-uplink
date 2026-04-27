/**
 * Shared configuration constants — centralizes values previously hardcoded across modules.
 */
import * as fs from 'node:fs';

/** Default port for the Copilot CLI JSON-RPC server */
export const DEFAULT_CLI_PORT = parseInt(process.env.SQUAD_PORT || '3848', 10);

/** Atomic write: write to .tmp then rename to prevent partial/corrupt writes */
export function atomicWriteFileSync(filePath: string, data: string): void {
	const tmp = filePath + '.tmp';
	fs.writeFileSync(tmp, data);
	fs.renameSync(tmp, filePath);
}
