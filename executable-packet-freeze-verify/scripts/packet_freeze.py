#!/usr/bin/env python3
"""Freeze and re-verify an executable admission packet.

sums    list immutable bytes in SHA256SUMS (or verify the existing list)
stable  run the packet's own check twice, compare counters, re-verify the sums
refuse  assert a gate refuses: nonzero exit, expected reason token, no side effect

Every command writes its output outside the packet root and refuses an
--out-dir inside it: a log written into a summed tree is the drift this
script exists to catch.
"""
import argparse
import fnmatch
import hashlib
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

EXIT_OK = 0
EXIT_FAIL = 1
EXIT_USAGE = 2


class Usage(Exception):
    pass


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def is_excluded(rel, patterns, is_dir=False):
    """Match a relpath or basename glob. A pattern ending in '/' prunes directories only,
    so 'run-*/' skips the run directory without also hiding 'run-owned-qa.py'."""
    name = rel.rsplit('/', 1)[-1]
    for pat in patterns:
        if pat.endswith('/'):
            if not is_dir:
                continue
            pat = pat.rstrip('/')
        if fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(name, pat):
            return True
    return False


def walk_immutable(root, patterns):
    """Return (relpath, path) for files not matched by an exclusion pattern."""
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        rel_dir = '' if rel_dir == '.' else rel_dir.replace(os.sep, '/')
        keep = []
        for d in sorted(dirnames):
            rel = f'{rel_dir}/{d}' if rel_dir else d
            if not is_excluded(rel, patterns, is_dir=True):
                keep.append(d)
        dirnames[:] = keep
        for f in sorted(filenames):
            rel = f'{rel_dir}/{f}' if rel_dir else f
            if is_excluded(rel, patterns):
                continue
            found.append((rel, Path(dirpath) / f))
    return sorted(found)


def parse_sums(path):
    entries = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line:
            continue
        digest, _, rel = line.partition('  ')
        if not rel:
            raise Usage(f'SUMS_MALFORMED: {line[:80]}')
        entries[rel] = digest
    return entries


def verify_sums(root, patterns):
    """Return (ok, entries, problems). Problems are human-readable strings."""
    sums_path = Path(root) / 'SHA256SUMS'
    if not sums_path.is_file():
        return False, 0, ['SHA256SUMS missing']
    recorded = parse_sums(sums_path)
    current = {rel: sha256(p) for rel, p in walk_immutable(root, patterns)}
    problems = []
    for rel in sorted(set(recorded) - set(current)):
        problems.append(f'missing {rel}')
    for rel in sorted(set(current) - set(recorded)):
        problems.append(f'unlisted {rel}')
    for rel in sorted(set(current) & set(recorded)):
        if current[rel] != recorded[rel]:
            problems.append(f'drift {rel}')
    return not problems, len(current), problems


def cmd_sums(args):
    root = Path(args.root).resolve()
    if not root.is_dir():
        raise Usage(f'ROOT_NOT_FOUND: {root}')
    patterns = list(args.exclude) or ['SHA256SUMS']
    if args.write:
        pairs = [(rel, sha256(p)) for rel, p in walk_immutable(root, patterns)]
        text = ''.join(f'{digest}  {rel}\n' for rel, digest in pairs)
        (root / 'SHA256SUMS').write_text(text, encoding='utf-8')
        print(f'WRITTEN entries={len(pairs)} sha256={sha256(root / "SHA256SUMS")}')
        return EXIT_OK
    ok, count, problems = verify_sums(root, patterns)
    sums_sha = sha256(root / 'SHA256SUMS') if (root / 'SHA256SUMS').is_file() else 'none'
    if ok:
        print(f'VERIFIED entries={count} sha256={sums_sha}')
        return EXIT_OK
    print(f'SUMS_DRIFT entries={count} problems={len(problems)} sha256={sums_sha}')
    for problem in problems[:10]:
        print(f'  {problem}')
    if len(problems) > 10:
        print(f'  ... {len(problems) - 10} more')
    return EXIT_FAIL


def require_outside(root, out_dir):
    out = Path(out_dir).resolve()
    if out == root or root in out.parents:
        raise Usage(f'OUT_DIR_INSIDE_PACKET: {out} (a log inside the packet becomes drift)')
    out.mkdir(parents=True, exist_ok=True)
    return out


def run_once(root, cmd, log_path, tag):
    proc = subprocess.run(cmd, cwd=root, shell=True, capture_output=True, text=True, timeout=3600)
    log_path.write_text(
        f'TAG {tag}\nEXIT {proc.returncode}\n--- stdout ---\n{proc.stdout}'
        f'\n--- stderr ---\n{proc.stderr}',
        encoding='utf-8',
    )
    return proc


def counters(stdout):
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return {k: v for k, v in data.items() if not isinstance(v, (dict, list))}


def cmd_stable(args):
    root = Path(args.root).resolve()
    if not root.is_dir():
        raise Usage(f'ROOT_NOT_FOUND: {root}')
    out = require_outside(root, args.out_dir)
    patterns = list(args.exclude) or ['SHA256SUMS', 'controller-check.json', 'phase-proof.json', 'run-*/']

    before_ok, _, before_problems = verify_sums(root, patterns)
    if not before_ok:
        print(f'SUMS_DRIFT_BEFORE problems={len(before_problems)}')
        for problem in before_problems[:10]:
            print(f'  {problem}')
        return EXIT_FAIL

    runs = []
    for index in (1, 2):
        proc = run_once(root, args.cmd, out / f'check{index}.log', f'check{index}')
        print(f'CHECK{index}_EXIT={proc.returncode}')
        if proc.returncode != 0:
            tail = (proc.stderr or proc.stdout).strip().splitlines()
            print(f'CHECK{index}_FAILED log={out / f"check{index}.log"}')
            if tail:
                print(f'  last: {tail[-1][:200]}')
            return EXIT_FAIL
        runs.append(counters(proc.stdout))

    ok, count, problems = verify_sums(root, patterns)
    if not ok:
        print(f'SUMS_DRIFT_AFTER problems={len(problems)}')
        for problem in problems[:10]:
            print(f'  {problem}')
        return EXIT_FAIL

    first, second = runs
    if first is None or second is None:
        print(f'STABLE unparsed-output entries={count} (checked exit codes and sums only)')
        return EXIT_OK
    diff = [k for k in sorted(set(first) | set(second)) if first.get(k) != second.get(k)]
    if diff:
        print(f'DRIFT counters differ: {", ".join(diff)}')
        for key in diff:
            print(f'  {key}: {first.get(key)!r} -> {second.get(key)!r}')
        return EXIT_FAIL
    shown = ' '.join(f'{k}={v}' for k, v in sorted(first.items()))
    print(f'STABLE entries={count} counters={len(first)} {shown}')
    return EXIT_OK


def cmd_refuse(args):
    root = Path(args.root).resolve()
    if not root.is_dir():
        raise Usage(f'ROOT_NOT_FOUND: {root}')
    out = require_outside(root, args.out_dir)
    side_effects = [Path(p) if Path(p).is_absolute() else root / p for p in args.no_new]
    log_path = out / (args.log or 'refusal.log')

    proc = run_once(root, args.cmd, log_path, 'refuse')
    combined = f'{proc.stdout}\n{proc.stderr}'
    created = [str(p) for p in side_effects if p.exists()]

    if proc.returncode == 0:
        print(f'NO_REFUSAL exit=0 log={log_path}')
        return EXIT_FAIL
    if proc.returncode != args.exit_code:
        print(f'UNEXPECTED_EXIT exit={proc.returncode} expected={args.exit_code} log={log_path}')
        return EXIT_FAIL
    if args.token not in combined:
        found = sorted({w for w in combined.replace('\n', ' ').split() if w.isupper() and '_' in w})
        print(f'WRONG_TOKEN expected={args.token} found={", ".join(found[:6]) or "none"} log={log_path}')
        return EXIT_FAIL
    if created:
        print(f'SIDE_EFFECT_CREATED paths={", ".join(created)} log={log_path}')
        return EXIT_FAIL
    print(f'REFUSED exit={proc.returncode} token={args.token} sideEffects=absent log={log_path}')
    return EXIT_OK


def build_parser():
    parser = argparse.ArgumentParser(description='Freeze and re-verify an executable admission packet.')
    sub = parser.add_subparsers(dest='command', required=True)

    sums = sub.add_parser('sums', help='write or verify SHA256SUMS over immutable bytes only')
    sums.add_argument('--root', required=True)
    sums.add_argument('--exclude', action='append', default=[],
                      help='glob (relpath or basename) that must never enter the sums; repeatable')
    sums.add_argument('--write', action='store_true', help='rewrite SHA256SUMS instead of verifying')
    sums.set_defaults(func=cmd_sums)

    stable = sub.add_parser('stable', help='run the check twice, compare counters, re-verify sums')
    stable.add_argument('--root', required=True)
    stable.add_argument('--cmd', required=True, help='check command, run with cwd=packet root')
    stable.add_argument('--out-dir', default='/tmp/packet-freeze-stable')
    stable.add_argument('--exclude', action='append', default=[])
    stable.set_defaults(func=cmd_stable)

    refuse = sub.add_parser('refuse', help='assert a gate refuses with a reason token')
    refuse.add_argument('--root', required=True)
    refuse.add_argument('--cmd', required=True)
    refuse.add_argument('--token', required=True, help='reason token the refusal must print')
    refuse.add_argument('--exit-code', type=int, default=1)
    refuse.add_argument('--no-new', action='append', default=[],
                        help='path that must not exist afterwards (run dir, proof, lock); repeatable')
    refuse.add_argument('--out-dir', default='/tmp/packet-freeze-refuse')
    refuse.add_argument('--log', default='refusal.log', help='log basename inside --out-dir')
    refuse.set_defaults(func=cmd_refuse)
    return parser


def main(argv):
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except Usage as exc:
        print(f'USAGE_ERROR: {exc}', file=sys.stderr)
        return EXIT_USAGE
    except subprocess.TimeoutExpired:
        print('TIMEOUT command exceeded 3600s', file=sys.stderr)
        return EXIT_FAIL
    except OSError as exc:
        print(f'IO_ERROR: {exc}', file=sys.stderr)
        return EXIT_FAIL


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
