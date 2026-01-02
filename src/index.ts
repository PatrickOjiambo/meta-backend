import app from "./app.js";
import { connectDatabase } from "./database.js";
import { env } from "./env.js";
import { eventWatcherService } from "./services/index.js";

const port = env.PORT;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Start event watcher
    if (env.NODE_ENV !== "test") {
      await eventWatcherService.start();
    }

    // Start HTTP server
    const server = app.listen(port, () => {
      /* eslint-disable no-console */
      console.log("🏆 Casper Prize Vault API");
      console.log(`🚀 Server: http://localhost:${port}`);
      console.log(`📝 Environment: ${env.NODE_ENV}`);
      console.log(`⛓️  Network: ${env.CASPER_NETWORK_NAME}`);
      /* eslint-enable no-console */
    });

    server.on("error", (err) => {
      if ("code" in err && err.code === "EADDRINUSE") {
        console.error(`Port ${env.PORT} is already in use. Please choose another port or stop the process using it.`);
      }
      else {
        console.error("Failed to start server:", err);
      }
      process.exit(1);
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      console.log("SIGTERM signal received: closing HTTP server");
      eventWatcherService.stop();
      server.close(() => {
        console.log("HTTP server closed");
      });
    });
  }
  catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
