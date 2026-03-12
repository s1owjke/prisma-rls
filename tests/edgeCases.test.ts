import { describe, expect, test } from "vitest";

import { executeAndRollback, resolveDb } from "./utils";

describe("edge cases", () => {
  test("if undefined passed in nested operation it handle gracefully", async () => {
    const db = resolveDb({ Post: { update: { id: 1 } } });

    await executeAndRollback(db, async (tx) => {
      const user = tx.post.update({ where: { id: 1 }, data: { published: false, comments: undefined } });
      await expect(user).resolves.toMatchObject({ id: 1 });
    });
  });
});
