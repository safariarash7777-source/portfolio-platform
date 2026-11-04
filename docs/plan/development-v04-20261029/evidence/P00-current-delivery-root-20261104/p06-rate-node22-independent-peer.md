# Independent source review: Node 22 publication pin

Reviewed exact Git commit `9abe32f717345dbac113406d101972ee5be7466c` against `ad90bc2c9d1a1d7f13853cd481c6b471ea735b1d`.

Result: SOURCE PASS for this narrow configuration change. The only changed file is `relay/liara.json`; `platform=node` and `port=3400` are unchanged, and `node.version` is explicitly the string `22`.

Installed CLI 9.5.1 `lib/commands/deploy.js:273` copies `config[config.platform]` into `body.platformConfig`. Lines409–412 return when an explicit version exists, so this setting avoids the observed autodetection of18. The actual deployment response on run41883223653 accepted the version enum latest/22/24. Prior Linux CI used Node22; this review does not substitute for exact-commit CI or actual publication.

No source edits, test reruns, API/provider calls, deployment, or messages were performed for this review. Current-release readback and a fresh controlled publication attempt remain with the existing deployment owner. Two natural cycles have not yet been accepted.
