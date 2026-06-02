import { env } from './env.js';
import { fetchLiveGameData } from './live_client.js';
import { hasFinalGameEvent, tryConsolidateLiveMatch } from './live_match_consolidator.js';
import { sendMatch } from './match_sender.js';

const maxConsecutiveFailuresInSession = 3;

let consecutiveFailures = 0;
let activeSession = null;
let firstSnapshot = null;
let latestSnapshot = null;
let sampleCount = 0;
let matchSentForCurrentSession = false;
let cooldownUntil = 0;
let stopping = false;

process.on('SIGINT', () => {
  stopping = true;
  if (activeSession) {
    console.log(`Sessao encerrada: ${activeSession.sessionId} (${sampleCount} amostras lidas)`);
  }
});

console.log('PersonaRank Collector iniciado.');
console.log(`Live Client: ${env.liveClientUrl}`);
console.log('Snapshots serao mantidos apenas em memoria durante a partida.');
console.log(
  env.backendMatchEndpoint
    ? `Partidas consolidadas serao enviadas para: ${env.backendMatchEndpoint}`
    : 'Envio de partidas ao backend desabilitado.',
);

while (!stopping) {
  try {
    const payload = await fetchLiveGameData(env.liveClientUrl);
    consecutiveFailures = 0;

    if (!activeSession && Date.now() < cooldownUntil) {
      await sleep(env.idleIntervalMs);
      continue;
    }

    if (!activeSession) {
      activeSession = createSession({ collectorName: env.collectorName, firstPayload: payload });
      firstSnapshot = null;
      latestSnapshot = null;
      sampleCount = 0;
      matchSentForCurrentSession = false;
      console.log(`Partida detectada. Gravando em memoria: ${activeSession.sessionId}`);
    }

    const snapshot = createSnapshot({
      sessionId: activeSession.sessionId,
      collectorName: env.collectorName,
      payload,
    });

    firstSnapshot ??= snapshot;
    latestSnapshot = snapshot;
    sampleCount += 1;

    console.log(
      `Gravando partida | amostras=${sampleCount} | gameTime=${formatGameTime(payload)} | ${formatGameInfo(payload)}`,
    );

    if (!matchSentForCurrentSession && hasFinalGameEvent(snapshot)) {
      await finalizeCurrentSession('evento final detectado');
      await sleep(env.idleIntervalMs);
      continue;
    }

    await sleep(env.pollIntervalMs);
  } catch (error) {
    consecutiveFailures += 1;

    if (activeSession && consecutiveFailures >= maxConsecutiveFailuresInSession) {
      await finalizeCurrentSession('Live Client indisponivel apos partida');
    }

    if (!activeSession) {
      console.log(`Aguardando partida ativa... (${error.message})`);
    }

    await sleep(activeSession ? env.pollIntervalMs : env.idleIntervalMs);
  }
}

async function finalizeCurrentSession(reason) {
  if (!activeSession) {
    return;
  }

  const snapshots = firstSnapshot === latestSnapshot ? [latestSnapshot] : [firstSnapshot, latestSnapshot].filter(Boolean);
  const { match, skippedReason } = tryConsolidateLiveMatch(snapshots);

  if (match && !matchSentForCurrentSession) {
    try {
      await sendMatch(env.backendMatchEndpoint, match);
      matchSentForCurrentSession = true;
      console.log(`Partida enviada ao backend: ${match.gameId}`);
    } catch (error) {
      console.warn(`Falha ao enviar partida ao backend: ${error.message}`);
    }
  } else if (skippedReason) {
    console.log(`Sessao nao consolidada: ${skippedReason}`);
  }

  console.log(`Sessao encerrada: ${activeSession.sessionId} (${sampleCount} amostras lidas) | ${reason}`);
  activeSession = null;
  firstSnapshot = null;
  latestSnapshot = null;
  sampleCount = 0;
  matchSentForCurrentSession = false;
  consecutiveFailures = 0;
  cooldownUntil = Date.now() + 120000;
}

function createSession({ collectorName, firstPayload }) {
  const startedAt = new Date();
  return {
    sessionId: createSessionId({ startedAt, collectorName, firstPayload }),
    startedAt: startedAt.toISOString(),
  };
}

function createSessionId({ startedAt, collectorName, firstPayload }) {
  const gameMode = sanitize(firstPayload?.gameData?.gameMode ?? 'unknown');
  const mapName = sanitize(firstPayload?.gameData?.mapName ?? 'unknown');
  const collector = sanitize(collectorName);
  const timestamp = startedAt.toISOString().replace(/[:.]/g, '-');

  return `${timestamp}_${collector}_${gameMode}_${mapName}`;
}

function sanitize(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'unknown';
}

function createSnapshot({ sessionId, collectorName, payload }) {
  return {
    sessionId,
    collectorName,
    capturedAt: new Date().toISOString(),
    gameTime: payload?.gameData?.gameTime ?? null,
    gameData: payload?.gameData ?? {},
    activePlayer: payload?.activePlayer ?? null,
    allPlayers: payload?.allPlayers ?? [],
    events: payload?.events?.Events ?? [],
    raw: payload,
  };
}

function formatGameTime(payload) {
  const gameTime = Number(payload?.gameData?.gameTime ?? 0);
  if (!Number.isFinite(gameTime)) {
    return 'unknown';
  }

  const minutes = Math.floor(gameTime / 60).toString().padStart(2, '0');
  const seconds = Math.floor(gameTime % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatGameInfo(payload) {
  const gameData = payload?.gameData ?? {};
  const players = Array.isArray(payload?.allPlayers) ? payload.allPlayers.length : 0;
  const events = Array.isArray(payload?.events?.Events) ? payload.events.Events.length : 0;

  return [
    `gameType=${gameData.gameType ?? 'unknown'}`,
    `gameMode=${gameData.gameMode ?? 'unknown'}`,
    `map=${gameData.mapName ?? gameData.mapNumber ?? gameData.mapId ?? 'unknown'}`,
    `players=${players}`,
    `events=${events}`,
  ].join(' | ');
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
