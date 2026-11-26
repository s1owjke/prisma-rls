import { describe, expect, test } from "vitest";

import { ReferentialIntegrityError } from "../src";
import { resolveDb } from "./utils";

describe("model nested reading", () => {
  describe("2nd level required belongs to", () => {
    const options = { checkRequiredBelongsTo: true };

    test("if read is denied it throws an error", async () => {
      const db = await resolveDb({ Post: { read: true } }, options);
      const posts = db.post.findMany({ select: { id: true, category: { select: { id: true } } } });
      await expect(posts).rejects.toThrowError(ReferentialIntegrityError);
    });

    test("if read is allowed it return all relations", async () => {
      const db = await resolveDb({ Category: { read: true }, Post: { read: true } }, options);
      const posts = db.post.findMany({ select: { id: true, category: { select: { id: true } } } });
      await expect(posts).resolves.toMatchObject([
        { id: 1, category: { id: 1 } },
        { id: 2, category: { id: 1 } },
        { id: 3, category: { id: 2 } },
      ]);
    });

    test("if read is where it throws an error if some items are not allowed by policy", async () => {
      const db = await resolveDb({ Category: { read: { name: { not: { equals: "Second" } } } }, Post: { read: true } }, options);
      const posts = db.post.findMany({ select: { id: true, category: { select: { id: true } } } });
      await expect(posts).rejects.toThrowError(ReferentialIntegrityError);
    });

    test("if read is where it return filtered result", async () => {
      const db = await resolveDb({ Category: { read: { name: { not: { equals: "Fourth" } } } }, Post: { read: true } }, options);
      const posts = db.post.findMany({ select: { id: true, category: { select: { id: true } } } });
      await expect(posts).resolves.toMatchObject([
        { id: 1, category: { id: 1 } },
        { id: 2, category: { id: 1 } },
        { id: 3, category: { id: 2 } },
      ]);
    });
  });

  describe("required belongs to with composite primary key", () => {
    const options = { checkRequiredBelongsTo: true };
    const select = { id: true, membership: { select: { tenantId: true, userId: true } } };

    test("if read is denied it throws an error", async () => {
      const db = await resolveDb({ Assignment: { read: true } }, options);
      const assignments = db.assignment.findMany({ select });
      await expect(assignments).rejects.toThrowError(ReferentialIntegrityError);
    });

    test("if read is where it throws an error if some items are not allowed by policy", async () => {
      const db = await resolveDb({ Assignment: { read: true }, Membership: { read: { tenantId: 1 } } }, options);
      const assignments = db.assignment.findMany({ select });
      await expect(assignments).rejects.toThrowError(ReferentialIntegrityError);
    });

    test("if read is where it compares the whole key, not a single key field", async () => {
      // tenantId 1 alone matches allowed memberships, but (tenantId 1, userId 2) is not allowed
      const db = await resolveDb({ Assignment: { read: { tenantId: 1 } }, Membership: { read: { userId: 1 } } }, options);
      const assignments = db.assignment.findMany({ select });
      await expect(assignments).rejects.toThrowError(ReferentialIntegrityError);
    });

    test("if read is where it returns filtered result", async () => {
      const db = await resolveDb({ Assignment: { read: { tenantId: 1 } }, Membership: { read: { tenantId: 1 } } }, options);
      const assignments = db.assignment.findMany({ select, orderBy: { id: "asc" } });
      await expect(assignments).resolves.toEqual([
        { id: 1, membership: { tenantId: 1, userId: 1 } },
        { id: 2, membership: { tenantId: 1, userId: 2 } },
      ]);
    });

    test("it requires all primary key fields to be selected", async () => {
      const db = await resolveDb({ Assignment: { read: true }, Membership: { read: { tenantId: 1 } } }, options);
      const assignments = db.assignment.findMany({ select: { id: true, membership: { select: { tenantId: true } } } });
      await expect(assignments).rejects.toThrowError("You must select a primary key or other unique field");
    });
  });

  describe("has many relation with composite primary key", () => {
    test("if read is denied it returns empty relations", async () => {
      const db = await resolveDb({ User: { read: true } });
      const users = db.user.findMany({ select: { id: true, memberships: true }, orderBy: { id: "asc" } });
      await expect(users).resolves.toEqual([
        { id: 1, memberships: [] },
        { id: 2, memberships: [] },
        { id: 3, memberships: [] },
      ]);
    });
  });
});
