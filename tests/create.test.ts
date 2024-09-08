import { resolveDb, executeAndRollback } from "./utils";

describe("model creating", () => {
  describe("create", () => {
    test("if create is denied it throw an error", async () => {
      const db = resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.user.create({ data: { email: "shawn.hudson@test.local", name: "Shawn Hudson" } });
        await expect(user).rejects.toThrowError("Not authorized");
      });
    });

    test("if create is allowed it allows to create", async () => {
      const db = resolveDb({ User: { create: true } });

      await executeAndRollback(db, async (tx) => {
        const users = tx.user.create({ data: { email: "shawn.hudson@test.local", name: "Shawn Hudson" } });
        await expect(users).resolves.toMatchObject({ email: "shawn.hudson@test.local", name: "Shawn Hudson" });
      });
    });
  });

  describe("create many", () => {
    test("if create is denied it throw an error", async () => {
      const db = resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.user.createMany({ data: { email: "shawn.hudson@test.local", name: "Shawn Hudson" } });
        await expect(user).rejects.toThrowError("Not authorized");
      });
    });

    test("if create is allowed it allows to create", async () => {
      const db = resolveDb({ User: { create: true } });

      await executeAndRollback(db, async (tx) => {
        const users = tx.user.createMany({ data: { email: "shawn.hudson@test.local", name: "Shawn Hudson" } });
        await expect(users).resolves.toMatchObject({ count: 1 });
      });
    });
  });
});
