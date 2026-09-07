#!/usr/bin/env node
/**
 * Combined statusline: ECC statusline + ccusage 5h subscription block.
 *
 * Left part  (ECC):     model | task | $cost Nt Nf dur | dir  ██░░ ctx%
 * Right part (ccusage): │ ⧗ 5h <tokens> · <time left>   (current rolling block)
 *
 * The ccusage block call is cached for CACHE_TTL ms so the statusline stays
 * snappy even though Claude Code re-renders it frequently.
 *
 * Wired via settings.json "statusLine", not hooks.json.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const ECC_STATUSLINE = path.join(HOME, '.claude', 'scripts', 'hooks', 'ecc-statusline.js');
const CCUSAGE_BIN = path.join(HOME, '.claude', 'bin', 'ccusage');
const CACHE_FILE = path.join(os.tmpdir(), 'ecc-ccusage-block.cache');
const CACHE_TTL_MS = 10000;
const SPAWN_TIMEOUT_MS = 4000;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Run the ECC statusline with the Claude Code payload and return its line. */
function eccLine(input) {
  if (!fs.existsSync(ECC_STATUSLINE)) return '';
  try {
    const result = spawnSync(process.execPath, [ECC_STATUSLINE], {
      input,
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
    });
    return (result.stdout || '').replace(/\n+$/, '');
  } catch {
    return '';
  }
}

/** Compute the ccusage 5h-block segment by reading local usage data. */
function blockSegment() {
  const bin = fs.existsSync(CCUSAGE_BIN) ? CCUSAGE_BIN : 'ccusage';
  let result;
  try {
    result = spawnSync(bin, ['blocks', '--active', '--json'], {
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
    });
  } catch {
    return '';
  }
  if (!result || !result.stdout) return '';

  let block;
  try {
    const data = JSON.parse(result.stdout);
    block = data.blocks && data.blocks.find(b => b && b.isActive);
  } catch {
    return '';
  }
  if (!block) return '';

  const used = Number(block.totalTokens) || 0;
  const usedStr = used >= 1e6 ? `${(used / 1e6).toFixed(1)}M` : `${Math.round(used / 1e3)}k`;

  const remMin = block.projection && Number.isFinite(block.projection.remainingMinutes)
    ? block.projection.remainingMinutes
    : null;

  let timeStr = '';
  let timeColor = '36'; // cyan
  if (remMin != null) {
    const h = Math.floor(remMin / 60);
    const m = remMin % 60;
    timeStr = h > 0 ? `${h}h${m}m` : `${m}m`;
    if (remMin <= 10) timeColor = '1;31'; // red: block almost reset
    else if (remMin <= 30) timeColor = '38;5;208'; // orange
  }

  const sep = ` \x1b[2m│\x1b[0m`;
  const label = `\x1b[38;5;245m⧗ 5h\x1b[0m`;
  const tokens = `\x1b[36m${usedStr}\x1b[0m`;
  const time = timeStr ? ` \x1b[2m·\x1b[0m \x1b[${timeColor}m${timeStr} left\x1b[0m` : '';
  return `${sep} ${label} ${tokens}${time}`;
}

/** Cached wrapper so ccusage runs at most once per CACHE_TTL_MS. */
function blockSegmentCached() {
  try {
    const stat = fs.statSync(CACHE_FILE);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      return fs.readFileSync(CACHE_FILE, 'utf8');
    }
  } catch {
    /* no cache yet */
  }
  const seg = blockSegment();
  try {
    fs.writeFileSync(CACHE_FILE, seg);
  } catch {
    /* best effort */
  }
  return seg;
}

function main() {
  const input = readStdin();
  let out = eccLine(input);
  out += blockSegmentCached();
  process.stdout.write(out);
}

main();
