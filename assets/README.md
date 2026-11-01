# WHINK assets

## avatars/
- visemes/: six mouth shapes per character (rest, mbp, aa, ee, oo, fv) as transparent sprites.
  visemes.json gives where each sprite sits on the 2168 x 2896 master. Multiply by 0.5 for the 1086 x 1448 FINAL art.
  make_visemes.py rebuilds them from the closed, parted and open frames.
- badges/: circular chat badges, 32 to 512 px.
- WHINK_cutout_draft.png: WHINK on a transparent background. Draft: right shoulder is clipped and hair edges are soft.
  MAMBA's automatic cutout failed (hair lost against the fire). Needs regenerating from the source tool.

## brand/
- whink_ultimate_icon.svg and PNG sizes: the product app icon. Core with orbit ring, azure #38B6FF.
- whink_ultimate_icon_mono.svg: single colour version.
- whink_apps_*.svg: WHINK Apps mark, gold (marketing) and chrome (inside products), with and without tagline.
  These are vector drafts. The wordmark is live text in Jost; a designer should convert it to outlines before print or store use.

## avatar-demo/
Open index.html through a local server (browsers block audio from file://):
  cd assets/avatar-demo && python3 -m http.server 8000
Then visit http://localhost:8000. Lip sync is driven live from the audio.
Voices: whink_voice.mp3 from "WHINK VOICE.m4a"; mamba_voice.mp3 from "MAMBA Vocal Warm-Up.mp4".
