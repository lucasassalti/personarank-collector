export async function sendMatch(endpoint, match) {
  if (!endpoint) {
    return { skipped: true };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(match),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Backend retornou HTTP ${response.status}: ${body}`);
  }

  return response.json();
}
