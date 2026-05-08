import webpush from "web-push";

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BCluA8qIlO8oqgU9Bs7u7DowU63dUH-KThu7HhCuc59aXuyi7D-fJjjJvYVoy_Hlo_l6936I_zggUuVbjmPMwJs";

const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = "mailto:digest@gawk.dev";

export function configureWebPush() {
  if (!VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

export { webpush };
