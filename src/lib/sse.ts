/**
 * Splits a byte-stream buffer into complete SSE frames.
 *
 * Extracted from the stream reader so it can be tested without a network: the
 * bug this guards against is a frame arriving split across two reads, which a
 * live connection produces rarely and unpredictably, and a test produces on
 * demand.
 *
 * Returns the frames that are complete and whatever is left over, which the
 * caller keeps for the next chunk.
 */
export function takeFrames(buffer: string): {
  frames: string[];
  rest: string;
} {
  const frames: string[] = [];
  let rest = buffer;

  let boundary = rest.indexOf("\n\n");
  while (boundary !== -1) {
    frames.push(rest.slice(0, boundary));
    rest = rest.slice(boundary + 2);
    boundary = rest.indexOf("\n\n");
  }

  return { frames, rest };
}

/**
 * The JSON payload of one frame, or null if it carries none.
 *
 * A frame with no `data:` line is a keep-alive comment (`: ping`), which the
 * server sends to stop a proxy closing an idle connection. Those are not
 * events and must not reach the UI.
 */
export function frameToEvent<T>(frame: string): T | null {
  const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine.slice(5).trim()) as T;
  } catch {
    return null;
  }
}
