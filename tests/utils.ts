import { Prisma, PrismaClient } from "@prisma/client";

import { createRlsExtension, PermissionsConfig } from "../src";

import { denyPermissions } from "./consts";
import { PartialPermissionsConfig } from "./types";
import { ITXClientDenyList } from "@prisma/client/runtime/library";

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const mergeObjectsDeep = (first: Record<string, unknown>, second: Record<string, unknown>) => {
  const result = { ...first };

  for (const key in second) {
    if (first.hasOwnProperty(key)) {
      const firstValue = first[key];
      const secondValue = second[key];

      if (isObject(firstValue) && isObject(secondValue)) {
        result[key] = mergeObjectsDeep(firstValue, secondValue);
      } else {
        result[key] = second[key];
      }
    }
  }

  return result;
};

export const resolveDb = (overridePermissions: PartialPermissionsConfig<Prisma.TypeMap, null> = {}) => {
  const rlsExtension = createRlsExtension(
    Prisma.dmmf,
    mergeObjectsDeep(denyPermissions, overridePermissions) as PermissionsConfig<Prisma.TypeMap, null>,
    null,
  );

  return new PrismaClient().$extends(rlsExtension) as unknown as PrismaClient;
};

export const executeAndRollback = async (
  prisma: PrismaClient,
  callback: (tx: Omit<PrismaClient, ITXClientDenyList>) => Promise<void>,
): Promise<void> => {
  try {
    await prisma.$transaction(async (tx) => {
      await callback(tx);
      throw new Error("Rollback transaction");
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Rollback transaction") {
      return;
    }

    throw error;
  }
};
