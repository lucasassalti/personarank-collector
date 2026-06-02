import https from 'node:https';

const insecureLocalAgent = new https.Agent({
  rejectUnauthorized: false,
});

export function fetchLiveGameData(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { agent: insecureLocalAgent, timeout: 4000 }, (response) => {
      const chunks = [];

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Live Client retornou HTTP ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Live Client retornou JSON invalido: ${error.message}`));
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('Timeout ao chamar Live Client Data API.'));
    });
    request.on('error', reject);
  });
}
