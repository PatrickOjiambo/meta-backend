import { env } from "../env.js";
import { AdminNonce } from "../models/index.js";

export class NonceManager {
  private static instance: NonceManager;
  private lockMap = new Map<string, Promise<number>>();

  private constructor() {}

  static getInstance(): NonceManager {
    if (!NonceManager.instance) {
      NonceManager.instance = new NonceManager();
    }
    return NonceManager.instance;
  }

  /**
   * Get the next available nonce for the admin account
   * This method is thread-safe and prevents nonce collisions
   */
  async getNextNonce(publicKey: string = env.ADMIN_PUBLIC_KEY): Promise<number> {
    // If there's already a pending nonce request for this key, wait for it
    const existingLock = this.lockMap.get(publicKey);
    if (existingLock) {
      await existingLock;
    }

    // Create a new lock
    const lockPromise = this.fetchAndIncrementNonce(publicKey);
    this.lockMap.set(publicKey, lockPromise);

    try {
      const nonce = await lockPromise;
      return nonce;
    }
    finally {
      this.lockMap.delete(publicKey);
    }
  }

  private async fetchAndIncrementNonce(publicKey: string): Promise<number> {
    // Use MongoDB's findOneAndUpdate with $inc for atomic increment
    const result = await AdminNonce.findOneAndUpdate(
      { public_key: publicKey },
      {
        $inc: { current_nonce: 1 },
        $set: { last_used_at: new Date() },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    return result.current_nonce;
  }

  /**
   * Initialize or reset the nonce for an account
   * Use this carefully - typically only during setup
   */
  async initializeNonce(publicKey: string, startingNonce: number = 0): Promise<void> {
    await AdminNonce.findOneAndUpdate(
      { public_key: publicKey },
      {
        $set: {
          current_nonce: startingNonce,
          last_used_at: new Date(),
        },
      },
      { upsert: true },
    );
  }

  /**
   * Get the current nonce without incrementing
   */
  async getCurrentNonce(publicKey: string): Promise<number> {
    const record = await AdminNonce.findOne({ public_key: publicKey });
    return record?.current_nonce ?? 0;
  }
}

export const nonceManager = NonceManager.getInstance();
