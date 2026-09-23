import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/**
 * A22. An empty panel that says only "No data yet" tells an operator nothing
 * they could not see for themselves.
 *
 * The audit described these as "across most panels". They were not — most
 * already carried a hint and three did not. This pins all three and stops a
 * fourth appearing.
 */
describe("every empty state says what would fill it", () => {
  it("leaves none of them bare", () => {
    const bare: string[] = [];

    for (const file of globSync("**/*.tsx", { cwd: SRC })) {
      // The component's own definition, which is where `hint` is declared.
      if (file.endsWith("ui.tsx")) continue;
      for (const match of read(file).matchAll(/<EmptyState\b[\s\S]{0,400}?\/>/g)) {
        if (!match[0].includes("hint")) {
          bare.push(`${file}: ${match[0].split("\n")[0]!.trim()}`);
        }
      }
    }

    expect(bare).toEqual([]);
  });
});

describe("the hints that have somewhere to send you", () => {
  const analytics = read("app/(panel)/analytics/page.tsx");

  it("sends an empty partner table at the deliveries queue", () => {
    expect(analytics).toContain("Nobody delivered in this period");
    expect(analytics).toContain('<Link href="/orders"');
  });

  it("explains what actually moves the ledger", () => {
    // "No postings" is arithmetic, not a fault. Saying which events produce
    // one is the difference between a dead panel and an answer.
    expect(analytics).toContain("The ledger moves when an order is paid for");
    expect(analytics).toContain('<Link href="/payments"');
    expect(analytics).toContain('<Link href="/payouts"');
  });

  it("lets a hint carry a link at all", () => {
    expect(read("components/ui.tsx")).toContain("hint?: React.ReactNode;");
  });
});
