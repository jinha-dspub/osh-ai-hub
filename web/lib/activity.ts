export const visitorCookie = "osh-visitor";
export const visitorPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ActivitySummary = {
  startedAt: string;
  updatedAt: string;
  activeBrowsers: number;
  totalVisits: number;
  totalBrowsers: number;
  todayVisits: number;
  registeredUsers: number;
  activeUsers: { id: string; email: string; name: string; lastSeen: string }[];
  recentLogins: { id: string; email: string; name: string; lastSignIn: string }[];
  daily: { day: string; visits: number }[];
};
