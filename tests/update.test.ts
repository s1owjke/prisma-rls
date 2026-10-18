import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { describe, expect, test } from "vitest";

import { AuthorizationError } from "../src";
import { executeAndRollback, resolveDb } from "./utils";

describe("model updating", () => {
  describe("composite primary key", () => {
    test("rejects update when permission is denied", async () => {
      const db = await resolveDb();

      await executeAndRollback(db, async (tx) => {
        await expect(tx.membership.update({ where: { tenantId_userId: { tenantId: 1, userId: 1 } }, data: { role: "owner" } })).rejects.toThrowError(
          AuthorizationError,
        );
      });
    });

    test.each([true, { tenantId: 1 }])("updates only the selected record when update permission is %j", async (permission) => {
      const db = await resolveDb({ Membership: { read: true, update: permission } });

      await executeAndRollback(db, async (tx) => {
        await expect(tx.membership.update({ where: { tenantId_userId: { tenantId: 1, userId: 1 } }, data: { role: "owner" } })).resolves.toEqual({
          tenantId: 1,
          userId: 1,
          role: "owner",
        });
        await expect(tx.membership.findMany({ orderBy: [{ tenantId: "asc" }, { userId: "asc" }] })).resolves.toEqual([
          { tenantId: 1, userId: 1, role: "owner" },
          { tenantId: 1, userId: 2, role: "member" },
          { tenantId: 2, userId: 1, role: "member" },
        ]);
      });
    });

    test("rejects update when the record does not match the permission filter", async () => {
      const db = await resolveDb({ Membership: { update: { tenantId: 2 } } });

      await executeAndRollback(db, async (tx) => {
        await expect(tx.membership.update({ where: { tenantId_userId: { tenantId: 1, userId: 1 } }, data: { role: "owner" } })).rejects.toMatchObject(
          { code: "P2025" },
        );
      });
    });

    test("preserves additional caller filters when updating by composite key", async () => {
      const db = await resolveDb({ Membership: { update: { tenantId: 1 } } });

      await executeAndRollback(db, async (tx) => {
        await expect(
          tx.membership.update({ where: { tenantId_userId: { tenantId: 1, userId: 1 }, role: "member" }, data: { role: "owner" } }),
        ).rejects.toMatchObject({ code: "P2025" });
      });
    });

    test("updateMany applies the permission filter to models without a scalar id", async () => {
      const db = await resolveDb({ Membership: { read: true, update: { tenantId: 1 } } });

      await executeAndRollback(db, async (tx) => {
        await expect(tx.membership.updateMany({ where: { userId: 1 }, data: { role: "owner" } })).resolves.toEqual({ count: 1 });
        await expect(tx.membership.findMany({ orderBy: [{ tenantId: "asc" }, { userId: "asc" }] })).resolves.toEqual([
          { tenantId: 1, userId: 1, role: "owner" },
          { tenantId: 1, userId: 2, role: "member" },
          { tenantId: 2, userId: 1, role: "member" },
        ]);
      });
    });

    test("upsert updates an existing composite key when it matches the permission filter", async () => {
      const db = await resolveDb({ Membership: { create: true, update: { tenantId: 1 } }, User: { read: { id: 1 } } });

      await executeAndRollback(db, async (tx) => {
        await expect(
          tx.membership.upsert({
            where: { tenantId_userId: { tenantId: 1, userId: 1 } },
            create: { tenantId: 1, role: "member", user: { connect: { id: 1 } } },
            update: { role: "owner" },
          }),
        ).resolves.toEqual({ tenantId: 1, userId: 1, role: "owner" });
      });
    });

    test("upsert creates a record when the composite key does not exist", async () => {
      const db = await resolveDb({ Membership: { create: true, update: { tenantId: 1 } }, User: { read: { id: 3 } } });

      await executeAndRollback(db, async (tx) => {
        await expect(
          tx.membership.upsert({
            where: { tenantId_userId: { tenantId: 1, userId: 3 } },
            create: { tenantId: 1, role: "member", user: { connect: { id: 3 } } },
            update: { role: "owner" },
          }),
        ).resolves.toEqual({ tenantId: 1, userId: 3, role: "member" });
      });
    });
  });

  describe("update", () => {
    test("if update is denied it throw an error", async () => {
      const db = await resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.update({ where: { id: 1 }, data: { published: false } });
        await expect(user).rejects.toThrowError(AuthorizationError);
      });
    });

    test("if update is allowed it allows to update", async () => {
      const db = await resolveDb({ Post: { update: true } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.update({ where: { id: 1 }, data: { published: false } });
        await expect(user).resolves.toMatchObject({ id: 1, published: false });
      });
    });

    test("if update is where it allows to update only records that match the filter", async () => {
      const db = await resolveDb({ Post: { update: { published: false } } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.update({ where: { id: 1 }, data: { published: false } });
        await expect(user).rejects.toThrowError(PrismaClientKnownRequestError);
      });
    });
  });

  describe("update many", () => {
    test("if update is denied it throw an error", async () => {
      const db = await resolveDb();

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.updateMany({ where: { id: { equals: 1 } }, data: { published: { set: false } } });
        await expect(user).rejects.toThrowError(AuthorizationError);
      });
    });

    test("if update is allowed it allows to update", async () => {
      const db = await resolveDb({ Post: { update: true } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.updateMany({ where: { id: 1 }, data: { published: false } });
        await expect(user).resolves.toMatchObject({ count: 1 });
      });
    });

    test("if update is where it allows to update only records that match the filter", async () => {
      const db = await resolveDb({ Post: { update: { published: false } } });

      await executeAndRollback(db, async (tx) => {
        const user = tx.post.updateMany({ where: { id: 1 }, data: { published: false } });
        await expect(user).resolves.toMatchObject({ count: 0 });
      });
    });
  });
});
