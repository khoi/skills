---
name: stale-heartbeat-watchdog-selftest
description: Test a heartbeat-based deadman watchdog by pre-aging the heartbeat file and starting the watcher with its heartbeat thread disabled. Use when verifying that a deadman or watchdog correctly detects stale heartbeats, SIGKILLs registered process groups, spares unregistered processes, and writes a trip record. Captures two silent-failure traps that make watchdog tests pass vacuously.
---

# Stale-Heartbeat Watchdog Self-Test

Verify a heartbeat-based deadman watchdog actually trips and kills registered process groups, without the test passing for the wrong reason.

## Silent-Failure Traps

Two bugs make watchdog tests appear to pass while proving nothing:

1. **Premature stop.** Calling `watcher.stop_event.set()` immediately after `watcher.start()` causes the watch loop to exit before staleness is ever observed. The deadman file is never written, but the test may not assert its absence.

2. **Heartbeat auto-refresh.** Starting the watcher with its heartbeat thread enabled causes the heartbeat file to be rewritten with a fresh mtime on every interval tick. The file can never go stale, so the watch loop never trips.

Both traps produce tests that exit cleanly with all assertions technically passing, while the watchdog behavior is untested.

## Correct Test Sequence

1. Pre-age the heartbeat file mtime far into the past (e.g. 60s ago when stale threshold is 1s).
2. Start the watcher with the heartbeat thread disabled (`start(heartbeat=False)` or equivalent).
3. Register the target process group(s) before or immediately after start.
4. Poll for the deadman/trip record file with a bounded deadline; do NOT call stop until the file appears or the deadline expires.
5. After observing the trip (or timeout), call stop and clean up child processes.

## Required Assertions

For the **registered-process kill test:**
- The deadman/trip record file exists.
- The child process has exited (poll returns non-None).
- The child's pgid appears in the record's `killedProcessGroups` (or equivalent field).

For the **unregistered-process survival test:**
- The deadman/trip record file exists (watchdog did trip on staleness).
- The bystander process is still alive (poll returns None).
- The record's `killedProcessGroups` is empty (no spurious kills).

## Helper: Pre-Age Heartbeat

```python
def stale_heartbeat(path, age_seconds=60):
    """Write a heartbeat file and set its mtime to age_seconds in the past."""
    path.write_text(json.dumps({"observedAt": 0, "beats": 0}) + "\n")
    old = time.time() - age_seconds
    os.utime(path, (old, old))
```

## Watchdog Contract

The watchdog under test must satisfy:
- `start(heartbeat=False)` runs only the watch loop, not the heartbeat writer.
- The watch loop checks heartbeat file mtime age against `stale_seconds`.
- On trip, only explicitly registered process groups receive SIGKILL.
- The trip record is written to the deadman path with `killedProcessGroups`, `heartbeatAgeSeconds`, and `staleAfterSeconds`.
- `stop()` sets the stop event; the watch loop exits on the next iteration.
