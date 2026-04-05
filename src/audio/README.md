# Audio Assets

Retro sound effects for squad-uplink. These are generated at runtime using the Web Audio API (`useAudio` hook) — no static audio files are needed for the initial version.

## Planned Sounds

| Sound       | Trigger               | Implementation    |
|-------------|-----------------------|-------------------|
| keystroke   | Each key press        | Square wave 440Hz |
| connect     | WebSocket connected   | Square wave 880Hz |
| disconnect  | WebSocket closed      | Square wave 220Hz |
| error       | Error message         | Square wave 160Hz |
| toggle      | Theme switch          | Square wave 660Hz |

## Future

If we want richer sounds (SID chip emulation for C64, etc.), add `.wav` or `.mp3` files here and update `useAudio` to use `Audio()` elements.
