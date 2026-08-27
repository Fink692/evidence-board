# Local narration and video drafts

`generate-narration.ps1` reads the nine narration passages in [video-script.md](../video-script.md), uses an installed Canadian English Windows voice, and produces an exact 160-second PCM soundtrack. It makes no network requests and does not create, edit, or publish a video.

The recorded run used **Microsoft Linda (en-CA)** through Windows `System.Speech`, under PowerShell 7.6.4. This is a generic installed synthetic voice, not a human recording or an imitation of a named person. Review the audio before using it in a final video.

## Run

From the application directory:

```powershell
pwsh -NoProfile -File .\submission\recording\generate-narration.ps1
```

An alternative installed `en-CA` voice can be selected explicitly with `-Voice 'Microsoft Richard'`. The verified assets used Linda; review and recheck any regenerated version. The script refuses a missing or non-Canadian-English voice instead of silently substituting another locale.

## Outputs

| Path | Contents |
| --- | --- |
| `.local/video/narration.wav` | Complete soundtrack: 160.000 seconds, mono signed 16-bit PCM at 16,000 Hz |
| `.local/video/scene-01.wav` through `scene-09.wav` | Individual scenes padded to their complete storyboard windows |
| `.local/video/raw/scene-01.wav` through `scene-09.wav` | Unpadded synthesized speech for editing or inspection |
| `.local/video/timings.json` | Scene boundaries, chosen speaking rates, padding, narration text, and global caption times |
| `.local/video/narration-metadata.json` | Synthetic-voice disclosure, source/audio hashes, format, and verification limits |
| `submission/demo.en-CA.vtt` | Captions generated from actual speech bookmark timings |

The fixed scene boundaries in seconds are **0, 16, 36, 55, 73, 98, 115, 135, 151, 160**. Every scene starts with 200 ms of silence. The generator raises the speaking rate only when required to fit a scene, then pads the remaining window with silence. It never cuts off speech or stretches the final soundtrack.

Captions preserve the script exactly, split into readable sentence or phrase cues. Their times come from `BookmarkReached.AudioPosition`, adjusted by the scene offset and leading silence. The output stays at the voice's 16 kHz timing base to avoid resampling-related bookmark drift. Adjacent bookmark coalescing is handled by using each phrase's start as the preceding cue's end.

## Verified local assets

The generated master contains 2,560,000 PCM frames and is 5,120,044 bytes. `ffprobe` and Python's independent WAV parser both measured **160.000 seconds**. All nine padded scene files match their exact segment in the master. The 39 captions reproduce all 347 spoken words, have no overlapping intervals, and use at most two lines with no line longer than 43 characters.

Those measurements are saved in `.local/video/narration-verification.json`. That separate verification report describes the generated assets at the time it was run; regenerate the checks after changing the script or voice.

```powershell
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels,bits_per_sample,duration -show_entries format=duration,size -of json .local/video/narration.wav
```

Structural checks do not establish that the pronunciation, playback, or synchronization with the final capture has been reviewed. Keep the assets local drafts until that review happens. If used, retain an accurate credit such as “Synthetic narration: Microsoft Linda (en-CA), Windows System.Speech.” No public upload or contest submission is performed by this workflow.

## Assemble the real capture

The assembled local draft is [evidence-board-demo-draft.mp4](../evidence-board-demo-draft.mp4). The accessible [browser preview](../demo-preview.html) provides native controls, default Canadian English captions, keyboard-operable chapter jumps, a full transcript, and explicit recording disclosures.

```powershell
pwsh -NoProfile -File .\submission\recording\assemble-draft.ps1
node .\submission\recording\verify-playback.mjs
```

The assembly script reads `.local/video/capture-metadata.json`, trims its measured **0.887-second** initial browser-load interval from `.local/video/walkthrough-raw.webm`, and retains the 160-second demonstration. The original 1600 × 1000 viewport and 25 fps frame grid are preserved; actions are not sped up, rearranged, or fabricated. The separate narration starts at the beginning of the edited timeline.

Encoding uses H.264 High profile, YUV420P, CRF 20, the medium preset, two encoder threads, and mono AAC at 48 kHz. The local full-codec executable was FFmpeg `N-55702-g920046a`; the script accepts explicit `-Ffmpeg` and `-Ffprobe` paths for a compatible installation. This old executable is used only with these trusted local assets, not arbitrary downloaded media.

**Captions are external, not embedded in the MP4.** The old local `mov_text` muxer produced invalid timing-table deltas for adjacent cues during an initial trial. The final clean encode omits that defective track and supplies [demo.en-CA.vtt](../demo.en-CA.vtt) separately. The HTML preview enables all 39 VTT cues by default. Keep the VTT and MP4 beside the preview; a standalone MP4 download needs the separate caption file in a player that supports it.

The verified draft is 22,966,827 bytes. Its video stream and Chromium playback timeline are **160.000 seconds**; the older `ffprobe` reports **160.033 seconds** at container level because the AAC stream includes encoder priming. [assembly-metadata.json](assembly-metadata.json) records the exact media hash, source hashes, trim, codecs, measured duration, voice disclosure, and browser verification. Rerun verification after re-encoding instead of relying on an earlier hash or report.

## Review playback locally

To open the preview manually, serve only the submission directory on loopback:

```powershell
python -m http.server 4180 --bind 127.0.0.1 --directory submission
```

Then open `http://127.0.0.1:4180/demo-preview.html`. Stop that server with Ctrl+C when finished. Direct `file:` opening can prevent the browser from loading external captions; use localhost for the captioned preview.

The repeatable Playwright checker starts its own temporary loopback server exposing only the four preview assets and closes it afterward. The recorded check passed in Chromium **151.0.7922.34**:

- The real H.264/AAC media loaded, and video plus audio decoded during muted playback.
- All 39 captions loaded in their default showing mode.
- Seeks at 8, 28, 42, 86, 105, 125, 130, and 155 seconds decoded the requested video frames and activated the expected timed captions.
- A keyboard-activated chapter button sought to the human-review section.
- No browser errors or external requests were observed.

The full report is `.local/video/playback-verification.json`. Extracted frames are `.local/video/preview-008.png`, `preview-028.png`, `preview-042.png`, `preview-086.png`, `preview-105.png`, `preview-125.png`, `preview-130.png`, and `preview-155.png`. Browser-rendered caption examples are `browser-preview-008.png`, `browser-preview-086.png`, and `browser-preview-130.png` in the same directory. Visual inspection of the 125- and 130-second frames confirmed readable source tags, the accepted turnstile challenge, and the accepted survey–usage conflict.

Muted automated decoding does **not** establish human listening quality. The final narration, synchronization, name, public upload, and submission still need human review or authorization. The browser recording shows real native tool availability and the explicitly scripted rehearsal; it is not evidence of an external model session.
