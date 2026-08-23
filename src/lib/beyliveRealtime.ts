import type { SupabaseClient } from "@supabase/supabase-js";

export const BEYLIVE_SYNC_EVENT = "refresh";

export type BeyliveSyncPayload = {
  tournamentId: string;
  matchId?: string;
  reason?: string;
  at: number;
};

export const beyliveSyncTopic = (tournamentId: string) => `beylive-sync-${tournamentId}`;

export async function broadcastBeyliveRefresh(
  client: SupabaseClient | null | undefined,
  tournamentId: string,
  payload: Omit<BeyliveSyncPayload, "tournamentId" | "at"> = {},
) {
  if (!client || !tournamentId) return;

  const topic = beyliveSyncTopic(tournamentId);
  const realtimeTopic = `realtime:${topic}`;
  const existingChannel = client.getChannels().find((channel) => channel.topic === realtimeTopic);
  const channel = existingChannel ?? client.channel(topic);

  try {
    await channel.httpSend(
      BEYLIVE_SYNC_EVENT,
      {
        ...payload,
        tournamentId,
        at: Date.now(),
      },
      { timeout: 1500 },
    );
  } catch {
    /* Postgres realtime listeners and polling fallback still refresh the screens. */
  } finally {
    if (!existingChannel) {
      await client.removeChannel(channel).catch(() => undefined);
    }
  }
}
