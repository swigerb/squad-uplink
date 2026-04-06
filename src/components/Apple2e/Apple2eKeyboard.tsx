interface KeyData {
  key: string;
  key2: string;
  wide?: string;
}

const KEYS: KeyData[] = [
  // Row 1 (14 keys)
  { key: 'Esc', key2: '' },
  { key: '!', key2: '1' },
  { key: '@', key2: '2' },
  { key: '#', key2: '3' },
  { key: '$', key2: '4' },
  { key: '%', key2: '5' },
  { key: '^', key2: '6' },
  { key: '&', key2: '7' },
  { key: '*', key2: '8' },
  { key: '(', key2: '9' },
  { key: ')', key2: '0' },
  { key: '-', key2: '_' },
  { key: '+', key2: '=' },
  { key: 'Del', key2: '', wide: 'del' },
  // Row 2
  { key: '⇥', key2: '', wide: 'tab' },
  { key: 'Q', key2: '' },
  { key: 'W', key2: '' },
  { key: 'E', key2: '' },
  { key: 'R', key2: '' },
  { key: 'T', key2: '' },
  { key: 'Y', key2: '' },
  { key: 'U', key2: '' },
  { key: 'I', key2: '' },
  { key: 'O', key2: '' },
  { key: 'P', key2: '' },
  { key: '[', key2: '{' },
  { key: ']', key2: '}' },
  { key: '↵', key2: '', wide: 'enter' },
  // Row 3
  { key: 'Ctrl', key2: '', wide: 'ctrl' },
  { key: 'A', key2: '' },
  { key: 'S', key2: '' },
  { key: 'D', key2: '' },
  { key: 'F', key2: '' },
  { key: 'G', key2: '' },
  { key: 'H', key2: '' },
  { key: 'J', key2: '' },
  { key: 'K', key2: '' },
  { key: 'L', key2: '' },
  { key: ';', key2: ':' },
  { key: '"', key2: "'" },
  { key: '~', key2: '.' },
  // Row 4
  { key: '⇧', key2: '', wide: 'shiftl' },
  { key: '|', key2: '\\' },
  { key: 'Z', key2: '' },
  { key: 'X', key2: '' },
  { key: 'C', key2: '' },
  { key: 'V', key2: '' },
  { key: 'B', key2: '' },
  { key: 'N', key2: '' },
  { key: 'M', key2: '' },
  { key: '<', key2: ',' },
  { key: '>', key2: '.' },
  { key: '?', key2: '/' },
  { key: '⇧', key2: '', wide: 'shift' },
  // Row 5
  { key: '⇩', key2: '', wide: 'caps' },
  { key: '', key2: '', wide: 'none' },
  { key: '⌘', key2: '' },
  { key: '', key2: '', wide: 'space' },
  { key: '⌘', key2: '' },
  { key: '⭠', key2: '' },
  { key: '⭢', key2: '' },
  { key: '⭣', key2: '' },
  { key: '⭡', key2: '' },
];

function Key({ keyData }: { keyData: KeyData }) {
  const wideClass = keyData.wide ? `a2e-key--${keyData.wide}` : '';
  return (
    <div className={`a2e-key ${wideClass}`}>
      <div className="a2e-key__side a2e-key__side--top">
        <div className="a2e-key__label-top">{keyData.key}</div>
        <div className="a2e-key__label-bottom">{keyData.key2}</div>
      </div>
      <div className="a2e-key__side a2e-key__side--right" />
      <div className="a2e-key__side a2e-key__side--bottom" />
      <div className="a2e-key__side a2e-key__side--left" />
      <div className="a2e-key__side a2e-key__side--back" />
      <div className="a2e-key__side a2e-key__side--front" />
    </div>
  );
}

export function Apple2eKeyboard() {
  return (
    <div className="a2e-keyboard">
      <div className="a2e-kb-middle" />
      <div className="a2e-kb-top">
        <div className="a2e-kb-emboss">
          <div className="a2e-logo-label">
            <div className="a2e-logo" />
            <div className="a2e-label">apple</div>
          </div>
          <div className="a2e-model-number">
            II<span>e</span>
          </div>
        </div>
        <div className="a2e-kb-embed">
          <div className="a2e-keys-container">
            {KEYS.map((k, i) => (
              <Key key={i} keyData={k} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
