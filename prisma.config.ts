import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: {
    path: "db/migrations",
    seed: "tsx db/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
