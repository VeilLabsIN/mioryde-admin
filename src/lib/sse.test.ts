import { describe, expect, it } from "vitest";
import { frameToEvent, takeFrames } from "./sse";

describe("takeFrames", () => {
  it("takes a single complete frame", () => {
    const { frames, rest } = takeFrames("event: a\ndata: {}\n\n");
    expect(frames).toEqual(["event: a\ndata: {}"]);
    expect(rest).toBe("");
  });

  it("takes several frames from one chunk", () => {
    // A busy moment delivers more than one event per read.
    const { frames, rest } = takeFrames(
      "data: {\"n\":1}\n\ndata: {\"n\":2}\n\ndata: {\"n\":3}\n\n",
    );
    expect(frames).toHaveLength(3);
    expect(rest).toBe("");
  });

  it("keeps a partial frame for the next read", () => {
    // The bug this exists for. Chunks do not align to frames.
    const { frames, rest } = takeFrames("data: {\"n\":1}\n\ndata: {\"n\":2}");
    expect(frames).toEqual(['data: {"n":1}']);
    expect(rest).toBe('data: {"n":2}');
  });

  it("reassembles a frame split across two chunks", () => {
    const first = takeFrames('data: {"or');
    expect(first.frames).toHaveLength(0);

    const second = takeFrames(first.rest + 'derId":"abc"}\n\n');
    expect(second.frames).toHaveLength(1);
    expect(frameToEvent<{ orderId: string }>(second.frames[0]!)).toEqual({
      orderId: "abc",
    });
  });

  it("survives a boundary split down the middle", () => {
    // The nastiest case: the blank line itself arrives across two reads, so
    // neither chunk contains "\n\n".
    const first = takeFrames('data: {"n":1}\n');
    expect(first.frames).toHaveLength(0);

    const second = takeFrames(first.rest + '\ndata: {"n":2}\n\n');
    expect(second.frames).toHaveLength(2);
  });

  it("returns nothing for an empty buffer", () => {
    expect(takeFrames("")).toEqual({ frames: [], rest: "" });
  });
});

describe("frameToEvent", () => {
  it("reads the data line", () => {
    expect(frameToEvent('event: order.placed\ndata: {"topic":"order.placed"}'))
      .toEqual({ topic: "order.placed" });
  });

  it("ignores a keep-alive comment", () => {
    // `: ping` is not an event. Rendering it would put blank rows on the board.
    expect(frameToEvent(": ping")).toBeNull();
    expect(frameToEvent(": connected")).toBeNull();
  });

  it("returns null on malformed JSON rather than throwing", () => {
    // One bad frame must not take down a stream an operator is watching.
    expect(frameToEvent("data: {not json")).toBeNull();
  });
});
