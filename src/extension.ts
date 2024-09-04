import { Prisma } from "@prisma/client/extension";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { BaseDMMF } from "@prisma/client/runtime/library";

import type { FieldsMap, PermissionsConfig, PrismaTypeMap } from "./types";
import {
  generateImpossibleWhere,
  mergeCreateData,
  mergeSelectAndInclude,
  mergeUpdateData,
  mergeWhere,
  mergeWhereUnique,
  resolveWhere,
} from "./utils";

export const createRlsExtension = (dmmf: BaseDMMF, permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>, context: unknown) => {
  const fieldsMap: FieldsMap = {};

  for (const model of dmmf.datamodel.models) {
    fieldsMap[model.name] = {};

    for (const field of model.fields) {
      fieldsMap[model.name][field.name] = field;
    }
  }

  return Prisma.defineExtension({
    name: "prisma-rls",
    query: {
      $allModels: {
        $allOperations({ model: modelName, operation, args, query }) {
          const modelPermissions = permissionsConfig[modelName];

          switch (operation) {
            case "findFirst":
            case "findUnique":
              if (!modelPermissions.read) {
                return Promise.resolve(null);
              }
              break;
            case "findFirstOrThrow":
            case "findUniqueOrThrow":
              if (!modelPermissions.read) {
                throw new PrismaClientKnownRequestError(`No ${modelName} found`, {
                  code: "P2025",
                  clientVersion: Prisma.prismaVersion.client,
                });
              }
              break;
            case "findMany":
              if (!modelPermissions.read) {
                return Promise.resolve([]);
              }
              break;
            case "aggregate":
              if (!modelPermissions.read) {
                return query({
                  ...args,
                  where: generateImpossibleWhere(fieldsMap[modelName]),
                });
              }
              break;
            case "count":
              if (!modelPermissions.read) {
                return Promise.resolve(0);
              }
              break;
            case "groupBy":
              if (!modelPermissions.read) {
                return Promise.resolve([]);
              }
              break;
            case "create":
            case "createMany":
              if (!modelPermissions.create) {
                throw new Error("Not authorized");
              }
              break;
            case "update":
            case "updateMany":
              if (!modelPermissions.update) {
                throw new Error("Not authorized");
              }
              break;
            case "upsert":
              if (!modelPermissions.create || !modelPermissions.update) {
                throw new Error("Not authorized");
              }
              break;
            case "delete":
            case "deleteMany":
              if (!modelPermissions.delete) {
                throw new Error("Not authorized");
              }
              break;
          }

          switch (operation) {
            case "findUnique":
            case "findUniqueOrThrow":
              if (modelPermissions.read !== true || args.select || args.include) {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  where: mergeWhereUnique(fieldsMap, modelName, args.where as Record<string, any>, resolveWhere(modelPermissions.read, context)),
                });
              }
              break;
            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
              if (modelPermissions.read !== true || args.select || args.include) {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  where: mergeWhere(args.where as Record<string, any> | undefined, resolveWhere(modelPermissions.read, context)),
                });
              }
              break;
            case "aggregate":
            case "count":
            case "groupBy":
              if (modelPermissions.read !== true) {
                return query({
                  ...args,
                  where: mergeWhere(args.where as Record<string, any> | undefined, resolveWhere(modelPermissions.read, context)),
                });
              }
              break;
            case "create":
              if (args.select || args.include || args.data) {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  data: mergeCreateData(permissionsConfig, context, fieldsMap, modelName, args.data as Record<string, any>),
                });
              }
              break;
            case "update":
              if (modelPermissions.update !== true || args.select || args.include || args.data) {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  data: mergeUpdateData(permissionsConfig, context, fieldsMap, modelName, args.data as Record<string, any>),
                  where: mergeWhereUnique(fieldsMap, modelName, args.where as Record<string, any>, resolveWhere(modelPermissions.update, context)),
                });
              }
              break;
            case "updateMany":
              if (modelPermissions.update !== true || args.select || args.include) {
                return query({
                  ...args,
                  where: mergeWhere(args.where as Record<string, any> | undefined, resolveWhere(modelPermissions.update, context)),
                });
              }
              break;
            case "upsert":
              if (modelPermissions.update !== true || args.select || args.include || args.data) {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  create: mergeCreateData(permissionsConfig, context, fieldsMap, modelName, args.create as Record<string, any>),
                  update: mergeUpdateData(permissionsConfig, context, fieldsMap, modelName, args.update as Record<string, any>),
                  where: mergeWhereUnique(fieldsMap, modelName, args.where as Record<string, any>, resolveWhere(modelPermissions.update, context)),
                });
              }
              break;
            case "delete":
              if (modelPermissions.delete !== true || args.select || args.include) {
                return query({
                  ...args,
                  ...mergeSelectAndInclude(permissionsConfig, context, fieldsMap, modelName, args.select, args.include),
                  where: mergeWhereUnique(fieldsMap, modelName, args.where as Record<string, any>, resolveWhere(modelPermissions.delete, context)),
                });
              }
              break;
            case "deleteMany":
              if (modelPermissions.delete !== true) {
                return query({
                  ...args,
                  where: mergeWhere(args.where as Record<string, any> | undefined, resolveWhere(modelPermissions.delete, context)),
                });
              }
              break;
          }

          return query(args);
        },
      },
    },
  });
};
