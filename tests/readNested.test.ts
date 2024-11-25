import { resolveDb } from "./utils";

describe("model nested reading", () => {
  describe("2nd level required belongs to", () => {
    const options = { checkRequiredBelongsTo: true };

    test("if read is denied it throws an error", async () => {
      const db = resolveDb({ Post: { read: true } }, options);
      const posts = db.post.findMany({ select: { id: true, category: { select: { id: true } } } });
      await expect(posts).rejects.toThrowError("Referential integrity violation");
    });

    test("if read is allowed it return all relations", async () => {
      const db = resolveDb({ Category: { read: true }, Post: { read: true } }, options);
      const posts = db.post.findMany({ select: { id: true, category: { select: { id: true } } } });
      await expect(posts).resolves.toMatchObject([
        { id: 1, category: { id: 1 } },
        { id: 2, category: { id: 1 } },
        { id: 3, category: { id: 2 } },
      ]);
    });

    test("if read is where it throws an error if some items are not allowed by policy", async () => {
      const db = resolveDb({ Category: { read: { name: { not: { equals: "Second" } } } }, Post: { read: true } }, options);
      const posts = db.post.findMany({ select: { id: true, category: { select: { id: true } } } });
      await expect(posts).rejects.toThrowError("Referential integrity violation");
    });

    test("if read is where it return filtered result", async () => {
      const db = resolveDb({ Category: { read: { name: { not: { equals: "Fourth" } } } }, Post: { read: true } }, options);
      const posts = db.post.findMany({ select: { id: true, category: { select: { id: true } } } });
      await expect(posts).resolves.toMatchObject([
        { id: 1, category: { id: 1 } },
        { id: 2, category: { id: 1 } },
        { id: 3, category: { id: 2 } },
      ]);
    });
  });
});
