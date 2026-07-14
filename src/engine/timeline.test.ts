import { describe, expect, it, vi } from "vitest";
import { linear } from "./easing";
import {
  AnimationTimeline,
  type FrameScheduler,
  type TimelineSnapshot,
} from "./timeline";

class TestScheduler implements FrameScheduler {
  time = 0;
  private nextHandle = 1;
  private readonly frames = new Map<number, FrameRequestCallback>();

  now() {
    return this.time;
  }

  request(callback: FrameRequestCallback) {
    const handle = this.nextHandle++;
    this.frames.set(handle, callback);
    return handle;
  }

  cancel(handle: number) {
    this.frames.delete(handle);
  }

  advance(milliseconds: number) {
    this.time += milliseconds;
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    callbacks.forEach((callback) => callback(this.time));
  }

  get pendingFrames() {
    return this.frames.size;
  }
}

describe("AnimationTimeline", () => {
  it("requests frames only while playing and finishes deterministically", () => {
    const scheduler = new TestScheduler();
    const timeline = new AnimationTimeline({
      scheduler,
      duration: 1_000,
      initialProgress: 0,
      easing: linear,
    });
    const snapshots: TimelineSnapshot[] = [];
    timeline.subscribe((snapshot) => snapshots.push(snapshot));

    expect(scheduler.pendingFrames).toBe(0);
    timeline.play();
    expect(scheduler.pendingFrames).toBe(1);

    scheduler.advance(400);
    expect(timeline.getSnapshot().progress).toBeCloseTo(0.4);
    expect(scheduler.pendingFrames).toBe(1);

    scheduler.advance(600);
    expect(timeline.getSnapshot()).toMatchObject({
      progress: 1,
      state: "complete",
    });
    expect(scheduler.pendingFrames).toBe(0);
    expect(snapshots.at(-1)?.state).toBe("complete");
  });

  it("cancels the scheduled frame when paused and resumes from the same progress", () => {
    const scheduler = new TestScheduler();
    const timeline = new AnimationTimeline({
      scheduler,
      duration: 1_000,
      initialProgress: 0,
    });

    timeline.play();
    scheduler.advance(250);
    timeline.pause();
    expect(timeline.getSnapshot()).toMatchObject({
      progress: 0.25,
      state: "paused",
    });
    expect(scheduler.pendingFrames).toBe(0);

    scheduler.advance(500);
    expect(timeline.getSnapshot().progress).toBe(0.25);
    timeline.play();
    scheduler.advance(250);
    expect(timeline.getSnapshot().progress).toBeCloseTo(0.5);
  });

  it("scrubs without scheduling and honors playback speed", () => {
    const scheduler = new TestScheduler();
    const timeline = new AnimationTimeline({
      scheduler,
      duration: 1_000,
      initialProgress: 0,
    });

    timeline.seek(0.2);
    expect(timeline.getSnapshot()).toMatchObject({
      progress: 0.2,
      state: "paused",
    });
    expect(scheduler.pendingFrames).toBe(0);

    timeline.setSpeed(2);
    timeline.play();
    scheduler.advance(200);
    expect(timeline.getSnapshot().progress).toBeCloseTo(0.6);
  });

  it("jumps to the end without requesting a frame when motion is reduced", () => {
    const scheduler = new TestScheduler();
    const listener = vi.fn();
    const timeline = new AnimationTimeline({
      scheduler,
      initialProgress: 0,
      reducedMotion: true,
    });
    timeline.subscribe(listener);

    timeline.play();
    expect(timeline.getSnapshot()).toMatchObject({
      progress: 1,
      state: "complete",
    });
    expect(scheduler.pendingFrames).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
