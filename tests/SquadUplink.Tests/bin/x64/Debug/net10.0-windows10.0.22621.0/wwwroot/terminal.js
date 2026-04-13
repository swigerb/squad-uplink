// Squad Uplink — xterm.js integration for WebView2
(function () {
    'use strict';

    const term = new window.Terminal({
        cursorBlink: true,
        fontFamily: 'Cascadia Code, Consolas, monospace',
        fontSize: 14,
        theme: {
            background: '#1a1a2e',
            foreground: '#33ff33',
            cursor: '#33ff33'
        }
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));
    fitAddon.fit();

    window.addEventListener('resize', () => fitAddon.fit());

    // API exposed to C# via WebView2.ExecuteScriptAsync
    window.squadTerminal = {
        writeOutput: function (text) {
            term.write(text);
        },

        writeLine: function (text) {
            term.writeln(text);
        },

        clearTerminal: function () {
            term.clear();
        },

        setTheme: function (themeConfig) {
            if (typeof themeConfig === 'string') {
                themeConfig = JSON.parse(themeConfig);
            }
            term.options.theme = themeConfig;
            document.body.style.background = themeConfig.background || '#000';
        },

        setFontFamily: function (fontFamily) {
            term.options.fontFamily = fontFamily;
            fitAddon.fit();
        },

        resize: function () {
            fitAddon.fit();
        }
    };

    // Notify C# that the terminal is ready
    term.writeln('Squad Uplink Terminal — Ready');
    term.writeln('');

    // Forward user input to C# host
    term.onData(function (data) {
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({ type: 'input', data: data });
        }
    });
})();
