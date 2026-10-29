#!/usr/bin/env node
// Read-only approval gate: recompute one artifact's SHA-256 and byte count and
// compare them with an owner approval record. No OCR, no raster, no writes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const USAGE = `usage: node check_owner_approval.mjs --record <approval.json> --artifact <file> [--json]

exit codes:
  0  APPROVED
  2  STALE (hash or byte count differs)
  3  INPUT_ERROR (usage, missing record, invalid record, missing artifact)`;

class UsageError extends Error {}
class InputError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseArgs(argv) {
  const args = {record: null, artifact: null, json: false, help: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--record" || arg === "--artifact") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`missing value for ${arg}`);
      args[arg.slice(2)] = value;
      continue;
    }
    throw new UsageError(`unknown argument: ${arg}`);
  }
  return args;
}

function readRecord(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new InputError("APPROVAL_RECORD_MISSING", `cannot read record: ${err.code ?? err.message}`);
  }
  let record;
  try {
    record = JSON.parse(text);
  } catch (err) {
    throw new InputError("APPROVAL_RECORD_INVALID", `record is not valid JSON: ${err.message}`);
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new InputError("APPROVAL_RECORD_INVALID", "record must be a JSON object");
  }
  const approves = record.approves;
  if (!approves || typeof approves !== "object" || Array.isArray(approves)) {
    throw new InputError("APPROVAL_RECORD_INVALID", "record.approves must be an object");
  }
  if (typeof approves.sha256 !== "string" || !/^[0-9a-f]{64}$/iu.test(approves.sha256)) {
    throw new InputError("APPROVAL_RECORD_INVALID", "record.approves.sha256 must be 64 hex characters");
  }
  if (!Number.isSafeInteger(approves.bytes) || approves.bytes < 0) {
    throw new InputError("APPROVAL_RECORD_INVALID", "record.approves.bytes must be a non-negative integer");
  }
  return {record, expected: {sha256: approves.sha256.toLowerCase(), bytes: approves.bytes}};
}

function hashArtifact(file) {
  let buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch (err) {
    throw new InputError("ARTIFACT_MISSING", `cannot read artifact: ${err.code ?? err.message}`);
  }
  return {sha256: crypto.createHash("sha256").update(buffer).digest("hex"), bytes: buffer.length};
}

function emit(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const base = `verdict=${result.verdict} record=${result.record ?? "-"} artifact=${result.artifact ?? "-"}`;
  if (result.verdict === "APPROVED") {
    console.log(`${base} sha256=${result.actual.sha256} bytes=${result.actual.bytes}`);
    return;
  }
  if (result.verdict === "STALE") {
    console.log(
      `${base} code=${result.code} expectedSHA256=${result.expected.sha256} actualSHA256=${result.actual.sha256} ` +
        `expectedBytes=${result.expected.bytes} actualBytes=${result.actual.bytes} problems=${result.problems.join(",")}`,
    );
    return;
  }
  console.log(`${base} code=${result.code} message=${result.message}`);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.log(`verdict=INPUT_ERROR code=USAGE message=${err.message}`);
    console.log(USAGE);
    process.exitCode = 3;
    return;
  }

  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!args.record || !args.artifact) {
    console.log("verdict=INPUT_ERROR code=USAGE message=both --record and --artifact are required");
    console.log(USAGE);
    process.exitCode = 3;
    return;
  }

  const result = {
    verdict: null,
    record: path.resolve(args.record),
    artifact: path.resolve(args.artifact),
    expected: null,
    actual: null,
    problems: [],
  };

  try {
    const {expected} = readRecord(result.record);
    result.expected = expected;
    const actual = hashArtifact(result.artifact);
    result.actual = actual;

    if (actual.sha256 !== expected.sha256) result.problems.push("SHA256_MISMATCH");
    if (actual.bytes !== expected.bytes) result.problems.push("BYTE_COUNT_MISMATCH");

    if (result.problems.length) {
      result.verdict = "STALE";
      result.code = "APPROVAL_RECORD_STALE";
      emit(result, args.json);
      process.exitCode = 2;
      return;
    }

    result.verdict = "APPROVED";
    emit(result, args.json);
  } catch (err) {
    if (!(err instanceof InputError)) throw err;
    result.verdict = "INPUT_ERROR";
    result.code = err.code;
    result.message = err.message;
    emit(result, args.json);
    process.exitCode = 3;
  }
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) main();
