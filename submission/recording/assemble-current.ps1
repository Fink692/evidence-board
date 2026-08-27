param(
    [Parameter(Mandatory = $true)][string]$AssetDirectory,
    [string]$CaptureSubdirectory = 'capture-final',
    [string]$Ffmpeg = 'ffmpeg',
    [string]$Ffprobe = 'ffprobe'
)

# Assemble only the real current-app capture and its disclosed synthetic voice.
# No generated product frames, speed changes, network requests, or publication.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$assetRoot = (Resolve-Path -LiteralPath $AssetDirectory).Path
$captureRoot = Join-Path $assetRoot $CaptureSubdirectory
$captureFile = Join-Path $captureRoot 'walkthrough-raw.webm'
$audioFile = Join-Path $assetRoot 'audio/narration.wav'
$outputFile = Join-Path $assetRoot 'evidence-board-walkthrough.mp4'
$capture = Get-Content -LiteralPath (Join-Path $captureRoot 'capture-metadata.json') -Raw | ConvertFrom-Json
$narration = Get-Content -LiteralPath (Join-Path $assetRoot 'audio/narration-metadata.json') -Raw | ConvertFrom-Json
if ($capture.dryRun -or $capture.durationSeconds -ne 160 -or $capture.errors.Count -ne 0 -or $capture.accountApiRequests -ne 0 -or $capture.externalRequests -ne 0) { throw 'Expected a successful real 160-second isolated guest capture.' }
if (-not $capture.native.nativeRegister -or $capture.native.names.Count -ne 10 -or $capture.nativeCalls.Count -ne 4 -or $capture.externalModel) { throw 'Expected genuine native calls without an external model.' }
if ($capture.viewport.width -ne 1600 -or $capture.viewport.height -ne 1000) { throw 'Unexpected capture dimensions.' }
if ($capture.leadInSeconds -lt 0 -or $capture.leadInSeconds -gt 30) { throw 'Unexpected capture lead-in.' }
if ($narration.durationSeconds -ne 160 -or -not $narration.syntheticNarration) { throw 'Expected the disclosed 160-second narration.' }
if ((Get-FileHash -LiteralPath $audioFile -Algorithm SHA256).Hash -ne $narration.audioSha256) { throw 'Narration no longer matches verified audio.' }
$trimStart = ([double]$capture.leadInSeconds).ToString('0.######', [Globalization.CultureInfo]::InvariantCulture)
$encodeArguments = @(
    '-y', '-loglevel', 'warning', '-nostats', '-threads', '2', '-i', $captureFile, '-i', $audioFile,
    '-map', '0:v:0', '-map', '1:a:0', '-vf', "trim=start=${trimStart}:duration=160,setpts=PTS-STARTPTS,fps=25",
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0', '-g', '50', '-keyint_min', '25',
    '-c:a', 'libvo_aacenc', '-b:a', '128k', '-ar', '48000', '-ac', '1', '-movflags', '+faststart', '-t', '160',
    '-metadata', 'title=Evidence Board - real native WebMCP walkthrough',
    '-metadata', 'comment=Actual public app capture. Native tool calls and human UI controls driven by Playwright; no external model session. Synthetic narration: Microsoft Linda, en-CA, Windows System.Speech. Separate WebVTT captions supplied.',
    '-progress', (Join-Path $assetRoot 'assembly-progress.txt'), $outputFile
)
& $Ffmpeg @encodeArguments
if ($LASTEXITCODE -ne 0) { throw 'Video assembly failed.' }
$probe = ((& $Ffprobe '-v' 'error' '-show_streams' '-show_format' '-of' 'json' $outputFile) -join "`n") | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Video inspection failed.' }
$video = @($probe.streams | Where-Object { $_.codec_type -eq 'video' })
$audio = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' })
if ($video.Count -ne 1 -or $audio.Count -ne 1 -or $video[0].codec_name -ne 'h264' -or $audio[0].codec_name -ne 'aac') { throw 'Unexpected media streams.' }
$duration = [double]::Parse($probe.format.duration, [Globalization.CultureInfo]::InvariantCulture)
if ([Math]::Abs($duration - 160) -gt 0.05) { throw 'Final duration is not 160 seconds.' }
$metadata = [ordered]@{
    generatedAt = [DateTime]::UtcNow.ToString('o'); file = 'evidence-board-walkthrough.mp4'
    durationSeconds = $duration; bytes = (Get-Item -LiteralPath $outputFile).Length
    sha256 = (Get-FileHash -LiteralPath $outputFile -Algorithm SHA256).Hash
    captureSha256 = (Get-FileHash -LiteralPath $captureFile -Algorithm SHA256).Hash
    audioSha256 = $narration.audioSha256; captureLeadInTrimSeconds = [double]$capture.leadInSeconds
    video = 'H.264, 1600x1000, 25fps, yuv420p'; audio = 'AAC, 48kHz mono, 128kbps'
    narration = 'Generic synthetic Microsoft Linda en-CA voice; no impersonation'
    captions = 'narration.en-CA.vtt'; captionCueCount = $narration.captionCueCount
    captionsEmbedded = $false; captionNote = 'External WebVTT avoids the older local muxer timing-table issue.'
    captureBrowser = $capture.browser; nativeToolCount = $capture.native.names.Count; nativeCallCount = $capture.nativeCalls.Count
    nativeCalls = @($capture.nativeCalls | ForEach-Object { $_.tool }); externalModel = $false
    acceptedUndo = $capture.acceptedUndo; reloadPersistence = $capture.reloadPersistence
    browserPlaybackVerification = 'pending'; humanListeningReviewCompleted = $false; youtubeUploaded = $false
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $assetRoot 'assembly-metadata.json'), ($metadata | ConvertTo-Json -Depth 6) + "`n", $utf8)
$framesPath = Join-Path $assetRoot 'frames'
New-Item -ItemType Directory -Path $framesPath -Force | Out-Null
foreach ($second in @(4, 22, 44, 66, 80, 94, 105, 120, 133, 143, 155)) {
    $framePath = Join-Path $framesPath ('frame-{0:000}.png' -f $second)
    & $Ffmpeg '-y' '-loglevel' 'error' '-ss' "$second" '-i' $outputFile '-an' '-sn' '-vframes' '1' '-threads' '2' $framePath
    if ($LASTEXITCODE -ne 0) { throw "Could not inspect video frame $second." }
}
Write-Output ($metadata | ConvertTo-Json -Depth 6)
