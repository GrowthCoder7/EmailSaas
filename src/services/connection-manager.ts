import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { type ImapConfig, EmailSchema } from "../types/email.schema.js" 

// 1. EXTENDED SESSION STATE
// We need to track 'lastKnownCount' to calculate the diff when new mail arrives.
interface ConnectionSession {
    client: ImapFlow;
    lastActive: number;      // For timeout/cleanup
    lastKnownCount: number;  // For range fetching
    userId: string;
}

const activeConnections = new Map<string, ConnectionSession>();

export class ConnectionManager {

    /**
     * Entry Point: Called by your API when the frontend sends a heartbeat.
     */
    static async handleHeartBeat(userId: string, config: ImapConfig) {
        
        // CASE A: Connection exists. Just refresh the timer.
        if (activeConnections.has(userId)) {
            const session = activeConnections.get(userId)!;
            session.lastActive = Date.now();
            return;
        }

        // CASE B: New Connection needed.
        console.log(`[${userId}] initializing Real-Time connection...`);
        await this.startSession(userId, config);
    }

    /**
     * Internal: Handles the complex connection setup and event binding.
     */
    private static async startSession(userId: string, config: ImapConfig) {
        const client = new ImapFlow({
            host: config.provider === 'gmail' ? 'imap.gmail.com' : 'outlook.office365.com',
            port: 993,
            secure: true,
            auth: {
                user: config.userEmail,
                accessToken: config.accessToken,
            },
            logger: false, // Set to true if you need to debug raw IMAP
            emitLogs: false,
        });

        try {
            // 1. Connect
            await client.connect();

            // 2. Open Inbox (Critical step!)
            const lock = await client.getMailboxLock('INBOX');
            
            // 3. Get Initial State
            // We need the current count so we know where to start watching.
            const status = await client.status('INBOX', { messages: true });
            let currentCount = status.messages || 0;

            // 4. Create Session Object IMMEDIATELY
            const session: ConnectionSession = {
                client,
                lastActive: Date.now(),
                lastKnownCount: currentCount,
                userId
            };
            activeConnections.set(userId, session);

            // 5. Setup Event Listener: The "Pro" Fetch Logic
            client.on('exists', async (data) => {
                const newTotal = data.count;
                const prevTotal = session.lastKnownCount;

                console.log(`[${userId}] 🔔 Change Detected. Old: ${prevTotal}, New: ${newTotal}`);

                if (newTotal > prevTotal) {
                    // Calculate Range: e.g., if we had 100, and now 105, fetch "101:105"
                    const fetchRange = `${prevTotal + 1}:${newTotal}`;
                    await ConnectionManager.fetchAndProcessEmails(client, fetchRange, userId);
                    
                    // Update our local state
                    session.lastKnownCount = newTotal;
                }
            });

            // 6. Handle "Close" (Server kicks us off)
            client.on('close', () => {
                console.warn(`[${userId}] Connection closed by server.`);
                activeConnections.delete(userId);
                lock.release(); // Always release lock
            });

            // 7. Start IDLE (The heartbeat of IMAP)
            await client.idle();

        } catch (err) {
            console.error(`[${userId}] Connection Error:`, err);
            // Ensure we don't leave a ghost key in the map
            activeConnections.delete(userId);
        }
    }

    /**
     * Helper: Fetches a range of emails, parses them, and logs them.
     * This is separated so it can be re-used by the Polling Worker if needed.
     */
    static async fetchAndProcessEmails(client: ImapFlow, range: string, userId: string) {
        try {
            // fetch() returns an async generator
            for await (const message of client.fetch(range, { source: true, uid: true, envelope: true })) {
                
                // 1. Parse Raw Source
                if (!message.source) {
                    console.warn(`[${userId}] Message ${message.uid} has no source data. Skipping.`);
                    continue;
                }

                const parsed = await simpleParser(message.source);

                // 2. Validate & Sanitize (Zod)
                // Note: We use 'safeParse' so one bad email doesn't crash the loop
                const emailData = EmailSchema.safeParse({
                    id: crypto.randomUUID(),
                    uid: message.uid,
                    seq: message.seq,
                    subject: parsed.subject,
                    from: parsed.from?.text,
                    bodyText: parsed.text || "", // The AI payload
                    bodyHtml: parsed.html,
                    receivedAt: parsed.date || new Date(),
                });

                if (emailData.success) {
                    console.log(`[${userId}] ✅ Processed: "${emailData.data.subject}"`);
                    
                    // TODO: ------------------------------------------------------
                    // INSERT NEXT STEP HERE:
                    // await VectorDB.save(emailData.data);
                    // ------------------------------------------------------------
                } else {
                    console.warn(`[${userId}] ⚠️ Validation Failed for UID ${message.uid}`, emailData.error);
                }
            }
        } catch (error) {
            console.error(`[${userId}] Fetch Error during range ${range}:`, error);
        }
    }

    /**
     * The Garbage Collector
     * Run this via setInterval inside your main `index.ts`
     */
    static async cleanup() {
        const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
        const now = Date.now();

        for (const [userId, session] of activeConnections) {
            if ((now - session.lastActive) > TIMEOUT_MS) {
                console.log(`[${userId}] 💤 Idle Timeout. Disconnecting...`);
                
                try {
                    // Stop listening to avoid errors during logout
                    session.client.removeAllListeners();
                    
                    // Polite logout
                    await session.client.logout();
                } catch (e) {
                    // Force close if network is already dead
                    session.client.close();
                } finally {
                    activeConnections.delete(userId);
                }
            }
        }
    }
}