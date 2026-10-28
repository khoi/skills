// Run from any cwd: node --test /path/to/scripts/check_citations.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const checker = fileURLToPath(new URL("./check_citations.mjs", import.meta.url));

test("citation CLI range validation and controls", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "citation-ranges-"));
  try {
    const skill = path.join(root, "fixture skill");
    fs.mkdirSync(skill);
    // No trailing newline: exactly three addressable lines.
    fs.writeFileSync(path.join(skill, "target.txt"), "first\nsecond\nthird");
    const cases = [
      ["single line", "target.txt:2", 0, "second"],
      ["ordered range", "target.txt:1-3", 0, "third"],
      ["equal endpoints", "target.txt:3-3", 0, "third"],
      ["sentence punctuation", "target.txt:1-3.", 0, "third"],
      ["line annotation", "target.txt:1: first", 0, "first"],
      ["range annotation", "target.txt:1-3: selected span", 0, "third"],
      ["reversed range", "target.txt:3-1", 1, "invalid line range"],
      ["zero end", "target.txt:2-0", 1, "invalid line range"],
      ["zero start", "target.txt:0-2", 1, "invalid line range"],
      ["both zero", "target.txt:0-0", 1, "invalid line range"],
      ["zero single", "target.txt:0", 1, "invalid line range"],
      ["negative start", "target.txt:-1-2", 1, "invalid line range"],
      ["negative end", "target.txt:2--1", 1, "invalid line range"],
      ["both negative", "target.txt:-3--1", 1, "invalid line range"],
      ["negative single", "target.txt:-1", 1, "invalid line range"],
      ["empty end", "target.txt:2-", 1, "invalid line range"],
      ["missing endpoints", "target.txt:-", 1, "invalid line range"],
      ["decimal start", "target.txt:1.5", 1, "invalid line range"],
      ["decimal end", "target.txt:1-2.5", 1, "invalid line range"],
      ["leading-dot decimal", "target.txt:.5", 1, "invalid line range"],
      ["leading-dot start", "target.txt:.5-2", 1, "invalid line range"],
      ["leading-dot end", "target.txt:1-.5", 1, "invalid line range"],
      ["fraction end", "target.txt:1-2/3", 1, "invalid line range"],
      ["colon endpoint", "target.txt:1:2", 1, "invalid line range"],
      ["exponent start", "target.txt:1e3", 1, "invalid line range"],
      ["exponent end", "target.txt:1-2e3", 1, "invalid line range"],
      ["alphabetic end", "target.txt:1-nope", 1, "invalid line range"],
      ["extra endpoint", "target.txt:1-2-3", 1, "invalid line range"],
      ["start beyond EOF", "target.txt:4-5", 1, "line out of range"],
      ["end beyond EOF", "target.txt:2-4", 1, "end line out of range"],
      ["single beyond EOF", "target.txt:4", 1, "line out of range"],
      ["unsafe start", "target.txt:9007199254740993", 1, "invalid line range"],
      ["unsafe end", "target.txt:1-9007199254740993", 1, "invalid line range"],
      ["overflow end", `target.txt:1-${"9".repeat(400)}`, 1, "invalid line range"],
      ["missing target", "missing.txt:1", 1, "file not found"],
      ["mixed valid and invalid", "target.txt:1 target.txt:3-1", 1, "invalid line range", 2, 1],
    ];
    for (const [name, citation, status, signal, count = 1, valid = status === 0 ? 1 : 0] of cases) {
      await t.test(name, () => {
        fs.writeFileSync(path.join(skill, "SKILL.md"), `Evidence: ${citation}\n`);
        const result = spawnSync(process.execPath, [checker, skill, "--root", root, "--full"], {
          cwd: root, encoding: "utf8", timeout: 10000,
        });
        assert.ifError(result.error);
        assert.equal(result.signal, null);
        assert.equal(result.status, status, result.stdout + result.stderr);
        assert.equal(result.stderr, "");
        assert.ok(result.stdout.includes(signal), result.stdout);
        assert.ok(result.stdout.includes(`citations: ${count}  in range: ${valid}`), result.stdout);
        assert.ok(result.stdout.includes(`VERDICT: ${status === 0 ? "OK" : "PROBLEM"}`), result.stdout);
        assert.doesNotMatch(result.stdout, /TypeError|RangeError|ReferenceError/);
      });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    assert.equal(fs.existsSync(root), false);
  }
});
