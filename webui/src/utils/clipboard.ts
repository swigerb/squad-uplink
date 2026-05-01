export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		try {
			const el = document.createElement('textarea');
			el.value = text;
			el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
			document.body.appendChild(el);
			el.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(el);
			return ok;
		} catch {
			return false;
		}
	}
}

export async function copyRichToClipboard(html: string, plainText: string): Promise<boolean> {
	try {
		await navigator.clipboard.write([
			new ClipboardItem({
				'text/html': new Blob([html], { type: 'text/html' }),
				'text/plain': new Blob([plainText], { type: 'text/plain' }),
			})
		]);
		return true;
	} catch {
		return copyToClipboard(plainText);
	}
}
