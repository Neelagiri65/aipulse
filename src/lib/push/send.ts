import { configureWebPush, webpush } from "./vapid";
import { getAllPushSubscriptions, removePushSubscription } from "./store";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function broadcastPush(
  payload: PushPayload,
): Promise<{ sent: number; failed: number; removed: number }> {
  if (!configureWebPush()) {
    return { sent: 0, failed: 0, removed: 0 };
  }

  const subs = await getAllPushSubscriptions();
  if (subs.length === 0) return { sent: 0, failed: 0, removed: 0 };

  const data = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let removed = 0;

  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(sub, data)),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      sent++;
    } else {
      failed++;
      const err = result.reason;
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await removePushSubscription(subs[i].endpoint);
        removed++;
      }
    }
  }

  return { sent, failed, removed };
}
