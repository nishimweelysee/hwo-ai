import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "./api";

const QUEUE_KEY = "hwo_offline_queue";

export type CheckinPayload = { score: number; overtime: number };
export type SwapPayload = { scheduleId: string };
export type SurveyPayload = Record<string, number | string>;

type QueuedAction =
  | { id: string; type: "checkin"; body: CheckinPayload; createdAt: string }
  | { id: string; type: "swap"; body: SwapPayload; createdAt: string }
  | { id: string; type: "survey"; body: SurveyPayload; createdAt: string };

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(actions: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(actions));
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function enqueueCheckin(body: CheckinPayload): Promise<void> {
  const queue = await readQueue();
  queue.push({ id: newId(), type: "checkin", body, createdAt: new Date().toISOString() });
  await writeQueue(queue);
}

export async function enqueueSwap(body: SwapPayload): Promise<void> {
  const queue = await readQueue();
  queue.push({ id: newId(), type: "swap", body, createdAt: new Date().toISOString() });
  await writeQueue(queue);
}

export async function enqueueSurvey(body: SurveyPayload): Promise<void> {
  const queue = await readQueue();
  queue.push({ id: newId(), type: "survey", body, createdAt: new Date().toISOString() });
  await writeQueue(queue);
}

async function executeAction(action: QueuedAction): Promise<void> {
  switch (action.type) {
    case "checkin":
      await apiRequest("/api/mobile/checkin", { method: "POST", body: action.body });
      break;
    case "swap":
      await apiRequest("/api/schedules/swap", { method: "POST", body: action.body });
      break;
    case "survey":
      await apiRequest("/api/mobile/survey", { method: "POST", body: action.body });
      break;
  }
}

export async function getPendingCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function flushOfflineQueue(): Promise<{ processed: number; failed: number }> {
  const queue = await readQueue();
  if (!queue.length) return { processed: 0, failed: 0 };

  const remaining: QueuedAction[] = [];
  let processed = 0;
  let failed = 0;

  for (const action of queue) {
    try {
      await executeAction(action);
      processed++;
    } catch {
      remaining.push(action);
      failed++;
    }
  }

  await writeQueue(remaining);
  return { processed, failed };
}

export async function submitCheckinOrQueue(
  body: CheckinPayload,
  online: boolean
): Promise<"synced" | "queued"> {
  if (!online) {
    await enqueueCheckin(body);
    return "queued";
  }
  await apiRequest("/api/mobile/checkin", { method: "POST", body });
  return "synced";
}

export async function submitSwapOrQueue(
  body: SwapPayload,
  online: boolean
): Promise<"synced" | "queued"> {
  if (!online) {
    await enqueueSwap(body);
    return "queued";
  }
  await apiRequest("/api/schedules/swap", { method: "POST", body });
  return "synced";
}

export async function submitSurveyOrQueue(
  body: SurveyPayload,
  online: boolean
): Promise<"synced" | "queued"> {
  if (!online) {
    await enqueueSurvey(body);
    return "queued";
  }
  await apiRequest("/api/mobile/survey", { method: "POST", body });
  return "synced";
}
