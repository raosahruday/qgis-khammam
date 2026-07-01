const db = require('./src/config/db');

db.query("SELECT id, name, properties FROM infrastructure WHERE type = 'road' LIMIT 5").then(res => {
  res.rows.forEach(r => {
    console.log(`ID: ${r.id}, Name: ${r.name}, Properties:`, JSON.stringify(r.properties));
  });
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
