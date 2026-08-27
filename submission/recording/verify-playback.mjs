import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves only the preview assets on loopback while this check is running.
// Browser playback is muted; this cannot establish human listening quality.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const metadataPath = resolve(root, 'submission/recording/assembly-metadata.json');
const reportPath = resolve(root, '.local/video/playback-verification.json');
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const videoPath = resolve(root, metadata.outputPath);
const expectedHash = createHash('sha256').update(readFileSync(videoPath)).digest('hex').toUpperCase();
if (metadata.sha256 !== expectedHash) throw new Error('Video no longer matches assembly metadata.');

const assets = new Map([
  ['/submission/demo-preview.html', ['submission/demo-preview.html', 'text/html; charset=utf-8']],
  ['/submission/evidence-board-demo-draft.mp4', ['submission/evidence-board-demo-draft.mp4', 'video/mp4']],
  ['/submission/demo.en-CA.vtt', ['submission/demo.en-CA.vtt', 'text/vtt; charset=utf-8']],
  ['/submission/recording/assembly-metadata.json', ['submission/recording/assembly-metadata.json', 'application/json']],
]);
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const asset = assets.get(pathname);
  if (!asset) { response.writeHead(404); response.end('Not found'); return; }
  const file = resolve(root, asset[0]);
  const size = statSync(file).size;
  const headers = { 'Content-Type': asset[1], 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return; }
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(response);
  } else {
    response.writeHead(200, { ...headers, 'Content-Length': size });
    createReadStream(file).pipe(response);
  }
});

await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const report = {
  status: 'running', checkedAtUtc: new Date().toISOString(), videoSha256: expectedHash,
  playbackMuted: true, humanListeningReviewCompleted: false, publicationCompleted: false,
  errors: [], externalRequests: [], frames: [],
};

try {
  browser = await chromium.launch({ headless: true, ...(process.argv[2] ? { executablePath: process.argv[2] } : {}) });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 }, locale: 'en-CA' });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin)) report.externalRequests.push(request.url()); });
  await page.goto(`${origin}/submission/demo-preview.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => {
    const video = document.getElementById('demo-video');
    if (video.error) throw new Error(`Video error ${video.error.code}: ${video.error.message}`);
    return video.readyState >= 2 && Number.isFinite(video.duration);
  }, null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const track = document.getElementById('english-captions');
    return track.readyState === 2 && track.track.cues?.length === 39;
  }, null, { timeout: 10000 });
  report.media = await page.evaluate(() => {
    const video = document.getElementById('demo-video');
    const captions = document.getElementById('english-captions');
    return {
      durationSeconds: video.duration, width: video.videoWidth, height: video.videoHeight,
      codecSupport: video.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"'),
      captionCueCount: captions.track.cues.length, captionMode: captions.track.mode,
      nativeControls: video.controls, transcriptPresent: document.querySelectorAll('.transcript p').length === 9,
    };
  });
  if (Math.abs(report.media.durationSeconds - 160) > 0.05 || report.media.width !== 1600 || report.media.height !== 1000)
    throw new Error(`Unexpected media dimensions or duration: ${JSON.stringify(report.media)}`);
  if (report.media.captionMode !== 'showing') throw new Error('Captions were not enabled by default.');

  await page.evaluate(async () => {
    const video = document.getElementById('demo-video');
    video.muted = true;
    await video.play();
  });
  await page.waitForFunction(() => document.getElementById('demo-video').currentTime > 0.6);
  report.playback = await page.evaluate(() => {
    const video = document.getElementById('demo-video');
    video.pause();
    const quality = video.getVideoPlaybackQuality();
    return { currentTime: video.currentTime, decodedVideoFrames: quality.totalVideoFrames, droppedVideoFrames: quality.droppedVideoFrames, decodedAudioBytes: video.webkitAudioDecodedByteCount ?? null };
  });
  if (report.playback.decodedVideoFrames < 1) throw new Error('No video frames decoded during playback.');

  for (const second of [8, 28, 42, 86, 105, 125, 130, 155]) {
    const frame = await page.evaluate(async target => {
      const video = document.getElementById('demo-video');
      const frameReady = new Promise(resolveFrame => video.requestVideoFrameCallback((_, detail) => resolveFrame(detail.mediaTime)));
      const seekReady = new Promise(resolveSeek => video.addEventListener('seeked', resolveSeek, { once: true }));
      video.currentTime = target;
      const [mediaTime] = await Promise.race([
        Promise.all([frameReady, seekReady]),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Frame did not decode at ${target}s.`)), 15000)),
      ]);
      return {
        targetSeconds: target, currentTime: video.currentTime, decodedFrameTime: mediaTime, readyState: video.readyState,
        activeCaptions: [...document.getElementById('english-captions').track.activeCues].map(cue => cue.text),
      };
    }, second);
    if (Math.abs(frame.currentTime - second) > 0.05 || frame.activeCaptions.length === 0)
      throw new Error(`Seek or caption activation failed at ${second}s.`);
    if ([8, 86, 130].includes(second)) {
      frame.screenshot = `.local/video/browser-preview-${String(second).padStart(3, '0')}.png`;
      await page.locator('#demo-video').screenshot({ path: resolve(root, frame.screenshot) });
    }
    report.frames.push(frame);
  }

  const reviewChapter = page.getByRole('button', { name: '01:13 · Human review', exact: true });
  await reviewChapter.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Math.abs(document.getElementById('demo-video').currentTime - 73) < 0.05);
  report.keyboardChapterSeek = true;
  if (report.errors.length || report.externalRequests.length) throw new Error('Unexpected browser error or external request.');
  report.status = 'passed';
  metadata.browserPlaybackVerification = {
    status: 'passed', browser: report.browser, measuredDurationSeconds: report.media.durationSeconds,
    captionCueCount: report.media.captionCueCount, captionsDefault: true,
    decodedVideoFrames: report.playback.decodedVideoFrames, decodedAudioBytes: report.playback.decodedAudioBytes,
    seekPositionsSeconds: report.frames.map(frame => frame.targetSeconds), keyboardChapterSeek: true,
    muted: true, humanListeningReviewCompleted: false, reportPath: '.local/video/playback-verification.json',
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
} catch (error) {
  report.status = 'failed';
  report.errors.push(error.stack ?? String(error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
