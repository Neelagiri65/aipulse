import { configureWebPush, webpush } from "./vapid";
import { getAllPushRecords, removePushSubscription, toWebPushSubscription } from "./store";
import { selectRecipients } from "./target";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** The tool this alert is about, when it is about one. Drives targeting. */
  toolId?: string;
};

export type BroadcastResult = {
  sent: number;
  failed: number;
  removed: number;
  /** Subscriptions that asked only for other tools. */
  skipped: number;
};

/**
 * Send one payload to every subscription that wants it. A payload with a
 * known `toolId` goes only to records whose stack includes that tool (or
 * that carry no stack); anything else goes to everyone — see target.ts.
 */
export async function broadcastPush(payload: PushPayload): Promise<BroadcastResult> {
  if (!configureWebPush()) {
    return { sent: 0, failed: 0, removed: 0, skipped: 0 };
  }

  const records = await getAllPushRecords();
  if (records.length === 0) return { sent: 0, failed: 0, removed: 0, skipped: 0 };

  const targets = selectRecipients(records, payload.toolId);
  const skipped = records.length - targets.length;
  if (targets.length === 0) return { sent: 0, failed: 0, removed: 0, skipped };

  const data = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let removed = 0;

  const results = await Promise.allSettled(
    targets.map((rec) => webpush.sendNotification(toWebPushSubscription(rec), data)),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      sent++;
    } else {
      failed++;
      const err = result.reason;
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await removePushSubscription(targets[i].endpoint);
        removed++;
      }
    }
  }

  return { sent, failed, removed, skipped };
}
