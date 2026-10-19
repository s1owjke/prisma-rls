import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { describe, expect, test } from "vitest";

import { AuthorizationError } from "../src";
import { executeAndRollback, resolveDb } from "./utils";

describe("model deletion", () => {
  describe("delete", () => {
    test("if delete is denied it throw an error", async () => {
      const db = await resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.delete({ where: { id: 1 } });
        await expect(user).rejects.toThrowError(AuthorizationError);
      });
    });

    test("if delete is allowed it allows to delete", async () => {
      const db = await resolveDb({ Post: { delete: true } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.delete({ where: { id: 1 } });
        await expect(user).resolves.toMatchObject({ id: 1 });
      });
    });

    test("if delete is where it allows to delete only records that match the filter", async () => {
      const db = await resolveDb({ Post: { delete: { published: false } } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.delete({ where: { id: 1 } });
        await expect(user).rejects.toThrowError(PrismaClientKnownRequestError);
      });
    });
  });

  describe("delete many", () => {
    test("if delete is denied it throw an error", async () => {
      const db = await resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.deleteMany({ where: { id: { equals: 1 } } });
        await expect(user).rejects.toThrowError(AuthorizationError);
      });
    });

    test("if delete is allowed it allows to delete", async () => {
      const db = await resolveDb({ Post: { delete: true } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.deleteMany({ where: { id: 1 } });
        await expect(user).resolves.toMatchObject({ count: 1 });
      });
    });

    test("if delete is where it allows to delete only records that match the filter", async () => {
      const db = await resolveDb({ Post: { delete: { published: false } } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.deleteMany({ where: { id: 1 } });
        await expect(user).resolves.toMatchObject({ count: 0 });
      });
    });
  });

  describe("composite primary key", () => {
    test.each([true, { tenantId: 1 }])("deletes only the selected record when delete permission is %j", async (permission) => {
      const db = await resolveDb({ Membership: { read: true, delete: permission } });

      await executeAndRollback(db, async (tx) => {
        await expect(tx.membership.delete({ where: { tenantId_userId: { tenantId: 1, userId: 1 } } })).resolves.toEqual({
          tenantId: 1,
          userId: 1,
          role: "admin",
        });
        await expect(tx.membership.findMany({ orderBy: [{ tenantId: "asc" }, { userId: "asc" }] })).resolves.toEqual([
          { tenantId: 1, userId: 2, role: "member" },
          { tenantId: 2, userId: 1, role: "member" },
        ]);
      });
    });

    test("rejects delete when the record does not match the permission filter", async () => {
      const db = await resolveDb({ Membership: { delete: { tenantId: 2 } } });

      await executeAndRollback(db, async (tx) => {
        await expect(tx.membership.delete({ where: { tenantId_userId: { tenantId: 1, userId: 1 } } })).rejects.toMatchObject({
          code: "P2025",
        });
      });
    });

    test("preserves additional caller filters when deleting by composite key", async () => {
      const db = await resolveDb({ Membership: { delete: { tenantId: 1 } } });

      await executeAndRollback(db, async (tx) => {
        await expect(tx.membership.delete({ where: { tenantId_userId: { tenantId: 1, userId: 1 }, role: "member" } })).rejects.toMatchObject({
          code: "P2025",
        });
      });
    });

    test("deleteMany applies the permission filter to models without a scalar id", async () => {
      const db = await resolveDb({ Membership: { read: true, delete: { tenantId: 1 } } });

      await executeAndRollback(db, async (tx) => {
        await expect(tx.membership.deleteMany({ where: { userId: 1 } })).resolves.toEqual({ count: 1 });
        await expect(tx.membership.findMany({ orderBy: [{ tenantId: "asc" }, { userId: "asc" }] })).resolves.toEqual([
          { tenantId: 1, userId: 2, role: "member" },
          { tenantId: 2, userId: 1, role: "member" },
        ]);
      });
    });
  });
});
