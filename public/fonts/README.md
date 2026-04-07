# Retro Terminal Fonts

Due to licensing, font files are not bundled in this repository.
Download the following fonts and place the `.woff2` (and optionally `.woff`) files in this directory.

## Required Fonts

### PrintChar21 (Apple IIe theme)
- **Source:** https://www.kreativekorp.com/software/fonts/apple2/
- **Files needed:** `PrintChar21.woff2`, `PrintChar21.woff`
- **License:** Free for personal/non-commercial use
- **Fallback:** 'Apple II', monospace

### C64 Pro Mono (Commodore 64 theme)
- **Source:** https://style64.org/c64-truetype
- **Files needed:** `C64_Pro_Mono-STYLE.woff2`, `C64_Pro_Mono-STYLE.woff`
- **License:** Free for non-commercial use (see Style64 license)
- **Fallback:** 'PetMe', monospace

### IBM 3270 (IBM 3270 theme)
- **Source:** https://github.com/rbanffy/3270font
- **Files needed:** `3270-Regular.woff2`, `3270-Regular.woff`
- **License:** BSD 3-Clause (open source, free to use)
- **Fallback:** 'IBM Plex Mono', monospace

### Mx437 IBM 3270 (alternate bitmap IBM font)
- **Source:** https://int10h.org/oldschool-pc-fonts/
- **Files needed:** `Mx437_IBM_3270pc.woff2`, `Mx437_IBM_3270pc.woff`
- **License:** Creative Commons Attribution-ShareAlike 4.0
- **Fallback:** 'IBM Plex Mono', monospace

### W95FA (Windows 95 theme)
- **Source:** https://int10h.org/oldschool-pc-fonts/ (look for "Fixedsys" variants)
- **Files needed:** `W95FA.woff2`, `W95FA.woff`
- **License:** Creative Commons Attribution-ShareAlike 4.0
- **Fallback:** 'Fixedsys', 'Courier New', monospace

### Trek (LCARS theme — legacy fallback)
- **Source:** Search for "Trek TNG" font or use Antonio from Google Fonts as alternative
- **Files needed:** `Trek.woff2`, `Trek.woff`
- **License:** Varies — verify before commercial use
- **Fallback:** 'Antonio', sans-serif

### LCARSGTJ3 (LCARS theme — primary, authentic)
- **Source:** https://gtjlcars.de/LCARSindex/LCARSFONTS.htm
- **Files needed:** `LCARSGTJ3.woff2`, `LCARSGTJ3.woff`
- **License:** Freeware (free to download and use anywhere, may not be renamed/modified/sold)
- **Note:** Contains UPPERCASE ONLY characters, authentic to LCARS style. This is a free recreation of the original Helvetica Ultra Compressed used in Star Trek TNG/DS9/VOY production screens.
- **Fallback:** 'Antonio', sans-serif

## Converting fonts to WOFF2

If you have TTF/OTF files, convert them with:

```bash
# Install woff2 tools
npm install -g woff2

# Or use an online converter:
# https://cloudconvert.com/ttf-to-woff2
```

## File checklist

Place these files in `public/fonts/`:
- [ ] `PrintChar21.woff2`
- [ ] `PrintChar21.woff`
- [ ] `C64_Pro_Mono-STYLE.woff2`
- [ ] `C64_Pro_Mono-STYLE.woff`
- [ ] `3270-Regular.woff2`
- [ ] `3270-Regular.woff`
- [ ] `Mx437_IBM_3270pc.woff2`
- [ ] `Mx437_IBM_3270pc.woff`
- [ ] `W95FA.woff2`
- [ ] `W95FA.woff`
- [ ] `Trek.woff2`
- [ ] `Trek.woff`
- [ ] `LCARSGTJ3.woff2`
- [ ] `LCARSGTJ3.woff`
