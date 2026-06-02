# PersonaRank Collector

Coletor local do PersonaRank para partidas customizadas 5v5 em Summoner's Rift.

Este projeto deve rodar na maquina de um jogador enquanto a partida esta acontecendo. Ele le a Live Client Data API local do League of Legends e envia a partida consolidada para o backend somente quando detectar o fim do jogo.

```text
https://127.0.0.1:2999/liveclientdata/allgamedata
```

## Requisitos

- Windows.
- League of Legends aberto durante a partida.
- Node.js 18 ou superior instalado.

## Como rodar

Opção mais simples no Windows:

1. Baixe ou clone este projeto.
2. Dê dois cliques em `start-collector.bat`.
3. Na primeira execucao, ele cria um arquivo `.env`.
4. Edite o `.env` e troque `COLLECTOR_NAME` pelo seu nome.
5. Abra o coletor antes ou durante a partida e deixe a janela aberta ate o fim.

Tambem da para rodar pelo terminal:

```powershell
copy .env.example .env
npm start
```

## Configuracao

Variaveis principais do `.env`:

```text
LIVE_CLIENT_URL=https://127.0.0.1:2999/liveclientdata/allgamedata
POLL_INTERVAL_MS=5000
IDLE_INTERVAL_MS=10000
BACKEND_MATCH_ENDPOINT=https://personatracker420-api.onrender.com/api/manual-matches
COLLECTOR_NAME=local-player
```

`BACKEND_MATCH_ENDPOINT` aponta para a API publicada do PersonaRank.

## Logs esperados

Quando nao existe partida ativa:

```text
Aguardando partida ativa...
```

Quando a partida comeca:

```text
Partida detectada: ...
Gravando partida | amostras=... | gameType=... | gameMode=... | map=... | players=...
```

Quando a partida termina:

```text
Sessao consolidada: ...
Partida enviada ao backend: ...
```

## Regras de coleta

O coletor so envia a partida quando:

- A partida terminou com evento final detectado.
- A partida tem 10 jogadores.
- O mapa e Summoner's Rift.
- A partida parece ser customizada 5v5.
- A duracao nao parece remake ou abandono muito curto.

Se o coletor for fechado antes do fim, a partida nao sera enviada.

## Para publicar em outro repositorio

Crie um repositorio novo no GitHub e rode:

```powershell
cd outputs\personarank_collector
git init
git add .
git commit -m "Initial PersonaRank collector"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/personarank-collector.git
git push -u origin main
```
