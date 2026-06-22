/** Mining schedule configuration. */
export type MiningSchedule = "manual" | "hourly" | "daily" | "weekly";

const MS: Record<Exclude<MiningSchedule, "manual">, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/** Background mining scheduler for long-running processes. */
export class MiningScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastRun: Date | undefined;

  constructor(
    private readonly schedule: MiningSchedule,
    private readonly onRun: () => Promise<void>
  ) {}

  start(): void {
    if (this.schedule === "manual" || this.timer) return;
    const interval = MS[this.schedule];
    this.timer = setInterval(() => {
      void this.runOnce();
    }, interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runOnce(): Promise<void> {
    this.lastRun = new Date();
    await this.onRun();
  }

  getStatus(): { schedule: MiningSchedule; lastRun?: string; running: boolean } {
    return {
      schedule: this.schedule,
      lastRun: this.lastRun?.toISOString(),
      running: this.timer !== undefined,
    };
  }
}

export function scheduleToMs(schedule: MiningSchedule): number | null {
  if (schedule === "manual") return null;
  return MS[schedule];
}
