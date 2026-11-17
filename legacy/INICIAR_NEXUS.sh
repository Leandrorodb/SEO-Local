#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ ! -d node_modules/playwright ]; then npm install --no-audit --no-fund || exit 1; fi
node src/server.js
