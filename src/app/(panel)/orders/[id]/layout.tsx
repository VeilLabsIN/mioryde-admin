import type { Metadata } from "next";

/**
 * Segment metadata.
 *
 * The title cannot carry the order code — this is a server layout and the code
 * is only known after the client fetches it. "Delivery" plus the browser's URL
 * is still enough to tell two tabs apart, which is what this is for.
 */
export const metadata: Metadata = {
  title: "Delivery",
  description: "One delivery, with its full history.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
