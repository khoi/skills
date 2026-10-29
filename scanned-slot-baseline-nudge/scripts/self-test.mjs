// Self-test for the slot-band measurement. Builds its own PNG fixtures in a temporary directory, so it
// never needs a real scan. The critical negative control is the sparse dotted guide: blue text can
// overlap it vertically and still cover zero printed pixels, while a naive min(R,G,B) ink gate sees no
// ink loss even when the text does cover the dots.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encodePng, blankCanvas, fillPixel} from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'measure-slot-bands.mjs');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-band-'));
let passed = 0, failed = 0, skipped = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok ${passed + failed + skipped} - ${name}`);
  } catch (error) {
    failed++;
    console.log(`not ok ${passed + failed + skipped} - ${name} - ${error.message}`);
  }
}

function skip(name, reason) {
  skipped++;
  console.log(`skip ${passed + failed + skipped} - ${name} - ${reason}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}

function image(width, height) {
  return blankCanvas(width, height);
}

function copy(img) {
  return {width: img.width, height: img.height, channels: 4, pixels: Uint8Array.from(img.pixels)};
}

function rect(img, x0, y0, x1, y1, rgb) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fillPixel(img, x, y, rgb);
}

function dots(img, x0, y0, x1, y1, step, rgb = [0, 0, 0]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x += step) fillPixel(img, x, y, rgb);
}

function saveCase(prefix, sourceImg, outputImg, zones, dpi = 72) {
  const source = path.join(WORK, `${prefix}-src.png`);
  const output = path.join(WORK, `${prefix}-out.png`);
  const zoneFile = path.join(WORK, `${prefix}-zones.json`);
  const reportFile = path.join(WORK, `${prefix}-report.json`);
  fs.writeFileSync(source, encodePng(sourceImg.width, sourceImg.height, sourceImg.pixels));
  fs.writeFileSync(output, encodePng(outputImg.width, outputImg.height, outputImg.pixels));
  fs.writeFileSync(zoneFile, JSON.stringify({dpi, zones}, null, 1) + '\n');
  return {source, output, zones: zoneFile, report: reportFile};
}

function runCase(files, extra = []) {
  return spawnSync(process.execPath, [
    SCRIPT, '--source', files.source, '--output', files.output,
    '--zones', files.zones, '--out', files.report, ...extra,
  ], {encoding: 'utf8'});
}

function readReport(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

check('a band above the printed guide has zero coverage and a positive gap', () => {
  const src = image(200, 200);
  dots(src, 0, 100, 200, 104, 4);
  const out = copy(src);
  rect(out, 10, 80, 190, 91, [0, 0, 255]);
  const files = saveCase('above', src, out, {above: {x0: 0, x1: 200, y0: 70, y1: 120}});
  const result = runCase(files);
  equal(result.status, 0, 'exit status');
  const report = readReport(files.report);
  const zone = report.zones.above;
  equal(zone.outputBands.length, 1, 'band count');
  equal(zone.outputBands[0].topPt, 80, 'topPt');
  equal(zone.outputBands[0].bottomPt, 91, 'bottomPt');
  equal(zone.outputBands[0].bluePixels, 180 * 11, 'blue pixels');
  equal(zone.outputBands[0].coveredPrintedPixels, 0, 'covered');
  equal(zone.outputBands[0].nearestPrintedBand.relation, 'above', 'relation');
  equal(zone.outputBands[0].nearestPrintedBand.gapPt, 9, 'gap');
  equal(report.verdict, 'NO_COVERED_PRINTED_INK', 'verdict');
});

check('blue over printed dots is covered, and the naive ink gate misses it', () => {
  const src = image(200, 200);
  dots(src, 0, 100, 200, 104, 4);
  const out = copy(src);
  rect(out, 10, 100, 190, 106, [0, 0, 255]);
  const files = saveCase('covered', src, out, {covered: {x0: 0, x1: 200, y0: 90, y1: 120}});
  const result = runCase(files);
  equal(result.status, 1, 'exit status without --report-only');
  const report = readReport(files.report);
  const zone = report.zones.covered;
  equal(zone.outputBands.length, 1, 'band count');
  equal(zone.outputBands[0].coveredPrintedPixels, 180, 'covered pixels');
  equal(zone.coveredPrintedPixelsTotal, 180, 'covered total');
  equal(zone.naiveGateLostSourceInkPixels, 0, 'naive gate blind spot');
  equal(zone.outputBands[0].nearestPrintedBand.relation, 'overlap', 'relation');
  equal(zone.outputBands[0].nearestPrintedBand.gapPt, -4, 'overlap gap');
  equal(report.verdict, 'COVERED_PRINTED_INK', 'verdict');
});

check('--report-only keeps a covered finding but exits 0', () => {
  const src = image(200, 200);
  dots(src, 0, 100, 200, 104, 4);
  const out = copy(src);
  rect(out, 10, 100, 190, 106, [0, 0, 255]);
  const files = saveCase('report-only', src, out, {covered: {x0: 0, x1: 200, y0: 90, y1: 120}});
  const result = runCase(files, ['--report-only']);
  equal(result.status, 0, 'exit status with --report-only');
  const report = readReport(files.report);
  equal(report.verdict, 'COVERED_PRINTED_INK', 'verdict is not downgraded');
});

check('blue between sparse dots overlaps vertically but covers nothing', () => {
  const src = image(200, 200);
  dots(src, 0, 100, 200, 104, 4);
  const out = copy(src);
  for (let y = 100; y < 105; y++) for (let x = 2; x < 200; x += 4) fillPixel(out, x, y, [0, 0, 255]);
  const files = saveCase('between', src, out, {between: {x0: 0, x1: 200, y0: 90, y1: 120}});
  const result = runCase(files);
  equal(result.status, 0, 'exit status');
  const report = readReport(files.report);
  const zone = report.zones.between;
  equal(zone.outputBands.length, 1, 'band count');
  equal(zone.outputBands[0].coveredPrintedPixels, 0, 'covered pixels');
  equal(zone.outputBands[0].nearestPrintedBand.relation, 'overlap', 'vertical relation is overlap');
  equal(zone.outputBands[0].nearestPrintedBand.gapPt, -4, 'overlap gap');
});

check('light source pixels are not printed ink; dark ones are', () => {
  const src = image(200, 200);
  rect(src, 0, 100, 100, 104, [0, 0, 0]);
  rect(src, 100, 100, 200, 104, [200, 200, 200]);
  const out = copy(src);
  rect(out, 0, 100, 200, 104, [0, 0, 255]);
  const files = saveCase('threshold', src, out, {line: {x0: 0, x1: 200, y0: 90, y1: 120}});
  const result = runCase(files);
  equal(result.status, 1, 'exit status');
  const report = readReport(files.report);
  equal(report.zones.line.coveredPrintedPixelsTotal, 400, 'only the dark half counts');
  equal(report.zones.line.sourcePrintedBands.length, 1, 'one printed band');
});

check('dpi scaling converts points to pixels', () => {
  const src = image(400, 400);
  const out = copy(src);
  rect(out, 40, 50, 80, 60, [0, 0, 255]);
  const files = saveCase('dpi', src, out, {scaled: {x0: 10, x1: 20, y0: 10, y1: 20}}, 288);
  const result = runCase(files);
  equal(result.status, 0, 'exit status');
  const report = readReport(files.report);
  const zone = report.zones.scaled;
  equal(zone.rectPx, {x0: 40, x1: 80, y0: 40, y1: 80}, 'rectPx');
  equal(zone.outputBands[0].topPt, 12.5, 'topPt');
  equal(zone.outputBands[0].bottomPt, 15, 'bottomPt');
  equal(zone.outputBands[0].bluePixels, 400, 'blue pixels');
});

check('a raster size mismatch is a usage error', () => {
  const src = image(100, 100);
  const out = image(120, 100);
  const files = saveCase('size', src, out, {box: {x0: 0, x1: 100, y0: 0, y1: 10}});
  const result = runCase(files);
  equal(result.status, 2, 'exit status');
  assert(result.stderr.includes('RASTER_SIZE_MISMATCH'), 'stderr names the mismatch');
});

check('a zone outside the raster is a usage error', () => {
  const src = image(100, 100);
  const out = copy(src);
  const files = saveCase('bounds', src, out, {box: {x0: 0, x1: 200, y0: 0, y1: 10}});
  const result = runCase(files);
  equal(result.status, 2, 'exit status');
  assert(result.stderr.includes('ZONE_OUT_OF_BOUNDS'), 'stderr names the bounds error');
});

check('a zone with no painted blue ink is reported, not invented', () => {
  const src = image(200, 200);
  dots(src, 0, 100, 200, 104, 4);
  const out = copy(src);
  const files = saveCase('blank', src, out, {blank: {x0: 0, x1: 200, y0: 90, y1: 120}});
  const result = runCase(files);
  equal(result.status, 0, 'exit status');
  const report = readReport(files.report);
  equal(report.zones.blank.outputBands.length, 0, 'band count');
  equal(report.zones.blank.coveredPrintedPixelsTotal, 0, 'covered total');
  equal(report.verdict, 'NO_PAINTED_BLUE_INK', 'verdict');
});

check('the JSON report carries inputs, method and totals', () => {
  const src = image(200, 200);
  const out = copy(src);
  rect(out, 10, 80, 190, 91, [0, 0, 255]);
  const files = saveCase('schema', src, out, {above: {x0: 0, x1: 200, y0: 70, y1: 120}});
  const result = runCase(files);
  equal(result.status, 0, 'exit status');
  const report = readReport(files.report);
  equal(report.kind, 'scanned_slot_baseline_measurement', 'kind');
  equal(report.inputs.source.sha256.length, 64, 'source sha length');
  equal(report.inputs.output.sha256.length, 64, 'output sha length');
  assert(report.method.coveredPrinted.includes('source min(R,G,B)'), 'method names the source threshold');
  equal(report.totals.zones, 1, 'zone total');
  equal(report.totals.outputBands, 1, 'band total');
});

check('--help exits 0 and names the gate option', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '--help'], {encoding: 'utf8'});
  equal(result.status, 0, 'exit status');
  assert(result.stdout.includes('Usage:'), 'usage line');
  assert(result.stdout.includes('--report-only'), 'gate option');
});

check('missing required inputs are a usage error', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '--source', 'x.png'], {encoding: 'utf8'});
  equal(result.status, 2, 'exit status');
  assert(result.stderr.includes('MISSING_REQUIRED_INPUT'), 'stderr names the missing input');
});

console.log(`SELFTEST: ${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failed === 0) fs.rmSync(WORK, {recursive: true, force: true});
else console.log(`fixtures kept at ${WORK}`);
process.exit(failed === 0 ? 0 : 1);
