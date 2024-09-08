import { Prisma } from "@prisma/client";

import { PermissionsConfig } from "../src";

export const denyPermissions: PermissionsConfig<Prisma.TypeMap, null> = {
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
