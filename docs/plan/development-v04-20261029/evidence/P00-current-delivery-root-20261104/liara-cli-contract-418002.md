# Installed CLI contract refresh — source only

Read on 2026-11-04. Installed @liara/cli 9.5.1 `lib/commands/app/shell.js` SHA256 remains `3bf2c50bd4794be8a501073754b6bc578c486618772d08a29e4e3386cf0667fa`.

- Lines 40–46: after WebSocket open, waits one second and sends START with local terminal columns/rows. This code does not validate an acknowledgement of command execution.
- Lines 47–64: TTY input is forwarded as input messages; resize forwards terminal dimensions. Non-TTY emits a warning; there is no explicit non-PTY switch in this command's own flags (119–130).
- Lines 66–72: message data is written directly to stdout; socket close exits zero without checking a remote exit status. Neither line proves the requested command succeeded or stopped.
- Lines 126–130: command is a caller-supplied string, default /bin/bash. No claim follows about server-side parsing, PTY behavior, stdout/stderr separation, one-frame delivery, or control-character insertion. This client source supplies none of those guarantees.

Root's sanitized run41800223050 receipt was read: first rejected control family CR, UTF-16 offset8, count capped32, frame431 bytes. This is not evidence of ANSI, Docker multiplexing, successful command execution, PID or backend identity. Raw frame and private credentials were not accessed. CLI was not invoked; no network, retry, START, configuration change or parser relaxation was performed.

Unresolved prerequisite: a documented server contract for non-interactive output and exit/termination semantics, or an independently reviewed bounded transport design. Do not infer command flags or strip controls based on this result. Existing acceptance and NO_RETRY remain unchanged.
