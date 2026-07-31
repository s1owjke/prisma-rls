import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: {
    path: "db/migrations",
    seed: "ts-node prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
