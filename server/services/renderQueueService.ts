import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { CLIPS_DIR } from "./types.ts";

export interface QueueStatusUpdate {
  queued: boolean;
  position: number;
  queueLength: number;
  activeLabel: string | null;
}

interface QueuedEntry {
  id: string;
  label: string;
  onStatus?: (status: QueueStatusUpdate) => void;
  execute: () => void;
}

const renderQueueContext = new AsyncLocalStorage<{ taskId: string }>();

const pendingQueue: QueuedEntry[] = [];
let activeTask: { id: string; label: string; startedAt: number } | null = null;
let jobCounter = 0;

function notifyWaitingPositions(): void {
  pendingQueue.forEach((entry, index) => {
    entry.onStatus?.({
      queued: true,
      position: index + 1,
      queueLength: pendingQueue.length + (activeTask ? 1 : 0),
      activeLabel: activeTask?.label || null,
    });
  });
}

function pumpQueue(): void {
  if (activeTask || pendingQueue.length === 0) return;
  const next = pendingQueue.shift();
  if (!next) return;

  activeTask = {
    id: next.id,
    label: next.label,
    startedAt: Date.now(),
  };

  next.onStatus?.({
    queued: false,
    position: 0,
    queueLength: pendingQueue.length + 1,
    activeLabel: next.label,
  });

  notifyWaitingPositions();
  next.execute();
}

export function getRenderQueueSnapshot(): {
  active: boolean;
  activeLabel: string | null;
  waitingCount: number;
  totalInPipeline: number;
} {
  return {
    active: Boolean(activeTask),
    activeLabel: activeTask?.label || null,
    waitingCount: pendingQueue.length,
    totalInPipeline: pendingQueue.length + (activeTask ? 1 : 0),
  };
}

/**
 * Executes heavy media extraction & FFmpeg rendering tasks strictly one at a time
 * (Concurrency = 1) to prevent 512MB RAM OOM crashes on free-tier hosting.
 * Uses AsyncLocalStorage so nested helper calls within the same queued task never deadlock.
 */
export function enqueueRenderTask<T>(options: {
  label: string;
  onStatus?: (status: QueueStatusUpdate) => void;
  run: () => Promise<T>;
}): Promise<T> {
  const existingCtx = renderQueueContext.getStore();
  if (existingCtx) {
    return options.run();
  }

  jobCounter += 1;
  const taskId = `rq_${Date.now().toString(36)}_${jobCounter}`;

  return new Promise<T>((resolve, reject) => {
    const startImmediately = () => {
      renderQueueContext.run({ taskId }, async () => {
        try {
          const result = await options.run();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          if (activeTask?.id === taskId) {
            activeTask = null;
          }
          pumpQueue();
        }
      });
    };

    if (!activeTask && pendingQueue.length === 0) {
      activeTask = {
        id: taskId,
        label: options.label,
        startedAt: Date.now(),
      };
      options.onStatus?.({
        queued: false,
        position: 0,
        queueLength: 1,
        activeLabel: options.label,
      });
      startImmediately();
      return;
    }

    pendingQueue.push({
      id: taskId,
      label: options.label,
      onStatus: options.onStatus,
      execute: startImmediately,
    });
    notifyWaitingPositions();
  });
}

/**
 * Prunes older rendered clip artifacts from disk so ephemeral free-tier storage
 * stays clean without ever deleting the pre-seeded showcase clip.
 */
export function cleanupOldRenderedClips(
  maxUserClips = 18,
  maxAgeMs = 2 * 60 * 60 * 1000
): void {
  try {
    if (!fs.existsSync(CLIPS_DIR)) return;
    const files = fs.readdirSync(CLIPS_DIR);
    const clipBasenames = new Map<string, number>();

    for (const file of files) {
      if (!file.endsWith(".mp4")) continue;
      if (file === "kks_gold_showcase_01.mp4") continue;
      const fullPath = path.join(CLIPS_DIR, file);
      try {
        const stat = fs.statSync(fullPath);
        clipBasenames.set(file.replace(/\.mp4$/, ""), stat.mtimeMs);
      } catch {
        // Ignore unreadable file
      }
    }

    const sorted = Array.from(clipBasenames.entries()).sort((a, b) => b[1] - a[1]);
    const now = Date.now();

    sorted.forEach(([base, mtime], idx) => {
      const tooOld = now - mtime > maxAgeMs;
      const overCap = idx >= maxUserClips;
      if (tooOld || overCap) {
        [".mp4", ".jpg", ".json"].forEach((ext) => {
          const target = path.resolve(CLIPS_DIR, `${base}${ext}`);
          if (target.startsWith(CLIPS_DIR + path.sep) && fs.existsSync(target)) {
            try {
              fs.rmSync(target, { force: true });
            } catch {
              // Ignore cleanup errors
            }
          }
        });
      }
    });
  } catch {
    // Non-fatal disk cleanup
  }
}
