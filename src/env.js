import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const collectorDir = path.resolve(srcDir, '..');

loadEnvFile(path.join(collectorDir, '.env'));

export const env = {
  collectorName: process.env.COLLECTOR_NAME ?? 'local-player',
  liveClientUrl:
    process.env.LIVE_CLIENT_URL ?? 'https://127.0.0.1:2999/liveclientdata/allgamedata',
  pollIntervalMs: readNumber('POLL_INTERVAL_MS', 5000),
  idleIntervalMs: readNumber('IDLE_INTERVAL_MS', 10000),
  backendMatchEndpoint:
    process.env.BACKEND_MATCH_ENDPOINT ?? 'https://personatracker420-api.onrender.com/api/manual-matches',
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ??= stripQuotes(value);
  }
}

function readNumber(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
