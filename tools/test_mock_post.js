import http from 'http';

function test() {
  const data = JSON.stringify({ prompt: 'Explain photosynthesis in simple terms', context: 'Photosynthesis converts light into chemical energy.' });

  const options = {
    hostname: '127.0.0.1',
    port: 5174,
    path: '/api/openrouter',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Body:', body);
    });
  });

  req.on('error', (e) => console.error('Request error', e));
  req.write(data);
  req.end();
}

test();
