import type { Metadata } from "next";

/**
 * Segment metadata.
 *
 * Exists only to set the browser tab title. Every page in the panel is a
 * client component and cannot export metadata itself, so each segment gets a
 * server layout that does nothing else — an operator with six tabs open should
 * be able to tell them apart without clicking through.
 */
export const metadata: Metadata = {
  title: "Audit log",
  description: "Who did what.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
