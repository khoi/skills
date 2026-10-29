#!/usr/bin/env node
// Measures painted blue ink bands and painted-over-printed-ink pixels in registered text-slot zones.
// Coordinates are displayed-page points (top-left origin, rotation already applied). Source and output
// rasters must come from the same renderer, dpi and page transform.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {decodePng} from './png.mjs';

const USAGE = `Usage:
  node measure-slot-bands.mjs --source <src.png> --output <out.png> --zones <zones.json> [options]

Options:
  --dpi <n>                 Raster dpi; overrides zones.json "dpi" (default 288).
  --out <file>              Write the full JSON report.
  --min-blue <n>            Blue pixels per row needed to open a band (default 3).
  --printed-threshold <n>   Source ink threshold, min(R,G,B) < n (default 140).
  --report-only             Exit 0 even when coveredPrintedPixels > 0.
  --help                    Show this help.

zones.json:
  {"dpi":288,"zones":{"slot":{"x0":335,"x1":560,"y0":615,"y1":641}}}

Method:
  blue pixel        B-R > 30 and B-G > 15
  output band       contiguous rows with at least --min-blue blue pixels
  covered printed   output blue where source min(R,G,B) < --printed-threshold
  naive ink loss    source min(R,G,B) < 128 and output min(R,G,B) >= 128
                    (blue paint itself is "ink", so this cannot see coverage)

Exit codes: 0 completed; 1 covered printed ink found; 2 usage or input error.`;

const k = (dpi) => dpi / 72;

function fail(message) {
  const error = new Error(message);
  error.usage = true;
  throw error;
}

function need(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) fail(`MISSING_VALUE ${flag}`);
  return value;
}

function parseArgs(argv) {
  const options = {dpi: null, out: null, minBlue: 3, printedThreshold: 140, reportOnly: false};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--source') options.source = need(argv, ++i, arg);
    else if (arg === '--output') options.output = need(argv, ++i, arg);
    else if (arg === '--zones') options.zones = need(argv, ++i, arg);
    else if (arg === '--out') options.out = need(argv, ++i, arg);
    else if (arg === '--dpi') options.dpi = Number(need(argv, ++i, arg));
    else if (arg === '--min-blue') options.minBlue = Number(need(argv, ++i, arg));
    else if (arg === '--printed-threshold') options.printedThreshold = Number(need(argv, ++i, arg));
    else if (arg === '--report-only') options.reportOnly = true;
    else if (arg.startsWith('-')) fail(`UNKNOWN_OPTION ${arg}`);
    else positional.push(arg);
  }
  if (positional.length) fail(`UNEXPECTED_ARGUMENT ${positional[0]}`);
  if (!options.source || !options.output || !options.zones) fail('MISSING_REQUIRED_INPUT source/output/zones');
  if (!Number.isFinite(options.dpi ?? 288) || (options.dpi ?? 288) <= 0) fail('DPI_INVALID');
  if (!Number.isInteger(options.minBlue) || options.minBlue < 1) fail('MIN_BLUE_INVALID');
  if (!Number.isInteger(options.printedThreshold) || options.printedThreshold < 1 || options.printedThreshold > 255)
    fail('PRINTED_THRESHOLD_INVALID');
  return options;
}

function readPng(file, label) {
  try {
    return decodePng(file);
  } catch (error) {
    fail(`${label}_PNG_UNREADABLE ${error.message}`);
  }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const isBlue = (r, g, b) => b - r > 30 && b - g > 15;

function zonePixels(zone, name, width, height, scale) {
  for (const key of ['x0', 'x1', 'y0', 'y1']) {
    if (!Number.isFinite(Number(zone[key]))) fail(`ZONE_INVALID ${name}.${key}`);
  }
  const x0 = Math.round(Number(zone.x0) * scale);
  const x1 = Math.round(Number(zone.x1) * scale);
  const y0 = Math.round(Number(zone.y0) * scale);
  const y1 = Math.round(Number(zone.y1) * scale);
  if (x0 < 0 || y0 < 0 || x1 > width || y1 > height || x1 <= x0 || y1 <= y0) {
    fail(`ZONE_OUT_OF_BOUNDS ${name} rectPx=${JSON.stringify({x0, x1, y0, y1})} raster=${width}x${height}`);
  }
  return {x0, x1, y0, y1};
}

function rowsToBands(rows, offsetY, scale, minInk) {
  const bands = [];
  let open = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] >= minInk) {
      if (!open) open = {start: i, end: i, pixels: 0};
      open.end = i;
      open.pixels += rows[i];
    } else if (open) {
      bands.push({
        startPx: offsetY + open.start,
        endPx: offsetY + open.end,
        topPt: +((offsetY + open.start) / scale).toFixed(2),
        bottomPt: +((offsetY + open.end + 1) / scale).toFixed(2),
        heightPt: +((open.end - open.start + 1) / scale).toFixed(2),
        pixels: open.pixels,
      });
      open = null;
    }
  }
  if (open) {
    bands.push({
      startPx: offsetY + open.start,
      endPx: offsetY + open.end,
      topPt: +((offsetY + open.start) / scale).toFixed(2),
      bottomPt: +((offsetY + open.end + 1) / scale).toFixed(2),
      heightPt: +((open.end - open.start + 1) / scale).toFixed(2),
      pixels: open.pixels,
    });
  }
  return bands;
}

function nearestPrintedBand(outputBand, printedBands) {
  let best = null;
  for (const printed of printedBands) {
    let relation, gap;
    if (outputBand.bottomPt <= printed.topPt) {
      relation = 'above';
      gap = printed.topPt - outputBand.bottomPt;
    } else if (outputBand.topPt >= printed.bottomPt) {
      relation = 'below';
      gap = outputBand.topPt - printed.bottomPt;
    } else {
      relation = 'overlap';
      gap = -(Math.min(outputBand.bottomPt, printed.bottomPt) - Math.max(outputBand.topPt, printed.topPt));
    }
    const distance = Math.abs(gap);
    if (!best || distance < best.distance) {
      best = {
        printedBand: {topPt: printed.topPt, bottomPt: printed.bottomPt},
        relation,
        gapPt: +gap.toFixed(2),
        distance,
      };
    }
  }
  if (!best) return null;
  delete best.distance;
  return best;
}

function measureZone({source, output, zone, name, scale, minBlue, printedThreshold}) {
  const rect = zonePixels(zone, name, output.width, output.height, scale);
  const blueRows = new Array(rect.y1 - rect.y0).fill(0);
  const printedRows = new Array(rect.y1 - rect.y0).fill(0);
  let coveredTotal = 0;
  let naiveLost = 0;

  for (let y = rect.y0; y < rect.y1; y++) {
    let blueCount = 0;
    let printedCount = 0;
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = (y * output.width + x) * 4;
      const or = output.pixels[i], og = output.pixels[i + 1], ob = output.pixels[i + 2];
      const sr = source.pixels[i], sg = source.pixels[i + 1], sb = source.pixels[i + 2];
      const outputBlue = isBlue(or, og, ob);
      if (outputBlue) {
        blueCount++;
        if (Math.min(sr, sg, sb) < printedThreshold) coveredTotal++;
      }
      if (!isBlue(sr, sg, sb) && Math.min(sr, sg, sb) < printedThreshold) printedCount++;
      if (Math.min(sr, sg, sb) < 128 && Math.min(or, og, ob) >= 128) naiveLost++;
    }
    blueRows[y - rect.y0] = blueCount;
    printedRows[y - rect.y0] = printedCount;
  }

  const blueBands = rowsToBands(blueRows, rect.y0, scale, minBlue);
  const printedBands = rowsToBands(printedRows, rect.y0, scale, minBlue);

  let deepestPrintedInkPt = null;
  for (let i = printedRows.length - 1; i >= 0; i--) {
    if (printedRows[i] > 0) {
      deepestPrintedInkPt = +((rect.y0 + i + 1) / scale).toFixed(2);
      break;
    }
  }

  const outputBands = blueBands.map((band) => {
    let covered = 0;
    for (let y = band.startPx; y <= band.endPx; y++) {
      for (let x = rect.x0; x < rect.x1; x++) {
        const i = (y * output.width + x) * 4;
        if (!isBlue(output.pixels[i], output.pixels[i + 1], output.pixels[i + 2])) continue;
        if (Math.min(source.pixels[i], source.pixels[i + 1], source.pixels[i + 2]) < printedThreshold) covered++;
      }
    }
    return {
      topPt: band.topPt,
      bottomPt: band.bottomPt,
      heightPt: band.heightPt,
      bluePixels: band.pixels,
      coveredPrintedPixels: covered,
      nearestPrintedBand: nearestPrintedBand(band, printedBands),
    };
  });

  return {
    rectPt: {x0: Number(zone.x0), x1: Number(zone.x1), y0: Number(zone.y0), y1: Number(zone.y1)},
    rectPx: rect,
    outputBands,
    coveredPrintedPixelsTotal: coveredTotal,
    sourcePrintedBands: printedBands.map((band) => ({
      topPt: band.topPt,
      bottomPt: band.bottomPt,
      heightPt: band.heightPt,
      printedPixels: band.pixels,
    })),
    deepestPrintedInkPt,
    naiveGateLostSourceInkPixels: naiveLost,
  };
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  let zoneDoc;
  try {
    zoneDoc = JSON.parse(fs.readFileSync(options.zones, 'utf8'));
  } catch (error) {
    fail(`ZONE_FILE_UNREADABLE ${error.message}`);
  }
  const dpi = Number(options.dpi ?? zoneDoc.dpi ?? 288);
  if (!Number.isFinite(dpi) || dpi <= 0) fail('DPI_INVALID');
  const zones = zoneDoc.zones ?? zoneDoc;
  if (!zones || typeof zones !== 'object' || Array.isArray(zones)) fail('ZONES_INVALID');
  const names = Object.keys(zones);
  if (!names.length) fail('ZONES_EMPTY');

  const source = readPng(options.source, 'SOURCE');
  const output = readPng(options.output, 'OUTPUT');
  if (source.width !== output.width || source.height !== output.height) {
    fail(`RASTER_SIZE_MISMATCH source=${source.width}x${source.height} output=${output.width}x${output.height}`);
  }

  const scale = k(dpi);
  const report = {
    kind: 'scanned_slot_baseline_measurement',
    at: new Date().toISOString(),
    dpi,
    pixelsPerPoint: +scale.toFixed(6),
    parameters: {minBlue: options.minBlue, printedThreshold: options.printedThreshold},
    inputs: {
      source: {file: path.resolve(options.source), sha256: sha256File(options.source)},
      output: {file: path.resolve(options.output), sha256: sha256File(options.output)},
    },
    method: {
      blue: 'B-R>30 and B-G>15',
      band: 'contiguous rows with at least minBlue blue pixels',
      coveredPrinted: 'output blue where source min(R,G,B) < printedThreshold',
      naiveGateLostSourceInk: 'source min(R,G,B)<128 and output min(R,G,B)>=128; blue paint counts as ink, so this cannot detect coverage',
      coordinates: 'displayed-page points, top-left origin, rotation already applied; px = round(pt * dpi / 72)',
    },
    zones: {},
  };

  let totalBands = 0;
  let totalCovered = 0;
  for (const name of names) {
    const result = measureZone({
      source, output, zone: zones[name], name, scale,
      minBlue: options.minBlue, printedThreshold: options.printedThreshold,
    });
    report.zones[name] = result;
    totalBands += result.outputBands.length;
    totalCovered += result.coveredPrintedPixelsTotal;
  }

  const verdict = totalBands === 0 ? 'NO_PAINTED_BLUE_INK'
    : totalCovered > 0 ? 'COVERED_PRINTED_INK' : 'NO_COVERED_PRINTED_INK';
  report.verdict = verdict;
  report.totals = {zones: names.length, outputBands: totalBands, coveredPrintedPixels: totalCovered};

  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), {recursive: true});
    fs.writeFileSync(outPath, JSON.stringify(report, null, 1) + '\n');
  }

  console.log(`kind=scanned_slot_baseline_measurement dpi=${dpi} zones=${names.length} bands=${totalBands}`);
  for (const name of names) {
    const zone = report.zones[name];
    console.log(`zone=${name} bands=${zone.outputBands.length} covered=${zone.coveredPrintedPixelsTotal} naiveGateLost=${zone.naiveGateLostSourceInkPixels}`);
    for (const band of zone.outputBands) {
      const nearest = band.nearestPrintedBand
        ? `${band.nearestPrintedBand.relation} gap=${band.nearestPrintedBand.gapPt}`
        : 'none';
      console.log(`  band top=${band.topPt} bottom=${band.bottomPt} blue=${band.bluePixels} covered=${band.coveredPrintedPixels} nearest=${nearest}`);
    }
  }
  console.log(`coveredPrintedPixelsTotal=${totalCovered}`);
  console.log(`verdict=${verdict}`);

  if (totalCovered > 0 && !options.reportOnly) return 1;
  return 0;
}

try {
  const code = run();
  process.exit(code);
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  process.exit(2);
}
