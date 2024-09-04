import { Prisma, PrismaClient } from "@prisma/client";

import { createRlsExtension, PermissionsConfig } from "../src";

describe("simple queries", () => {
  const prisma = new PrismaClient();

  describe("read only permissions", () => {
    const readOnlyPermissions: PermissionsConfig<Prisma.TypeMap, null> = {
      Post: {
        read: { published: { equals: true } },
        create: false,
        update: false,
        delete: false,
      },
      User: {
        read: { email: { not: { equals: "zara.nightshade@test.local" } } },
        create: false,
        update: false,
        delete: false,
      },
      Comment: {
        read: true,
        create: false,
        update: false,
        delete: false,
      },
    };

    const db = prisma.$extends(createRlsExtension(Prisma.dmmf, readOnlyPermissions, null));

    test("filter applied for count", async () => {
      const count = db.user.count();
      await expect(count).resolves.toEqual(2);
    });

    test("filter applied for select", async () => {
      const users = db.user.findMany();
      await expect(users).resolves.toHaveLength(2);
    });

    test("unable to create user", async () => {
      const createdUser = db.user.create({ data: { email: "jim.doe@test.local", name: "Jim Doe" } });
      await expect(createdUser).rejects.toThrow("Not authorized");
    });

    test("unable to update user", async () => {
      const updatedUser = db.user.update({ where: { email: "zara.nightshade@test.local" }, data: { name: "Zara Nightshade" } });
      await expect(updatedUser).rejects.toThrow("Not authorized");
    });

    test("unable to delete user", async () => {
      const createUser = db.user.delete({ where: { email: "zara.nightshade@test.local" } });
      await expect(createUser).rejects.toThrow("Not authorized");
    });

    test("filter applied for nested relations", async () => {
      const users = await db.user.findMany({ include: { posts: true } });
      expect(users).toHaveLength(2);

      expect(users[0].posts).toHaveLength(0);
      expect(users[1].posts).toHaveLength(1);
    });
  });
});
