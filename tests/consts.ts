import { Prisma } from "@prisma/client";

import { PermissionsConfig } from "../src";

export const denyPermissions: PermissionsConfig<Prisma.TypeMap, null> = {
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
