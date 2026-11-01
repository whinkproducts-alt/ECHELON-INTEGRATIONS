# WHINK Content Analyst

Reverse-engineer any YouTube or Instagram video using Gemini 1.5 Pro. Takes a URL, downloads the video, sends it to Gemini for full visual + audio analysis, and returns a structured recreation brief.

## Setup

1. Get a free Gemini API key at https://aistudio.google.com/app/apikey
2. Install dependencies: `npm install`
3. Make sure `yt-dlp` is installed: `pip install yt-dlp` (or `brew install yt-dlp` on Mac)

## Usage

```bash
# Basic usage
GEMINI_API_KEY=your_key node analyst.js https://www.youtube.com/watch?v=VIDEO_ID

# Instagram Reel
GEMINI_API_KEY=your_key node analyst.js https://www.instagram.com/reel/REEL_ID/

# JSON output (for programmatic use)
GEMINI_API_KEY=your_key node analyst.js https://www.youtube.com/watch?v=VIDEO_ID --output json

# Store key as env var
export GEMINI_API_KEY=your_key
node analyst.js https://www.youtube.com/watch?v=VIDEO_ID
```

## What you get

- Hook analysis (first 3-5 seconds, emotional trigger, opening technique)
- Content structure (segments, narrative arc, pacing, transitions)
- Script pattern (speaking style, language patterns, CTA)
- Visual style (camera setup, editing style, color grading)
- Audio analysis (music, sound effects, voice delivery)
- Full recreation blueprint (equipment, script outline, shot list, editing notes)
- Why it works (psychological appeal, shareability, audience hooks)

## Cost

~$0.01-0.05 per video depending on length. Free tier on Google AI Studio covers ~60 videos/day.

## Requirements

- Node.js 18+
- yt-dlp (for video download)
- Gemini API key (free at aistudio.google.com)
