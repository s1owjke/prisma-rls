import { Prisma } from "../db/generated/client";
import { PermissionsConfig } from "../src";

export const denyPermissions: PermissionsConfig<Prisma.TypeMap, null> = {
  Membership: {
    read: false,
    create: false,
    update: false,
    delete: false,
  },
  Category: {
    read: false,
    create: false,
    update: false,
    delete: false,
  },
  Comment: {
    read: false,
    create: false,
    update: false,
    delete: false,
  },
  Post: {
    read: false,
    create: false,
    update: false,
    delete: false,
  },
  User: {
    read: false,
    create: false,
    update: false,
    delete: false,
  },
};
