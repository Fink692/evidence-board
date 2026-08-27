param(
    [string]$Voice = 'Microsoft Linda',
    [ValidateRange(-5, 5)][int]$InitialRate = 0,
    [string]$ProjectRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)

# Local stock-voice draft only. Requires Windows and System.Speech; no network calls.
# Run from PowerShell: ./submission/recording/generate-narration.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$projectPath = (Resolve-Path -LiteralPath $ProjectRoot).Path
$scriptPath = Join-Path $projectPath 'submission/video-script.md'
$outputPath = Join-Path $projectPath '.local/video'
$rawPath = Join-Path $outputPath 'raw'
$captionPath = Join-Path $projectPath 'submission/demo.en-CA.vtt'
$boundaries = @(0, 16, 36, 55, 73, 98, 115, 135, 151, 160)
# Use the voice's native 16 kHz timing base. Requesting a resampled WAV can make
# SAPI's BookmarkReached.AudioPosition disagree with the encoded sample clock.
$sampleRate = 16000
$leadSeconds = 0.2
$minimumTailSeconds = 0.15

$voiceProbe = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $selectedVoice = @($voiceProbe.GetInstalledVoices() | Where-Object {
        $_.Enabled -and $_.VoiceInfo.Name -eq $Voice -and $_.VoiceInfo.Culture.Name -eq 'en-CA'
    })
    if ($selectedVoice.Count -ne 1) {
        throw "The enabled Canadian English voice '$Voice' is not installed. Select an installed en-CA voice explicitly."
    }
} finally {
    $voiceProbe.Dispose()
}

# C# event handlers capture native synthesis audio positions without a PowerShell
# callback/runspace race. Bookmarks delimit the actual spoken caption phrases.
if (-not ('EvidenceBoardNarration' -as [type])) {
    Add-Type -ReferencedAssemblies @(
        [System.Speech.Synthesis.SpeechSynthesizer].Assembly.Location,
        'System.Runtime.dll', 'System.Collections.dll', 'System.Threading.dll'
    ) -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Globalization;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;

public sealed class NarrationMark {
    public string Name;
    public double Seconds;
}
public sealed class NarrationWave {
    public int SampleRate;
    public byte[] Data;
    public double DurationSeconds { get { return Data.Length / (2.0 * SampleRate); } }
}
public static class EvidenceBoardNarration {
    public static NarrationMark[] Synthesize(string voice, int rate, int sampleRate, string path, string[] phrases) {
        var marks = new List<NarrationMark>();
        using (var synth = new SpeechSynthesizer()) {
            synth.SelectVoice(voice);
            synth.Rate = rate;
            synth.Volume = 100;
            synth.BookmarkReached += delegate(object sender, BookmarkReachedEventArgs e) {
                lock (marks) marks.Add(new NarrationMark { Name = e.Bookmark, Seconds = e.AudioPosition.TotalSeconds });
            };
            synth.SetOutputToWaveFile(path, new SpeechAudioFormatInfo(sampleRate, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
            var prompt = new PromptBuilder(new CultureInfo("en-CA"));
            for (int i = 0; i < phrases.Length; i++) {
                prompt.AppendBookmark("start_" + i);
                prompt.AppendText(phrases[i] + " ");
            }
            // SAPI coalesces adjacent bookmarks. The next phrase's start also
            // closes the previous caption, and one final mark closes the last.
            prompt.AppendBookmark("end");
            synth.Speak(prompt);
            synth.SetOutputToNull();
        }
        lock (marks) return marks.ToArray();
    }

    public static NarrationWave ReadWave(string path) {
        using (var reader = new BinaryReader(File.OpenRead(path))) {
            if (Encoding.ASCII.GetString(reader.ReadBytes(4)) != "RIFF") throw new InvalidDataException("Expected RIFF WAV.");
            reader.ReadUInt32();
            if (Encoding.ASCII.GetString(reader.ReadBytes(4)) != "WAVE") throw new InvalidDataException("Expected WAVE file.");
            int sampleRate = 0;
            byte[] pcm = null;
            while (reader.BaseStream.Position + 8 <= reader.BaseStream.Length) {
                string chunk = Encoding.ASCII.GetString(reader.ReadBytes(4));
                int size = checked((int)reader.ReadUInt32());
                long next = reader.BaseStream.Position + size + (size % 2);
                if (next > reader.BaseStream.Length) throw new InvalidDataException("Invalid WAV chunk length.");
                if (chunk == "fmt ") {
                    if (size < 16 || reader.ReadUInt16() != 1 || reader.ReadUInt16() != 1)
                        throw new InvalidDataException("Expected mono linear PCM.");
                    sampleRate = reader.ReadInt32();
                    int byteRate = reader.ReadInt32();
                    if (reader.ReadUInt16() != 2 || reader.ReadUInt16() != 16 || byteRate != sampleRate * 2)
                        throw new InvalidDataException("Expected signed 16-bit PCM.");
                } else if (chunk == "data") {
                    pcm = reader.ReadBytes(size);
                }
                reader.BaseStream.Position = next;
            }
            if (sampleRate <= 0 || pcm == null || pcm.Length % 2 != 0)
                throw new InvalidDataException("Missing or invalid PCM data.");
            return new NarrationWave { SampleRate = sampleRate, Data = pcm };
        }
    }

    public static void WriteWave(string path, int sampleRate, byte[] pcm) {
        if (pcm.Length % 2 != 0) throw new InvalidDataException("Unaligned PCM data.");
        using (var writer = new BinaryWriter(File.Create(path))) {
            writer.Write(Encoding.ASCII.GetBytes("RIFF"));
            writer.Write(36 + pcm.Length);
            writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
            writer.Write(16);
            writer.Write((ushort)1);
            writer.Write((ushort)1);
            writer.Write(sampleRate);
            writer.Write(sampleRate * 2);
            writer.Write((ushort)2);
            writer.Write((ushort)16);
            writer.Write(Encoding.ASCII.GetBytes("data"));
            writer.Write(pcm.Length);
            writer.Write(pcm);
        }
    }

    public static double Peak(byte[] pcm) {
        int maximum = 0;
        for (int i = 0; i < pcm.Length; i += 2)
            maximum = Math.Max(maximum, Math.Abs((int)BitConverter.ToInt16(pcm, i)));
        return maximum / 32768.0;
    }
}
'@
}

function Get-CaptionPhrases([string]$Narration) {
    $phrases = New-Object 'System.Collections.Generic.List[string]'
    foreach ($sentenceMatch in [regex]::Matches($Narration, '[^.!?]+(?:[.!?]+(?=\s|$)|$)')) {
        $remaining = $sentenceMatch.Value.Trim()
        while ($remaining.Length -gt 84) {
            $prefix = $remaining.Substring(0, 85)
            $naturalBreaks = @([regex]::Matches($prefix, '[,;:]\s|\s(?=(?:but|so|and|before|when|with|without|even)\s)') |
                Where-Object {
                    $_.Index -ge 30 -and -not (
                        $remaining.Substring(0, $_.Index).EndsWith('even') -and
                        $remaining.Substring($_.Index).StartsWith(' when ')
                    )
                })
            if ($naturalBreaks.Count -gt 0) {
                $splitAt = $naturalBreaks[-1].Index
                if ($remaining[$splitAt] -ne ' ') { $splitAt++ }
            } else {
                $splitAt = $prefix.LastIndexOf(' ')
                if ($remaining.Length - $splitAt -lt 18) {
                    $splitAt = $remaining.LastIndexOf(' ', [int][Math]::Floor($remaining.Length / 2))
                }
            }
            if ($splitAt -le 0) { throw 'A caption contains an unsupported unbroken word.' }
            $phrases.Add($remaining.Substring(0, $splitAt).Trim())
            $remaining = $remaining.Substring($splitAt).Trim()
        }
        if ($remaining) { $phrases.Add($remaining) }
    }
    if (($phrases -join ' ') -ne $Narration) { throw 'Caption segmentation changed the narration text.' }
    return $phrases.ToArray()
}

function Get-CaptionLines([string]$Phrase) {
    $lines = New-Object 'System.Collections.Generic.List[string]'
    $line = ''
    foreach ($word in $Phrase -split '\s+') {
        $candidate = if ($line) { "$line $word" } else { $word }
        if ($candidate.Length -gt 42 -and $line) {
            $lines.Add($line)
            $line = $word
        } else { $line = $candidate }
    }
    if ($line) { $lines.Add($line) }
    if ($lines.Count -gt 2) {
        # Balance a short final line without changing spoken phrase boundaries.
        $words = @($Phrase -split '\s+')
        for ($i = 1; $i -lt $words.Count; $i++) {
            $first = $words[0..($i - 1)] -join ' '
            $second = $words[$i..($words.Count - 1)] -join ' '
            if ($first.Length -le 44 -and $second.Length -le 44) { return @($first, $second) }
        }
        throw "Caption needs more than two readable lines: $Phrase"
    }
    return $lines.ToArray()
}

function Format-VttTime([double]$Seconds) {
    $milliseconds = [long][Math]::Round($Seconds * 1000, [MidpointRounding]::AwayFromZero)
    $hours = [long][Math]::Floor($milliseconds / 3600000)
    $minutes = [long][Math]::Floor(($milliseconds % 3600000) / 60000)
    $secondsPart = [long][Math]::Floor(($milliseconds % 60000) / 1000)
    return '{0:00}:{1:00}:{2:00}.{3:000}' -f $hours, $minutes, $secondsPart, ($milliseconds % 1000)
}

$sourceText = Get-Content -LiteralPath $scriptPath -Raw -Encoding utf8
$narrations = @([regex]::Matches($sourceText, '(?s)\*\*Narration:\*\*\s+\u201c(.*?)\u201d'))
$headings = @([regex]::Matches($sourceText, '(?m)^## (\d{2}:\d{2})\u2013(\d{2}:\d{2}) \u2014 (.+)$'))
if ($narrations.Count -ne 9 -or $headings.Count -ne 9) { throw 'Expected the nine scenes in video-script.md.' }

[void][IO.Directory]::CreateDirectory($outputPath)
[void][IO.Directory]::CreateDirectory($rawPath)
$completePcm = New-Object byte[] ([int]($boundaries[-1] * $sampleRate * 2))
$scenes = New-Object 'System.Collections.Generic.List[object]'
$vtt = New-Object 'System.Collections.Generic.List[string]'
$vtt.Add('WEBVTT')
$vtt.Add('')
$vtt.Add('NOTE Local synthetic narration draft: Microsoft System.Speech, stock en-CA voice. No external model or publication.')
$vtt.Add('')
$cueCount = 0

for ($sceneIndex = 0; $sceneIndex -lt 9; $sceneIndex++) {
    $sceneNumber = $sceneIndex + 1
    $start = [double]$boundaries[$sceneIndex]
    $end = [double]$boundaries[$sceneIndex + 1]
    $duration = $end - $start
    $heading = $headings[$sceneIndex]
    $expectedStart = '{0:00}:{1:00}' -f [int][Math]::Floor($start / 60), [int]($start % 60)
    $expectedEnd = '{0:00}:{1:00}' -f [int][Math]::Floor($end / 60), [int]($end % 60)
    if ($heading.Groups[1].Value -ne $expectedStart -or $heading.Groups[2].Value -ne $expectedEnd) {
        throw "Scene $sceneNumber no longer matches the fixed recording boundaries."
    }
    $narration = $narrations[$sceneIndex].Groups[1].Value.Trim()
    $phrases = @(Get-CaptionPhrases $narration)
    $sceneName = 'scene-{0:00}.wav' -f $sceneNumber
    $speechPath = Join-Path $rawPath $sceneName
    $rate = $InitialRate
    do {
        $marks = [EvidenceBoardNarration]::Synthesize($Voice, $rate, $sampleRate, $speechPath, [string[]]$phrases)
        $speech = [EvidenceBoardNarration]::ReadWave($speechPath)
        if ($speech.SampleRate -ne $sampleRate) { throw 'Unexpected synthesized sample rate.' }
        $fits = $speech.DurationSeconds -le ($duration - $leadSeconds - $minimumTailSeconds)
        if (-not $fits) {
            $rate++
            if ($rate -gt 5) { throw "Scene $sceneNumber cannot fit without excessive acceleration. Shorten its narration." }
        }
    } while (-not $fits)

    if ($marks.Count -ne ($phrases.Count + 1)) { throw "Missing synthesis bookmarks in scene $sceneNumber." }
    if ([EvidenceBoardNarration]::Peak($speech.Data) -eq 0) { throw "Scene $sceneNumber is silent." }
    $padded = New-Object byte[] ([int]($duration * $sampleRate * 2))
    $leadBytes = [int]($leadSeconds * $sampleRate) * 2
    [Array]::Copy($speech.Data, 0, $padded, $leadBytes, $speech.Data.Length)
    [EvidenceBoardNarration]::WriteWave((Join-Path $outputPath $sceneName), $sampleRate, $padded)
    [Array]::Copy($padded, 0, $completePcm, [int]($start * $sampleRate * 2), $padded.Length)

    $cues = New-Object 'System.Collections.Generic.List[object]'
    for ($phraseIndex = 0; $phraseIndex -lt $phrases.Count; $phraseIndex++) {
        $startMark = @($marks | Where-Object { $_.Name -eq "start_$phraseIndex" })
        $endName = if ($phraseIndex -lt $phrases.Count - 1) { 'start_' + ($phraseIndex + 1) } else { 'end' }
        $endMark = @($marks | Where-Object { $_.Name -eq $endName })
        if ($startMark.Count -ne 1 -or $endMark.Count -ne 1) { throw 'Duplicate or missing caption bookmarks.' }
        $cueStart = [Math]::Round($start + $leadSeconds + $startMark[0].Seconds, 3)
        $cueEnd = [Math]::Round($start + $leadSeconds + $endMark[0].Seconds, 3)
        if ($cueStart -lt $start -or $cueEnd -gt $end -or $cueEnd -le $cueStart) { throw 'Invalid caption interval.' }
        $cueCount++
        $cueId = 'scene-{0:00}-cue-{1:00}' -f $sceneNumber, ($phraseIndex + 1)
        $lines = @(Get-CaptionLines $phrases[$phraseIndex])
        $cues.Add([ordered]@{ id = $cueId; startSeconds = $cueStart; endSeconds = $cueEnd; text = $phrases[$phraseIndex]; lines = $lines })
        $vtt.Add($cueId)
        $vtt.Add("$(Format-VttTime $cueStart) --> $(Format-VttTime $cueEnd)")
        foreach ($line in $lines) { $vtt.Add($line.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')) }
        $vtt.Add('')
    }
    $scenes.Add([ordered]@{
        index = $sceneNumber; title = $heading.Groups[3].Value.Trim(); startSeconds = $start; endSeconds = $end
        durationSeconds = $duration; narrationStartSeconds = $start + $leadSeconds
        narrationEndSeconds = [Math]::Round($start + $leadSeconds + $speech.DurationSeconds, 6)
        speechDurationSeconds = [Math]::Round($speech.DurationSeconds, 6); speakingRate = $rate
        leadingSilenceSeconds = $leadSeconds; trailingSilenceSeconds = [Math]::Round($duration - $leadSeconds - $speech.DurationSeconds, 6)
        audioPath = ".local/video/$sceneName"; rawSpeechPath = ".local/video/raw/$sceneName"; narration = $narration; cues = $cues.ToArray()
    })
    Write-Host ("Scene {0}: {1:N2}s speech, rate {2}, padded to {3}s" -f $sceneNumber, $speech.DurationSeconds, $rate, $duration)
}

$narrationPath = Join-Path $outputPath 'narration.wav'
[EvidenceBoardNarration]::WriteWave($narrationPath, $sampleRate, $completePcm)
$verifiedWave = [EvidenceBoardNarration]::ReadWave($narrationPath)
if ($verifiedWave.DurationSeconds -ne 160 -or $verifiedWave.Data.Length -ne (160 * $sampleRate * 2)) {
    throw 'Final PCM duration must be exactly 160 seconds.'
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($captionPath, ($vtt -join "`n") + "`n", $utf8)
$format = [ordered]@{ encoding = 'PCM signed 16-bit little-endian'; sampleRateHz = $sampleRate; channels = 1; bitsPerSample = 16 }
$timings = [ordered]@{
    schemaVersion = 1; status = 'local_synthetic_draft'; durationSeconds = 160; sceneBoundariesSeconds = $boundaries
    voice = $Voice; language = 'en-CA'; audioFormat = $format; narrationPath = '.local/video/narration.wav'
    captionsPath = 'submission/demo.en-CA.vtt'; captionTimingMethod = 'System.Speech BookmarkReached.AudioPosition for each spoken phrase'
    scenes = $scenes.ToArray()
}
[IO.File]::WriteAllText((Join-Path $outputPath 'timings.json'), ($timings | ConvertTo-Json -Depth 12) + "`n", $utf8)
$metadata = [ordered]@{
    schemaVersion = 1; generatedAtUtc = [DateTime]::UtcNow.ToString('o'); status = 'local_synthetic_draft'
    syntheticNarration = $true; humanVoiceRecording = $false; voice = $Voice; language = 'en-CA'
    engine = 'Windows System.Speech.Synthesis.SpeechSynthesizer'; networkServicesUsed = $false
    voiceDisclosure = 'Generic stock Microsoft voice installed on this computer; no requested imitation of a real individual.'
    externalModelInference = $false; publicationCompleted = $false; finalVideoCreatedByThisScript = $false
    sourceScript = 'submission/video-script.md'; sourceScriptSha256 = (Get-FileHash -LiteralPath $scriptPath -Algorithm SHA256).Hash
    generator = 'submission/recording/generate-narration.ps1'; durationSeconds = 160; audioFormat = $format
    pcmFrameCount = $verifiedWave.Data.Length / 2; byteLength = (Get-Item -LiteralPath $narrationPath).Length
    audioSha256 = (Get-FileHash -LiteralPath $narrationPath -Algorithm SHA256).Hash
    peakAmplitude = [EvidenceBoardNarration]::Peak($verifiedWave.Data); sceneCount = 9; captionCueCount = $cueCount
    sceneSpeakingRates = @($scenes | ForEach-Object { $_.speakingRate })
    timingMethod = 'Measured synthesis bookmarks plus exact sample-aligned leading and trailing PCM silence.'
    verification = [ordered]@{ exactPcmDuration = $true; nonSilentScenes = $true; allCaptionBookmarksPresent = $true; playbackReviewPending = $true }
}
[IO.File]::WriteAllText((Join-Path $outputPath 'narration-metadata.json'), ($metadata | ConvertTo-Json -Depth 10) + "`n", $utf8)
Write-Host "Verified: $narrationPath is exactly 160.000 seconds; $cueCount caption cues."
