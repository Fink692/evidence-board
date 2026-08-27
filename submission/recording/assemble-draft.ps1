param(
    [string]$Ffmpeg = (Join-Path $env:LOCALAPPDATA 'Programs/Python/Python312/Scripts/ffmpeg.exe'),
    [string]$Ffprobe = (Join-Path $env:LOCALAPPDATA 'Programs/Python/Python312/Scripts/ffprobe.exe'),
    [string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)

# Encodes only local, trusted capture/narration assets. No network or publication.
# The older full-codec FFmpeg installed on this host supports H.264/AAC/mov_text;
# the bundled Playwright encoder does not provide all of these codecs. Captions
# remain external because this older muxer corrupts contiguous mov_text timing.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $ProjectRoot).Path
$ffmpegPath = (Resolve-Path -LiteralPath $Ffmpeg).Path
$ffprobePath = (Resolve-Path -LiteralPath $Ffprobe).Path
$capturePath = Join-Path $projectPath '.local/video/walkthrough-raw.webm'
$narrationPath = Join-Path $projectPath '.local/video/narration.wav'
$captionPath = Join-Path $projectPath 'submission/demo.en-CA.vtt'
$captureMetadataPath = Join-Path $projectPath '.local/video/capture-metadata.json'
$narrationMetadataPath = Join-Path $projectPath '.local/video/narration-metadata.json'
$outputPath = Join-Path $projectPath 'submission/evidence-board-demo-draft.mp4'
$metadataPath = Join-Path $projectPath 'submission/recording/assembly-metadata.json'
$progressPath = Join-Path $projectPath '.local/video/assembly-progress.txt'
$targetSeconds = 160
$utf8 = New-Object System.Text.UTF8Encoding($false)
$capture = Get-Content -LiteralPath $captureMetadataPath -Raw -Encoding utf8 | ConvertFrom-Json
$narration = Get-Content -LiteralPath $narrationMetadataPath -Raw -Encoding utf8 | ConvertFrom-Json

if ($capture.dryRun -or $capture.durationSeconds -ne $targetSeconds -or $capture.errors.Count -ne 0) {
    throw 'Expected a successful real 160-second capture, not a dry run.'
}
if ($capture.viewport.width -ne 1600 -or $capture.viewport.height -ne 1000) {
    throw 'Expected the real 1600 x 1000 capture; do not distort a different viewport.'
}
if ($capture.leadInSeconds -lt 0 -or $capture.leadInSeconds -gt 30) { throw 'Unexpected capture lead-in.' }
if ($narration.durationSeconds -ne $targetSeconds -or -not $narration.syntheticNarration) {
    throw 'Expected the disclosed 160-second synthetic narration.'
}
if ((Get-FileHash -LiteralPath $narrationPath -Algorithm SHA256).Hash -ne $narration.audioSha256) {
    throw 'The narration WAV no longer matches its metadata.'
}

# Validate the external caption count. Do not mux these with this old FFmpeg:
# its mov_text output produces invalid STTS sample deltas for adjacent cues.
$vtt = (Get-Content -LiteralPath $captionPath -Raw -Encoding utf8).Replace("`r`n", "`n")
$cueMatches = @([regex]::Matches($vtt, '(?ms)^scene-\d+-cue-\d+\n(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\n(.*?)(?=\n\n|\z)'))
if ($cueMatches.Count -ne $narration.captionCueCount) { throw 'Caption count does not match narration metadata.' }

$trimStart = ([double]$capture.leadInSeconds).ToString('0.######', [Globalization.CultureInfo]::InvariantCulture)
$filter = "trim=start=${trimStart}:duration=${targetSeconds},setpts=PTS-STARTPTS,fps=25"
$encodeArguments = @(
    '-y', '-loglevel', 'warning', '-nostats', '-threads', '2', '-i', $capturePath,
    '-i', $narrationPath,
    '-map', '0:v:0', '-map', '1:a:0', '-vf', $filter,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-threads', '2',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0', '-g', '50', '-keyint_min', '25',
    '-c:a', 'libvo_aacenc', '-b:a', '128k', '-ar', '48000', '-ac', '1',
    '-metadata', 'title=Evidence Board - local demo draft',
    '-metadata', 'comment=Synthetic narration: Microsoft Linda (en-CA), Windows System.Speech. Scripted rehearsal; no external model. Native WebMCP availability recorded. Local draft; not published.',
    '-movflags', '+faststart', '-t', "$targetSeconds", '-progress', $progressPath, $outputPath
)

Write-Host "Encoding the real capture: trim initial ${trimStart}s; retain 160s at 1600x1000; H.264 CRF20 / AAC, two encoder threads."
& $ffmpegPath @encodeArguments
if ($LASTEXITCODE -ne 0) { throw "FFmpeg assembly failed with exit code $LASTEXITCODE." }

$probeOutput = & $ffprobePath '-v' 'error' '-show_streams' '-show_format' '-of' 'json' $outputPath
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the encoded draft.' }
$probe = ($probeOutput -join "`n") | ConvertFrom-Json
$videoStream = @($probe.streams | Where-Object { $_.codec_type -eq 'video' })
$audioStream = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' })
$subtitleStream = @($probe.streams | Where-Object { $_.codec_type -eq 'subtitle' })
if ($videoStream.Count -ne 1 -or $audioStream.Count -ne 1 -or $subtitleStream.Count -ne 0) {
    throw 'Expected one video and one narration stream, with separate VTT captions.'
}
if ($videoStream[0].codec_name -ne 'h264' -or $videoStream[0].width -ne 1600 -or $videoStream[0].height -ne 1000 -or
    $audioStream[0].codec_name -ne 'aac') {
    throw 'The output does not match the required media formats.'
}
$measuredDuration = [double]::Parse($probe.format.duration, [Globalization.CultureInfo]::InvariantCulture)
if ([Math]::Abs($measuredDuration - $targetSeconds) -gt 0.05) {
    throw "Unexpected encoded duration: $measuredDuration seconds."
}
$toolVersion = @(& $ffmpegPath '-version')[0]
$metadata = [ordered]@{
    schemaVersion = 1; generatedAtUtc = [DateTime]::UtcNow.ToString('o'); status = 'local_captioned_video_draft'
    outputPath = 'submission/evidence-board-demo-draft.mp4'; targetDurationSeconds = $targetSeconds
    measuredDurationSeconds = $measuredDuration; byteLength = (Get-Item -LiteralPath $outputPath).Length
    sha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash
    capturePath = '.local/video/walkthrough-raw.webm'; captureSha256 = (Get-FileHash -LiteralPath $capturePath -Algorithm SHA256).Hash
    narrationPath = '.local/video/narration.wav'; narrationSha256 = $narration.audioSha256
    captionsPath = 'submission/demo.en-CA.vtt'; captionsSha256 = (Get-FileHash -LiteralPath $captionPath -Algorithm SHA256).Hash
    captureLeadInTrimSeconds = [double]$capture.leadInSeconds; frameGridSeconds = 0.04
    timingNote = 'Trim uses the measured initial browser-load interval; retained video is quantized to its original 25 fps frame grid. No actions are fabricated or sped up.'
    video = [ordered]@{ codec = $videoStream[0].codec_name; width = $videoStream[0].width; height = $videoStream[0].height; pixelFormat = $videoStream[0].pix_fmt; frameRate = $videoStream[0].r_frame_rate; crf = 20; encoderThreads = 2 }
    audio = [ordered]@{ codec = $audioStream[0].codec_name; sampleRateHz = [int]$audioStream[0].sample_rate; channels = $audioStream[0].channels; synthetic = $true; voice = $narration.voice; language = $narration.language; encodedDurationSeconds = $audioStream[0].duration; codecStartTimeSeconds = $audioStream[0].start_time }
    subtitles = [ordered]@{ format = 'WebVTT'; cueCount = $cueMatches.Count; embedded = $false; externalVttProvided = $true; htmlCaptionsDefault = $true; reason = 'The older local FFmpeg mov_text muxer emitted invalid timing-table deltas; the external VTT avoids that defect.' }
    captureBrowser = $capture.browser; nativeToolsRegisteredDuringCapture = $capture.native.registeredNames.Count
    scriptedRehearsal = $capture.scriptedRehearsal; externalModelUsed = $capture.externalModel
    encoderVersion = $toolVersion; generator = 'submission/recording/assemble-draft.ps1'
    humanListeningReviewCompleted = $false; publicationCompleted = $false; browserPlaybackVerification = 'pending separate browser check'
}
[IO.File]::WriteAllText($metadataPath, ($metadata | ConvertTo-Json -Depth 10) + "`n", $utf8)

foreach ($second in @(8, 28, 42, 86, 105, 125, 130, 155)) {
    $framePath = Join-Path $projectPath ('.local/video/preview-{0:000}.png' -f $second)
    & $ffmpegPath '-y' '-loglevel' 'error' '-ss' "$second" '-i' $outputPath '-an' '-sn' '-vframes' '1' '-threads' '2' $framePath
    if ($LASTEXITCODE -ne 0) { throw "Could not extract preview frame at $second seconds." }
}
Write-Host "Verified encoded draft: $measuredDuration seconds, H.264/AAC with separate WebVTT captions. Metadata: $metadataPath"
