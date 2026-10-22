(async()=>{
const { PGlite } = require("@electric-sql/pglite");
const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");
const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 54777, host: "127.0.0.1", maxConnections: 20 });
await server.start(); console.log("pg up");
})();
