// Synthetic controlled clock. Used only with --require by test processes.
const fs = require('node:fs');
const original = Date.now;
Date.now = () => original() + Number(fs.readFileSync(process.env.SYNTHETIC_CLOCK_FILE, 'utf8'));