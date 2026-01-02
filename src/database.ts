import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase(): Promise<void> {
  try {
    console.log("Connecting to MongoDB...");

    await mongoose.connect(env.MONGODB_URI, {
      // Connection options
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log("✅ MongoDB connected successfully");

    // Handle connection events
    mongoose.connection.on("error", (error) => {
      console.error("MongoDB connection error:", error);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected");
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      try {
        await mongoose.connection.close();
        console.log("MongoDB connection closed through app termination");
        process.exit(0);
      }
      catch (error) {
        console.error("Error closing MongoDB connection:", error);
        process.exit(1);
      }
    });
  }
  catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}
