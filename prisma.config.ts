import "dotenv/config";

import { env, type PrismaConfig } from "prisma/config";

export default {
  schema: "./db/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "./db/migrations",
    seed: "node --no-warnings --loader ts-node/esm --experimental-specifier-resolution=node ./db/seed.ts",
  },
} satisfies PrismaConfig;
