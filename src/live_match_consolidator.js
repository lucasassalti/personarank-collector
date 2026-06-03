const summonersRiftNames = new Set(["summoner's rift", 'summoners rift']);
const minimumFinishedGameSeconds = 300;

export function tryConsolidateLiveMatch(snapshots) {
  try {
    return {
      match: consolidateLiveMatch(snapshots),
      skippedReason: null,
    };
  } catch (error) {
    return {
      match: null,
      skippedReason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function hasFinalGameEvent(snapshot) {
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  return events.some((event) => isGameEndEvent(event) || isNexusKillEvent(event));
}

function consolidateLiveMatch(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error('Nenhum snapshot capturado.');
  }

  const orderedSnapshots = [...snapshots].sort((a, b) => snapshotTime(a) - snapshotTime(b));
  const firstSnapshot = orderedSnapshots[0];
  const lastSnapshot = chooseLastUsefulSnapshot(orderedSnapshots);
  const gameData = lastSnapshot.gameData ?? {};
  const allPlayers = Array.isArray(lastSnapshot.allPlayers) ? lastSnapshot.allPlayers : [];
  const events = collectEvents(orderedSnapshots);
  const lcuContext = chooseLastUsefulLcuContext(orderedSnapshots);

  validateEligibleMatch({ gameData, allPlayers, events, lcuContext });

  const winningTeamId = inferWinningTeamId({
    events,
    allPlayers,
    activePlayer: lastSnapshot.activePlayer,
  });
  const teams = buildTeams({ allPlayers, winningTeamId });
  const gameId = normalizeGameId(inferGameId({ firstSnapshot, gameData }));

  return {
    id: gameId,
    gameId,
    source: 'live-client',
    map: gameData.mapName ?? "Summoner's Rift",
    queue: gameData.gameType ?? 'CUSTOM_GAME',
    playedAt: firstSnapshot.capturedAt ?? new Date().toISOString(),
    durationSeconds: Math.max(1, Math.round(Number(gameData.gameTime ?? lastSnapshot.gameTime ?? 0))),
    winningTeamId,
    notes: `Consolidado automaticamente dos snapshots da sessao ${firstSnapshot.sessionId ?? 'desconhecida'}.`,
    teams,
    metadata: {
      sessionId: firstSnapshot.sessionId ?? null,
      collectorName: firstSnapshot.collectorName ?? null,
      snapshotCount: orderedSnapshots.length,
      firstCapturedAt: firstSnapshot.capturedAt ?? null,
      lastCapturedAt: lastSnapshot.capturedAt ?? null,
      gameData,
      lcuContext,
      events,
    },
  };
}

function validateEligibleMatch({ gameData, allPlayers, events, lcuContext }) {
  if (!isSummonersRift(gameData)) {
    throw new Error(`Ignorada: mapa nao e Summoner's Rift (${gameData.mapName ?? 'desconhecido'}).`);
  }

  if (!isCustomGameCandidate({ gameData, lcuContext })) {
    throw new Error(
      `Ignorada: partida nao parece personalizada (${formatCustomEvidence({ gameData, lcuContext })}).`,
    );
  }

  if (allPlayers.length !== 10) {
    throw new Error(`Ignorada: partida nao e 5x5, jogadores encontrados: ${allPlayers.length}.`);
  }

  if (!events.some((event) => isGameEndEvent(event) || isNexusKillEvent(event))) {
    throw new Error('Ignorada: partida sem evento final de jogo.');
  }

  const durationSeconds = Number(gameData.gameTime ?? 0);
  if (!Number.isFinite(durationSeconds) || durationSeconds < minimumFinishedGameSeconds) {
    throw new Error('Ignorada: duracao muito curta, possivel remake/abandono.');
  }
}

function isSummonersRift(gameData) {
  const mapName = String(gameData.mapName ?? '').toLowerCase();
  const mapNumber = Number(gameData.mapNumber ?? gameData.mapId);
  return summonersRiftNames.has(mapName) || mapNumber === 11;
}

function isCustomGameCandidate({ gameData, lcuContext }) {
  const gameType = String(gameData.gameType ?? '').toUpperCase();
  const gameMode = String(gameData.gameMode ?? '').toUpperCase();
  const queueName = String(gameData.queueName ?? '').toUpperCase();
  const queueId = readQueueId(gameData);
  const lcuQueueId = readQueueId(lcuContext ?? {});

  if (queueId !== null) {
    return queueId === 0;
  }

  if (lcuContext?.available && lcuContext.isCustom === true) {
    return true;
  }

  if (lcuQueueId !== null) {
    return lcuQueueId === 0;
  }

  return (
    gameType.includes('CUSTOM') ||
    queueName.includes('CUSTOM') ||
    gameMode.includes('CUSTOM') ||
    gameType === 'CUSTOM_GAME'
  );
}

function readQueueId(gameData) {
  const value = gameData?.queueId ?? gameData?.queueID ?? gameData?.queue_id;
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const queueId = Number(value);
  return Number.isFinite(queueId) ? queueId : null;
}

function formatCustomEvidence({ gameData, lcuContext }) {
  return [
    `queueId=${readQueueId(gameData) ?? 'unknown'}`,
    `gameType=${gameData.gameType ?? 'unknown'}`,
    `gameMode=${gameData.gameMode ?? 'unknown'}`,
    `lcuCustom=${lcuContext?.isCustom ?? 'unknown'}`,
    `lcuQueueId=${readQueueId(lcuContext ?? {}) ?? 'unknown'}`,
    `lcuPhase=${lcuContext?.phase ?? 'unknown'}`,
  ].join(', ');
}

function inferWinningTeamId({ events, allPlayers, activePlayer }) {
  const gameEndEvent = [...events].reverse().find(isGameEndEvent);
  const explicitWinner = teamIdFromValue(
    gameEndEvent?.WinningTeam ?? gameEndEvent?.winningTeam ?? gameEndEvent?.Winner ?? gameEndEvent?.winner,
  );
  if (explicitWinner) {
    return explicitWinner;
  }

  const result = String(gameEndEvent?.Result ?? gameEndEvent?.result ?? '').toUpperCase();
  if (result === 'WIN' || result === 'LOSE' || result === 'LOSS') {
    const activeTeamId = inferActivePlayerTeamId({ activePlayer, allPlayers });
    if (activeTeamId) {
      return result === 'WIN' ? activeTeamId : oppositeTeamId(activeTeamId);
    }
  }

  const nexusKillEvent = [...events].reverse().find(isNexusKillEvent);
  const killerName = nexusKillEvent?.KillerName ?? nexusKillEvent?.killerName;
  const killer = allPlayers.find((player) => playerNameMatches(player, killerName));
  if (killer?.team) {
    return teamIdFromValue(killer.team);
  }

  throw new Error('Nao foi possivel inferir quem venceu.');
}

function buildTeams({ allPlayers, winningTeamId }) {
  return [100, 200].map((teamId) => {
    const players = allPlayers
      .filter((player) => teamIdFromValue(player.team) === teamId)
      .map((player) => normalizePlayer(player));

    return {
      teamId,
      name: teamId === 100 ? 'Equipe 1' : 'Equipe 2',
      win: teamId === winningTeamId,
      kills: sum(players, 'kills'),
      deaths: sum(players, 'deaths'),
      assists: sum(players, 'assists'),
      gold: sum(players, 'gold'),
      objectives: {
        rawVisibleCounts: [],
      },
      bans: [],
      players,
    };
  });
}

function normalizePlayer(player) {
  const scores = player.scores ?? {};
  const items = Array.isArray(player.items) ? player.items : [];
  const summonerName = player.riotId || player.summonerName || player.rawName || 'Desconhecido';
  const { gameName, tagLine } = splitRiotId(summonerName);

  return {
    gameName,
    tagLine,
    championName: player.championName ?? 'Desconhecido',
    level: Number(player.level ?? scores.level ?? 0),
    kills: Number(scores.kills ?? player.kills ?? 0),
    deaths: Number(scores.deaths ?? player.deaths ?? 0),
    assists: Number(scores.assists ?? player.assists ?? 0),
    creepScore: Number(scores.creepScore ?? scores.cs ?? player.creepScore ?? 0),
    gold: Number(scores.gold ?? player.gold ?? 0),
    items: items.map((item) => ({
      itemId: item.itemID ?? item.itemId ?? item.id ?? null,
      name: item.displayName ?? item.name ?? null,
      count: item.count ?? 1,
      price: item.price ?? null,
    })),
    raw: player,
  };
}

function chooseLastUsefulSnapshot(snapshots) {
  return [...snapshots]
    .reverse()
    .find((snapshot) => Array.isArray(snapshot.allPlayers) && snapshot.allPlayers.length > 0) ?? snapshots.at(-1);
}

function chooseLastUsefulLcuContext(snapshots) {
  return [...snapshots]
    .reverse()
    .map((snapshot) => snapshot.lcuContext)
    .find((context) => context?.available) ?? null;
}

function collectEvents(snapshots) {
  const byKey = new Map();
  for (const snapshot of snapshots) {
    const events = Array.isArray(snapshot.events) ? snapshot.events : [];
    for (const event of events) {
      const key = `${event.EventID ?? event.eventID ?? event.EventName ?? event.eventName}:${event.EventTime ?? event.eventTime ?? ''}`;
      byKey.set(key, event);
    }
  }

  return [...byKey.values()].sort((a, b) => Number(a.EventTime ?? 0) - Number(b.EventTime ?? 0));
}

function inferGameId({ firstSnapshot, gameData }) {
  return (
    gameData.gameId ??
    gameData.gameID ??
    firstSnapshot.sessionId ??
    `live-${new Date(firstSnapshot.capturedAt ?? Date.now()).getTime()}`
  );
}

function normalizeGameId(gameId) {
  const value = String(gameId ?? '').trim();
  if (!value) {
    throw new Error('Nao foi possivel definir gameId.');
  }

  return value;
}

function splitRiotId(value) {
  const text = String(value ?? '').trim();
  const hashIndex = text.lastIndexOf('#');
  if (hashIndex === -1) {
    return {
      gameName: text || 'Desconhecido',
      tagLine: '',
    };
  }

  return {
    gameName: text.slice(0, hashIndex),
    tagLine: text.slice(hashIndex + 1),
  };
}

function inferActivePlayerTeamId({ activePlayer, allPlayers }) {
  const activeName = activePlayer?.summonerName ?? activePlayer?.riotId;
  const player = allPlayers.find((candidate) => playerNameMatches(candidate, activeName));
  return player ? teamIdFromValue(player.team) : null;
}

function playerNameMatches(player, name) {
  if (!name) {
    return false;
  }

  return player.summonerName === name || player.riotId === name || player.rawName === name;
}

function teamIdFromValue(value) {
  const text = String(value ?? '').toUpperCase();
  if (value === 100 || text === '100' || text === 'ORDER' || text === 'BLUE' || text === 'TEAM_ORDER') {
    return 100;
  }
  if (value === 200 || text === '200' || text === 'CHAOS' || text === 'RED' || text === 'TEAM_CHAOS') {
    return 200;
  }
  return null;
}

function oppositeTeamId(teamId) {
  return teamId === 100 ? 200 : 100;
}

function sum(players, field) {
  return players.reduce((total, player) => total + Number(player[field] ?? 0), 0);
}

function snapshotTime(snapshot) {
  return new Date(snapshot.capturedAt ?? 0).getTime();
}

function isGameEndEvent(event) {
  const name = eventName(event);
  return name.includes('game_end') || name.includes('gameend') || name.includes('victory') || name.includes('defeat');
}

function isNexusKillEvent(event) {
  const name = eventName(event);
  return name.includes('nexus_kill') || name.includes('nexuskill');
}

function eventName(event) {
  return String(event.EventName ?? event.eventName ?? '').toLowerCase();
}
