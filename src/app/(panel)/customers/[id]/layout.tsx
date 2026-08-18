import type { Metadata } from "next";

/**
 * Segment metadata.
 *
 * The name cannot be in the title — this is a server layout and the customer is
 * only known after the client fetches them.
 */
export const metadata: Metadata = {
  title: "Customer",
  description: "One customer, with their order and wallet history.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
