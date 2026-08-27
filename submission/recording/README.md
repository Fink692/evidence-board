# Current walkthrough

The published 160-second walkthrough is a real browser capture, not generated product imagery. It uses a fresh, disposable guest profile on the public judging Site. Native tool calls and the separate human review controls are operated by Playwright for reproducibility. No external language model participates.

## Capture

Install the project's dependencies and Playwright Chromium, then pass the exact approved public Site URL:

```sh
node submission/recording/record-current.mjs --url=https://YOUR-SITE --output=.local/capture-check --dry-run
node submission/recording/record-current.mjs --url=https://YOUR-SITE --output=.local/capture-final
```

Do not point this script at a private or real account workspace. It opens `/?guest=1` in a new browser profile, rejects the prepared sample suggestions via the interface, and then creates its recorded proposal through an actual native call. It never uses personal browser cookies or an authentication bypass.

Chromium must expose native WebMCP with the `WebMCP` and `WebMCPTesting` features. The capture verifies native registration, all ten tool names, four native results, a title-only partial patch, exact selective approval, export, Undo, reload persistence, and absence of account or third-party requests. A late scene causes a failure instead of silently accepting a mistimed recording.

## Media

The public MP4, screenshot, and WebVTT captions are checked into `public/`. The video is H.264 with an AAC narration track. Captions are separate WebVTT so a viewer can enable or disable them. The voice is the generic Microsoft Linda en-CA voice, not a person being impersonated.

Production excludes the MP4 from the Worker bundle and serves it from the Site's `MEDIA` R2 binding. The first request fills that fixed object from a pinned public GitHub commit only after byte-count and SHA-256 checks. GET, HEAD, ranges, and ETag validation are supported; public uploads and arbitrary fetch URLs are not. If you replace the recording, update the manifest in `server/media.ts` and the matching build check in `scripts/prepare-media-build.mjs`. The checked-in original still serves local development and preview.

The assembly helper accepts an artifact directory containing `capture-final/`, a 160-second `audio/narration.wav`, and its matching `audio/narration-metadata.json`. Local voice generation files and raw captures are not checked into the public repository. If making a new recording, supply your own licensed narration and matching metadata; the published MP4 already contains the final narration.

```powershell
./submission/recording/assemble-current.ps1 -AssetDirectory ./my-artifacts -Ffmpeg ffmpeg -Ffprobe ffprobe
```

The helper validates the capture and narration, trims only setup time, keeps the workflow at its real speed, probes the finished streams, hashes artifacts, and exports frames for review. It does not publish anything. The installed encoder used `libvo_aacenc`; adapt the codec to `aac` if your FFmpeg build does not provide that older encoder.

A Public YouTube upload is still required by the event. A successful local capture, public MP4, or watch page is not a Devpost submission receipt.
