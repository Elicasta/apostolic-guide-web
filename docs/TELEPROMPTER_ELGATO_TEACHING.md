# Elgato teaching display

The display uses the original manuscript and synchronized sections. No manuscript is rewritten or re-seeded. Elgato is the default wide reading layout; select Lens in the display toolbar to return to the former centered layout. Layout preference is local to the display browser, with an optional `view=elgato` or `view=lens` URL override.

## Recording setup

1. In Elgato Camera Hub select Prompter Display mode. Configure the Mac to extend, not mirror, the desktop.
2. Open a manuscript from /teleprompter/library. Move its display window onto the Prompter.
3. Click Full or press F to enter fullscreen. Press C to hide the toolbar and transport buttons; the discreet next-section indicator remains.
4. Open Remote on the display and scan the QR with an authenticated phone or iPad. The remote shows section controls, overlapping page steps, fine scroll nudges, direct section navigation and optional auto-scroll.
5. Focus the display or paired remote before using a keyboard clicker. Configure a Stream Deck or pedal to send the same keys if desired.

| Key | Action |
| --- | --- |
| Right / Page Down | Next manuscript section |
| Left / Page Up | Previous section |
| Up / Down | Fine scroll |
| Space (display) | Toggle auto-scroll |
| Home (display) | Return to section top |
| F (display) | Toggle fullscreen |
| C (display) | Toggle chrome |

Manual next/previous and scroll nudges stop auto-scroll. Page steps move 65% of the visible reader height, keeping overlap. A held section key does not advance multiple sections. The app retains its existing session recovery for the current section; exact pixel-position recovery and paragraph-level cue indexing are not introduced in this change.

## Acceptance checklist

- Open a real Pathway and a user manuscript at 1024 × 600; verify headings, quotes and body remain readable and scrollable.
- Pair an iPad; test forward/back sections, long sections using page and fine controls, and direct jumps.
- Confirm the display stops auto-scroll on manual navigation, including at the first and last section.
- Test a physical clicker with the display focused, including a held key. Verify the original Lens layout can be restored.
- Refresh the paired display and verify existing session section recovery.
- Run npm test, npm run typecheck and npm run build; test actual Prompter hardware before production rollout.
