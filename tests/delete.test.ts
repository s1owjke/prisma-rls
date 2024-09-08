import { executeAndRollback, resolveDb } from "./utils";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

describe("model deletion", () => {
  describe("delete", () => {
    test("if delete is denied it throw an error", async () => {
      const db = resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.delete({ where: { id: 1 } });
        await expect(user).rejects.toThrowError("Not authorized");
      });
    });

    test("if delete is allowed it allows to delete", async () => {
      const db = resolveDb({ Post: { delete: true } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.delete({ where: { id: 1 } });
        await expect(user).resolves.toMatchObject({ id: 1 });
      });
    });

    test("if delete is where it allows to delete only records that match the filter", async () => {
      const db = resolveDb({ Post: { delete: { published: false } } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.delete({ where: { id: 1 } });
        await expect(user).rejects.toThrowError(PrismaClientKnownRequestError);
      });
    });
  });

  describe("delete many", () => {
    test("if delete is denied it throw an error", async () => {
      const db = resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.deleteMany({ where: { id: { equals: 1 } } });
        await expect(user).rejects.toThrowError("Not authorized");
      });
    });

    test("if delete is allowed it allows to delete", async () => {
      const db = resolveDb({ Post: { delete: true } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.deleteMany({ where: { id: 1 } });
        await expect(user).resolves.toMatchObject({ count: 1 });
      });
    });

    test("if delete is where it allows to delete only records that match the filter", async () => {
      const db = resolveDb({ Post: { delete: { published: false } } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.deleteMany({ where: { id: 1 } });
        await expect(user).resolves.toMatchObject({ count: 0 });
      });
    });
  });
});
