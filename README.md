# Prisma RLS

[![Published on npm](https://img.shields.io/npm/v/prisma-rls?color=brightgreen)](https://www.npmjs.com/package/prisma-rls) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> 🚧 The package is currently under active development, so it's not recommended for production

Row-Level Security (RLS) traditionally requires databases with native support and custom security policies for each table.

This library provides an alternative: a Prisma client extension that automatically adds "where" clauses to all model queries. This method works without database-side RLS support (e.g., in MySQL).

Note that this extension doesn't apply to raw queries. For those, you must handle them manually or choose database with built-in support.

## Quick start

Define shared types:

```typescript
import { Prisma, User } from "@prisma/client";
import { PermissionsConfig } from "prisma-rls";

export type Role = "User" | "Guest";
export type PermissionsContext = { user: User | null };
export type RolePermissions = PermissionsConfig<Prisma.TypeMap, PermissionsContext>;
export type PermissionsRegistry = Record<Role, RolePermissions>;
```

Define permissions for each model in your schema, they also can be a function:

```typescript
import { RolePermissions } from "./types";

export const User: RolePermissions = {
  Post: {
    read: { published: { equals: true } },
    create: true,
    update: (permissionContext) => ({
      author: {
        id: { equals: permissionContext.user.id },
      },
    }),
    delete: (permissionContext) => ({
      author: {
        id: { equals: permissionContext.user.id },
      },
    }),
  },
  User: {
    read: (permissionContext) => ({
      id: { equals: permissionContext.user.id },
    }),
    create: false,
    update: (permissionContext) => ({
      id: { equals: permissionContext.user.id },
    }),
    delete: false,
  },
}
```

In most cases, you will have multiple roles. To define them in a type-safe manner, follow this pattern:

```typescript
import { guest } from "./guest";
import { user } from "./user";
import { PermissionsRegistry } from "./types";

export const permissionsRegistry = {
  User: user,
  Guest: guest,
} satisfies PermissionsRegistry;
```

Prisma extensions don't support dynamic contexts, so create an extension per context:

```typescript
import { Prisma, PrismaClient } from "@prisma/client";
import Fastify, { FastifyRequest } from "fastify";
import { createRlsExtension } from "prisma-rls";

import { permissionsRegistry, PermissionsContext } from "./permissions";

(async () => {
  const prisma = new PrismaClient();
  const server = Fastify();

  const resolveRequestConext = async (request: FastifyRequest) => {
    const user = await resolveUser(request.headers.authorization);
    const userRole = user ? user.role : "Guest";
    
    const permissionsContext: PermissionsContext = { user };

    const rlsExtension = createRlsExtension({
      dmmf: Prisma.dmmf,
      permissionsConfig: permissionsRegistry[userRole],
      context: permissionsContext,
    });

    return { db: prisma.$extends(rlsExtension) };
  };

  server.get("/user/list", async function handler(request, reply) {
    const { db } = resolveRequestConext(request);
    return await db.user.findMany();
  });

  await server.listen({ port: 8080, host: "0.0.0.0" });
})();
```

After that, all non-raw queries will be executed according to the defined permissions.

## Edge cases

A known edge case involves all belongs-to mandatory relationships on the owner side (the entity containing the foreign key).

Prisma [doesn't generate](https://github.com/prisma/prisma/issues/15708) filters in that case due to potential referential integrity violations, which could lead to inconsistent query results. Because we can't apply RLS filters in this case, no additional "where" clauses are added.

When models have required foreign keys with restricted read access, you have three options:

- make them optional - change required foreign keys to allow `null` values
- handle at policy level - restrict reading models with required foreign keys using consistent policy filters
- accept current behavior - be aware that such relations are readable or handle it at app level
