declare module 'qrcode-terminal' {
	const qrcode: {
		generate(input: string, opts?: { small?: boolean }, cb?: (qr: string) => void): void;
	};
	export default qrcode;
}
