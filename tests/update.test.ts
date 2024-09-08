import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { executeAndRollback, resolveDb } from "./utils";

describe("model updating", () => {
  describe("update", () => {
    test("if update is denied it throw an error", async () => {
      const db = resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.update({ where: { id: 1 }, data: { published: false } });
        await expect(user).rejects.toThrowError("Not authorized");
      });
    });

    test("if update is allowed it allows to update", async () => {
      const db = resolveDb({ Post: { update: true } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.update({ where: { id: 1 }, data: { published: false } });
        await expect(user).resolves.toMatchObject({ id: 1, published: false });
      });
    });

    test("if update is where it allows to update only records that match the filter", async () => {
      const db = resolveDb({ Post: { update: { published: false } } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.update({ where: { id: 1 }, data: { published: false } });
        await expect(user).rejects.toThrowError(PrismaClientKnownRequestError);
      });
    });
  });

  describe("update many", () => {
    test("if update is denied it throw an error", async () => {
      const db = resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.updateMany({ where: { id: { equals: 1 } }, data: { published: { set: false } } });
        await expect(user).rejects.toThrowError("Not authorized");
      });
    });

    test("if update is allowed it allows to update", async () => {
      const db = resolveDb({ Post: { update: true } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.updateMany({ where: { id: 1 }, data: { published: false } });
        await expect(user).resolves.toMatchObject({ count: 1 });
      });
    });

    test("if update is where it allows to update only records that match the filter", async () => {
      const db = resolveDb({ Post: { update: { published: false } } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.updateMany({ where: { id: 1 }, data: { published: false } });
        await expect(user).resolves.toMatchObject({ count: 0 });
      });
    });
  });
});
