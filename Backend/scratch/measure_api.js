const http = require('http');

const start = Date.now();
http.get('http://localhost:5000/api/user/home', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const end = Date.now();
    console.log(`HTTP request completed in ${end - start} ms`);
    console.log(`Response status: ${res.statusCode}`);
    try {
      const json = JSON.parse(data);
      console.log(`success: ${json.success}`);
    } catch(e) {
      console.log('Error parsing JSON');
    }
  });
}).on('error', (e) => {
  console.error('Connection error:', e.message);
});
