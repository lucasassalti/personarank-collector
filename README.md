# PersonaRank Collector

Coletor local do PersonaRank para partidas customizadas 5v5 em Summoner's Rift.

Este projeto deve rodar na maquina de um jogador enquanto a partida esta acontecendo. Ele le a Live Client Data API local do League of Legends, complementa o contexto pela LCU API do client, e envia a partida consolidada para o backend somente quando detectar o fim do jogo.

```text
https://127.0.0.1:2999/liveclientdata/allgamedata
```

## Requisitos para desenvolvimento

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

## Gerando pacote para Windows

Para gerar um pacote que ja leva um Node.js portatil junto:

```powershell
npm.cmd run release:win
```

O arquivo final sera:

```text
dist/personarank-collector-windows.zip
```

Esse zip inclui:

- `runtime/node.exe`
- `src/`
- `package.json`
- `start-collector.bat`
- `.env.example`
- `README.md`

Quem baixar nao precisa instalar Node.js. Basta extrair o zip, abrir `start-collector.bat`, editar o `COLLECTOR_NAME` no `.env` criado automaticamente, e deixar a janela aberta ate o fim da partida.

Por padrao o script baixa o Node.js `v18.20.8`. Para usar outra versao, defina `PERSONARANK_NODE_VERSION` antes de rodar o release.

## Configuracao

Variaveis principais do `.env`:

```text
LIVE_CLIENT_URL=https://127.0.0.1:2999/liveclientdata/allgamedata
POLL_INTERVAL_MS=5000
IDLE_INTERVAL_MS=10000
BACKEND_MATCH_ENDPOINT=https://personatracker420-api.onrender.com/api/manual-matches
LCU_CONTEXT_ENABLED=true
LCU_LOCKFILE_PATH=
COLLECTOR_NAME=local-player
```

`BACKEND_MATCH_ENDPOINT` aponta para a API publicada do PersonaRank.

`LCU_CONTEXT_ENABLED=true` permite ler o `lockfile` do client para consultar `/lol-lobby/v2/lobby` e `/lol-gameflow/v1/session`. Isso ajuda a identificar partidas personalizadas quando a Live Client Data API mostra apenas `gameMode=CLASSIC`.

Se o League estiver instalado em um caminho fora do padrao, preencha `LCU_LOCKFILE_PATH` com o caminho completo do `lockfile`.

## Logs esperados

Quando nao existe partida ativa:

```text
Aguardando partida ativa...
```

Quando a partida comeca:

```text
Partida detectada: ...
Gravando partida | amostras=... | queueId=... | gameType=... | gameMode=... | map=... | players=...
```

Com LCU disponivel, o mesmo log tambem mostra:

```text
lcuCustom=... lcuQueueId=... lcuMapId=... lcuTeamSize=... lcuPhase=...
```

Quando a partida termina:

```text
Sessao consolidada: ...
Partida enviada ao backend: ...
```

## Regras de coleta

O coletor so envia a partida quando:

- A partida terminou com evento final detectado.
- Se o evento final nao vier, o coletor tambem aceita quando a Live Client fica indisponivel apos uma partida com pelo menos 15 minutos. Nesse caso, o vencedor e inferido pelo placar do ultimo snapshot: primeiro por kills do time, depois por ouro em caso de empate.
- A partida tem 10 jogadores.
- O mapa e Summoner's Rift.
- A Live Client indica `queueId=0`, quando esse campo existe.
- Se a Live Client nao trouxer `queueId`, a LCU pode validar a partida com `isCustom=true` ou `customGameLobby`.
- Se a LCU nao trouxer `isCustom=true`, `lcuQueueId=0` tambem e aceito.
- Se nem Live Client nem LCU trouxerem contexto, o coletor aceita apenas campos explicitamente custom, como `gameType`, `gameMode` ou `queueName` contendo `CUSTOM`.
- A duracao nao parece remake ou abandono muito curto.

Importante: `CLASSIC` sozinho nao e considerado custom, porque filas ranqueadas, draft, blind, flex e quickplay tambem usam `CLASSIC`.

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

## Publicando o pacote para amigos

Depois de rodar:

```powershell
npm run release:win
```

Suba `dist/personarank-collector-windows.zip` em uma release do GitHub:

1. Abra o repositorio no GitHub.
2. Va em `Releases`.
3. Clique em `Draft a new release`.
4. Crie uma tag, por exemplo `v0.1.0`.
5. Anexe o arquivo `personarank-collector-windows.zip`.
6. Publique a release.

Se o Windows mostrar aviso de seguranca ao abrir o `start-collector.bat` ou `node.exe`, isso e esperado para arquivos baixados da internet. Seus amigos podem clicar em `Mais informacoes` e depois em `Executar assim mesmo`.
