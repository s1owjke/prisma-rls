# Prisma RLS

[![Published on npm](https://img.shields.io/npm/v/prisma-rls?color=brightgreen)](https://www.npmjs.com/package/prisma-rls) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

> 🚧 The package is under active development, public api could be changed

The classic approach to implementing Row-Level Security (RLS) requires a database with built-in support and writing row-level security policies for tables.

This library offers an alternative approach - an extension to the Prisma client that adds additional "where" clauses to all model queries. This approach doesn't require RLS support on the database side (for example, in MySQL).

It's important to keep in mind that this extension doesn't cover raw queries. In such cases, you should take care of it yourself or use classic approach.

## How to use it

Define permissions for all models in your schema.

```typescript
import { Prisma } from "@prisma/client";
import { PermissionsConfig } from "prisma-rls";

export type Context = Record<string, any>;
type RolePermissions = PermissionsConfig<Prisma.TypeMap, Context>;

export const Guest: RolePermissions = {
  Post: {
    read: { published: { equals: true } },
    create: false,
    update: false,
    delete: false,
  },
  User: {
    read: { role: { not: { equals: "admin" } } },
    create: false,
    update: false,
    delete: false,
  },
}
```

Extend the Prisma client with the rls extension.

```typescript
import { Prisma, PrismaClient } from "@prisma/client";
import { createRlsExtension } from "prisma-rls";

import { Guest } from "./permissions/guest";

const context: Context = {};
const db = new PrismaClient().$extends(createRlsExtension(Prisma.dmmf, Guest, context));
```

After that all requests except raw will be executed according to permissions

### Permissions registry

Almost always you will have several roles, to describe them in a type-safe way use the following pattern:

```typescript
import { admin } from "./admin";
import { guest } from "./guest";

type Role = "Admin" | "Guest";
type PermissionsRegistry = Record<Role, RolePermissions>;

export const permissionsRegistry = {
  Admin: admin,
  Guest: guest,
} satisfies PermissionsRegistry;
```

### Context

Since Prisma doesn't support context to pass data to the [extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions), you will typically extend the client per request (based on role associated with auth token):

```typescript
import { Prisma, PrismaClient } from "@prisma/client";
import Fastify, { FastifyRequest } from "fastify";
import { createRlsExtension } from "prisma-rls";

import { permissionsRegistry } from "./permissions";

(async () => {
  const prisma = new PrismaClient();
  const server = Fastify();

  const resolveConext = (request: FastifyRequest) => {
    const role = resolveRole(request.headers.authorization);
    const rolePermissions = permissionsRegistry[role];

    return { db: prisma.$extends(createRlsExtension(Prisma.dmmf, rolePermissions, { role })) };
  }
  
  server.get('/post/count', async function handler(request, reply) {
    const { db } = resolveContext(request);
    return await db.post.count();
  })

  await server.listen({ port: 8080, host: "0.0.0.0" });
})();
```
