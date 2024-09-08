import { resolveDb } from "./utils";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

describe("model reading", () => {
  describe("find unique", () => {
    test("if read is denied it return null", async () => {
      const db = resolveDb();
      const user = db.user.findUnique({ where: { id: 1 } });
      await expect(user).resolves.toEqual(null);
    });

    test("if read is denied it throw an error", async () => {
      const db = resolveDb();
      const user = db.user.findUniqueOrThrow({ where: { id: 1 } });
      await expect(user).rejects.toThrowError(PrismaClientKnownRequestError);
    });

    test("if read is allowed it return all records", async () => {
      const db = resolveDb({ User: { read: true } });
      const user = db.user.findUnique({ where: { id: 1 } });
      await expect(user).resolves.toMatchObject({ id: 1 });
    });

    test("if read is allowed it return all records", async () => {
      const db = resolveDb({ User: { read: true } });
      const user = db.user.findUniqueOrThrow({ where: { id: 1 } });
      await expect(user).resolves.toMatchObject({ id: 1 });
    });

    test("if read is where it return filtered result", async () => {
      const db = resolveDb({ User: { read: { name: { not: { equals: "John Doe" } } } } });
      const user = db.user.findUnique({ where: { id: 1 } });
      await expect(user).resolves.toEqual(null);
    });

    test("if read is where it return filtered result", async () => {
      const db = resolveDb({ User: { read: { name: { not: { equals: "John Doe" } } } } });
      const user = db.user.findUniqueOrThrow({ where: { id: 1 } });
      await expect(user).rejects.toThrowError(PrismaClientKnownRequestError);
    });
  });

  describe("find first", () => {
    test("if read is denied it return null", async () => {
      const db = resolveDb();
      const user = db.user.findFirst({ where: { id: { equals: 1 } } });
      await expect(user).resolves.toEqual(null);
    });

    test("if read is denied it throw error", async () => {
      const db = resolveDb();
      const user = db.user.findFirstOrThrow({ where: { id: { equals: 1 } } });
      await expect(user).rejects.toThrowError(PrismaClientKnownRequestError);
    });

    test("if read is allowed it return all records", async () => {
      const db = resolveDb({ User: { read: true } });
      const user = db.user.findFirst({ where: { id: { equals: 1 } } });
      await expect(user).resolves.toMatchObject({ id: 1 });
    });

    test("if read is allowed it return all records", async () => {
      const db = resolveDb({ User: { read: true } });
      const user = db.user.findFirstOrThrow({ where: { id: { equals: 1 } } });
      await expect(user).resolves.toMatchObject({ id: 1 });
    });

    test("if read is where it return filtered result", async () => {
      const db = resolveDb({ User: { read: { name: { not: { equals: "John Doe" } } } } });
      const user = db.user.findFirst({ where: { id: { equals: 1 } } });
      await expect(user).resolves.toEqual(null);
    });

    test("if read is where it return filtered result", async () => {
      const db = resolveDb({ User: { read: { name: { not: { equals: "John Doe" } } } } });
      const user = db.user.findFirstOrThrow({ where: { id: { equals: 1 } } });
      await expect(user).rejects.toThrowError(PrismaClientKnownRequestError);
    });
  });

  describe("find many", () => {
    test("if read is denied it return empty array", async () => {
      const db = resolveDb();
      const users = db.user.findMany();
      await expect(users).resolves.toEqual([]);
    });

    test("if read is allowed it return all records", async () => {
      const db = resolveDb({ User: { read: true } });
      const users = db.user.findMany();
      await expect(users).resolves.toMatchObject([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    test("if read is where it return filtered result", async () => {
      const db = resolveDb({ User: { read: { name: { not: { equals: "John Doe" } } } } });
      const users = db.user.findMany();
      await expect(users).resolves.toMatchObject([{ id: 2 }, { id: 3 }]);
    });
  });

  describe("aggregate", () => {
    test("if read is denied it return empty result", async () => {
      const db = resolveDb();
      const agg = db.post.aggregate({ _min: { id: true } });
      await expect(agg).resolves.toEqual({ _min: { id: null } });
    });

    test("if read is allowed it return all records", async () => {
      const db = resolveDb({ Post: { read: true } });
      const agg = db.post.aggregate({ _min: { id: true } });
      await expect(agg).resolves.toEqual({ _min: { id: 1 } });
    });

    test("if read is where it return filtered result", async () => {
      const db = resolveDb({ Post: { read: { content: { not: { equals: "Easy 5-minute snack recipes" } } } } });
      const agg = db.post.aggregate({ _min: { id: true } });
      await expect(agg).resolves.toEqual({ _min: { id: 2 } });
    });
  });

  describe("count", () => {
    test("if read is denied it return 0", async () => {
      const db = resolveDb();
      const userCount = db.user.count();
      await expect(userCount).resolves.toEqual(0);
    });

    test("if read is allowed it return all records", async () => {
      const db = resolveDb({ User: { read: true } });
      const userCount = db.user.count();
      await expect(userCount).resolves.toEqual(3);
    });

    test("if read is where it return filtered result", async () => {
      const db = resolveDb({ User: { read: { name: { not: { equals: "John Doe" } } } } });
      const userCount = db.user.count();
      await expect(userCount).resolves.toEqual(2);
    });
  });

  describe("group by", () => {
    test("if read is denied it return empty array", async () => {
      const db = resolveDb();
      const posts = db.post.groupBy({ by: "published", _count: true, orderBy: { published: "asc" } });
      await expect(posts).resolves.toEqual([]);
    });

    test("if read is allowed it return all records", async () => {
      const db = resolveDb({ Post: { read: true } });
      const posts = db.post.groupBy({ by: "published", _count: true, orderBy: { published: "asc" } });
      await expect(posts).resolves.toEqual([
        { _count: 1, published: false },
        { _count: 2, published: true },
      ]);
    });

    test("if read is where it return filtered result", async () => {
      const db = resolveDb({ Post: { read: { content: { not: { equals: "Easy 5-minute snack recipes" } } } } });
      const posts = db.post.groupBy({ by: "published", _count: true, orderBy: { published: "asc" } });
      await expect(posts).resolves.toEqual([
        { _count: 1, published: false },
        { _count: 1, published: true },
      ]);
    });
  });
});
