// Kept as the entry point the CommonJS layer already requires. The pool itself
// moved to config/pool.js so the TypeScript side can share the same object
// rather than building a second one.
const { pool } = require('./pool');

module.exports = { pool };
