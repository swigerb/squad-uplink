interface C64KeyData {
  label: string;
  shift?: string;
  special?: string;
}

const ROW1: C64KeyData[] = [
  { label: '←', shift: '' },
  { label: '1', shift: '!' },
  { label: '2', shift: '"' },
  { label: '3', shift: '#' },
  { label: '4', shift: '$' },
  { label: '5', shift: '%' },
  { label: '6', shift: '&' },
  { label: '7', shift: "'" },
  { label: '8', shift: '(' },
  { label: '9', shift: ')' },
  { label: '0', shift: '' },
  { label: '+', shift: '' },
  { label: '-', shift: '' },
  { label: '£', shift: '' },
  { label: 'HOME', special: 'home' },
  { label: 'INST', shift: 'DEL', special: 'inst' },
];

const ROW2: C64KeyData[] = [
  { label: 'CTRL', special: 'ctrl' },
  { label: 'Q' }, { label: 'W' }, { label: 'E' }, { label: 'R' },
  { label: 'T' }, { label: 'Y' }, { label: 'U' }, { label: 'I' },
  { label: 'O' }, { label: 'P' },
  { label: '@', shift: '' },
  { label: '*', shift: '' },
  { label: '↑', shift: '' },
  { label: 'RESTORE', special: 'restore' },
];

const ROW3: C64KeyData[] = [
  { label: 'RUN', shift: 'STOP', special: 'runstop' },
  { label: 'A' }, { label: 'S' }, { label: 'D' }, { label: 'F' },
  { label: 'G' }, { label: 'H' }, { label: 'J' }, { label: 'K' },
  { label: 'L' },
  { label: ':', shift: '[' },
  { label: ';', shift: ']' },
  { label: '=', shift: '' },
  { label: 'RETURN', special: 'return' },
];

const ROW4: C64KeyData[] = [
  { label: 'C=', special: 'commodore' },
  { label: 'SHIFT', shift: 'LOCK', special: 'shiftlock' },
  { label: 'Z' }, { label: 'X' }, { label: 'C' }, { label: 'V' },
  { label: 'B' }, { label: 'N' }, { label: 'M' },
  { label: ',', shift: '<' },
  { label: '.', shift: '>' },
  { label: '/', shift: '?' },
  { label: 'SHIFT', special: 'shift' },
];

interface FKeyData {
  label: string;
  shift: string;
}

const FKEYS: FKeyData[] = [
  { label: 'F1', shift: 'HELP' },
  { label: 'F3', shift: 'LIST' },
  { label: 'F5', shift: 'LOAD' },
  { label: 'F7', shift: 'SAVE' },
];

function C64Key({ data }: { data: C64KeyData }) {
  const specialClass = data.special ? `c64-key-special c64-key-${data.special}` : '';
  return (
    <div
      className={`c64-key ${specialClass}`}
      data-shift={data.shift || undefined}
    >
      {data.label}
    </div>
  );
}

function C64FKey({ data }: { data: FKeyData }) {
  return (
    <div className="c64-key-f" data-shift={data.shift}>
      {data.label}
    </div>
  );
}

export function C64Keyboard() {
  return (
    <div className="c64-keyboard">
      <div className="c64-keyboard-main">
        <div className="c64-key-row">
          {ROW1.map((k, i) => <C64Key key={i} data={k} />)}
        </div>
        <div className="c64-key-row">
          {ROW2.map((k, i) => <C64Key key={i} data={k} />)}
        </div>
        <div className="c64-key-row">
          {ROW3.map((k, i) => <C64Key key={i} data={k} />)}
        </div>
        <div className="c64-key-row">
          {ROW4.map((k, i) => <C64Key key={i} data={k} />)}
        </div>
        <div className="c64-key-row">
          <div className="c64-key c64-key-space" />
        </div>
      </div>
      <div className="c64-fkeys">
        {FKEYS.map((fk, i) => <C64FKey key={i} data={fk} />)}
      </div>
    </div>
  );
}
