import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const insecureLocalAgent = new https.Agent({
  rejectUnauthorized: false,
});

export async function fetchLcuContext({ lockfilePath, timeoutMs = 1500 } = {}) {
  const lockfile = readLockfile(lockfilePath);
  if (!lockfile) {
    return {
      available: false,
      reason: 'lockfile nao encontrado',
    };
  }

  const [lobby, gameflow] = await Promise.all([
    fetchLcuJson(lockfile, '/lol-lobby/v2/lobby', timeoutMs).catch((error) => ({ error: error.message })),
    fetchLcuJson(lockfile, '/lol-gameflow/v1/session', timeoutMs).catch((error) => ({ error: error.message })),
  ]);

  return normalizeLcuContext({ lockfile, lobby, gameflow });
}

function readLockfile(configuredPath) {
  for (const candidate of getLockfileCandidates(configuredPath)) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }

    const content = fs.readFileSync(candidate, 'utf8').trim();
    const [name, pid, port, password, protocol] = content.split(':');
    if (!port || !password || !protocol) {
      continue;
    }

    return {
      path: candidate,
      name,
      pid,
      port,
      password,
      protocol,
    };
  }

  return null;
}

function getLockfileCandidates(configuredPath) {
  return [
    configuredPath,
    path.join(process.cwd(), 'lockfile'),
    'C:\\Riot Games\\League of Legends\\lockfile',
    'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
    'C:\\Program Files (x86)\\Riot Games\\League of Legends\\lockfile',
  ];
}

function fetchLcuJson(lockfile, endpoint, timeoutMs) {
  const auth = Buffer.from(`riot:${lockfile.password}`).toString('base64');
  const url = `${lockfile.protocol}://127.0.0.1:${lockfile.port}${endpoint}`;

  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        agent: insecureLocalAgent,
        timeout: timeoutMs,
        headers: {
          authorization: `Basic ${auth}`,
        },
      },
      (response) => {
        const chunks = [];

        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');

          if (response.statusCode === 404) {
            resolve(null);
            return;
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`LCU ${endpoint} retornou HTTP ${response.statusCode}: ${body}`));
            return;
          }

          try {
            resolve(body ? JSON.parse(body) : null);
          } catch (error) {
            reject(new Error(`LCU ${endpoint} retornou JSON invalido: ${error.message}`));
          }
        });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error(`Timeout ao chamar LCU ${endpoint}.`));
    });
    request.on('error', reject);
  });
}

function normalizeLcuContext({ lockfile, lobby, gameflow }) {
  const lobbyCustomConfig = lobby?.customGameLobby?.configuration;
  const gameflowQueue = gameflow?.gameData?.queue;
  const gameflowCustomConfig = gameflow?.gameData?.customGameLobby?.configuration;
  const queueId = firstNumber(
    lobby?.gameConfig?.queueId,
    lobby?.queueId,
    gameflowQueue?.id,
    gameflow?.gameData?.queueId,
  );
  const mapId = firstNumber(
    lobbyCustomConfig?.mapId,
    lobby?.gameConfig?.mapId,
    gameflowCustomConfig?.mapId,
    gameflow?.gameData?.mapId,
    gameflowQueue?.mapId,
  );
  const teamSize = firstNumber(
    lobbyCustomConfig?.teamSize,
    lobby?.gameConfig?.maxTeamSize,
    gameflowCustomConfig?.teamSize,
  );
  const isCustom = Boolean(
    lobby?.isCustom ||
      lobby?.customGameLobby ||
      gameflow?.gameData?.isCustomGame ||
      gameflow?.gameData?.customGameLobby ||
      queueId === 0,
  );

  return {
    available: true,
    lockfilePath: lockfile.path,
    phase: gameflow?.phase ?? null,
    isCustom,
    queueId,
    mapId,
    teamSize,
    gameMode:
      lobbyCustomConfig?.gameMode ??
      lobby?.gameConfig?.gameMode ??
      gameflowCustomConfig?.gameMode ??
      gameflow?.gameData?.gameMode ??
      gameflowQueue?.gameMode ??
      null,
    lobby: sanitizeLcuPayload(lobby),
    gameflow: sanitizeLcuPayload(gameflow),
  };
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function sanitizeLcuPayload(value) {
  if (!value || value.error) {
    return value ?? null;
  }

  return value;
}
