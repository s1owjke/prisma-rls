import type { Prisma } from "@prisma/client/extension";

import type { FieldsMap, PermissionsConfig, PrismaTypeMap, RecursiveContext, RelationMetadata } from "./types";
import {
  generateImpossibleWhere,
  getPrimaryKeyField,
  isObject,
  lowerFirst,
  mapValues,
  mergeWhere,
  mergeWhereUnique,
  pickByPath,
  resolvePermissionDefinition,
  transformValue,
  uniqueArray,
} from "./utils";

export class ModelResolver {
  constructor(
    protected permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
    protected context: unknown,
    protected fieldsMap: FieldsMap,
    protected authorizationError: Error,
    protected checkRequiredBelongsTo: boolean,
  ) {}

  protected async generateModelRelationsCount(modelName: string): Promise<Record<string, any>> {
    const select: Record<string, any> = {};

    for (const [fieldName, fieldDef] of Object.entries(this.fieldsMap[modelName])) {
      if (fieldDef.kind === "object" && fieldDef.isList) {
        const relationModelName = fieldDef.type;
        const relationPermissions = this.permissionsConfig[relationModelName];

        select[fieldName] = { where: await resolvePermissionDefinition(relationPermissions.read, this.context) };
      }
    }

    return select;
  }

  async resolveWhere(
    permissionDefinition: boolean | Record<string, any> | ((context: unknown) => Record<string, any>),
    modelName: string,
    where: Record<string, any>,
  ) {
    if (!permissionDefinition) {
      return mergeWhere(where, generateImpossibleWhere(this.fieldsMap[modelName]));
    } else if (permissionDefinition === true) {
      return where;
    } else {
      return mergeWhere(where, await resolvePermissionDefinition(permissionDefinition, this.context));
    }
  }

  async resolveWhereUnique(
    permissionDefinition: boolean | Record<string, any> | ((context: unknown) => Record<string, any>),
    modelName: string,
    whereUnique: Record<string, any>,
  ) {
    if (!permissionDefinition) {
      return mergeWhereUnique(this.fieldsMap[modelName], whereUnique, generateImpossibleWhere(this.fieldsMap[modelName]));
    } else if (permissionDefinition === true) {
      return whereUnique;
    } else {
      return mergeWhereUnique(this.fieldsMap[modelName], whereUnique, await resolvePermissionDefinition(permissionDefinition, this.context));
    }
  }

  protected async resolveRelationSelect(
    modelName: string,
    select: Record<string, any>,
    relationsMetadata: RelationMetadata[],
    recursiveContext: RecursiveContext,
  ): Promise<Record<string, any>> {
    return mapValues(select, async (selectValue, selectName) => {
      if (selectName === "_count") {
        if (!selectValue) {
          return selectValue;
        } else if (selectValue !== true && selectValue.select) {
          return {
            select: await this.resolveRelationSelect(modelName, selectValue.select, relationsMetadata, { path: `${recursiveContext.path}._count` }),
          };
        } else {
          return {
            select: this.generateModelRelationsCount(modelName),
          };
        }
      }

      const fieldDef = this.fieldsMap[modelName][selectName];
      if (fieldDef.kind !== "object") {
        return selectValue;
      }

      const relationModelName = fieldDef.type;
      const relationFields = this.fieldsMap[relationModelName];
      const relationPermissions = this.permissionsConfig[relationModelName];
      const relationRecursiveContext = {
        path: fieldDef.isList ? `${recursiveContext.path}.*.${selectName}` : `${recursiveContext.path}.${selectName}`,
      };

      if (!fieldDef.isList && fieldDef.isRequired) {
        if (this.checkRequiredBelongsTo && relationPermissions.read !== true) {
          const primaryKeyField = getPrimaryKeyField(relationFields);

          if (isObject(selectValue) && !selectValue.select[primaryKeyField.name] && !selectValue.include) {
            throw new Error("You must select a primary key for the required belongs to relations");
          }

          relationsMetadata.push({
            type: "requiredBelongsTo",
            path: relationRecursiveContext.path,
            modelName: relationModelName,
          });
        }

        if (isObject(selectValue)) {
          return {
            ...selectValue,
            ...(await this.resolveSelectAndInclude(
              relationModelName,
              selectValue.select,
              selectValue.include,
              relationsMetadata,
              relationRecursiveContext,
            )),
          };
        } else {
          return selectValue;
        }
      }

      if (!relationPermissions.read) {
        return { where: generateImpossibleWhere(relationFields) };
      } else if (relationPermissions.read !== true && selectValue === true) {
        return { where: await resolvePermissionDefinition(relationPermissions.read, this.context) };
      } else if (relationPermissions.read !== true && selectValue !== false) {
        const [selectAndInclude, permissionDefinition] = await Promise.all([
          this.resolveSelectAndInclude(relationModelName, selectValue.select, selectValue.include, relationsMetadata, relationRecursiveContext),
          resolvePermissionDefinition(relationPermissions.read, this.context),
        ]);

        return {
          ...selectValue,
          ...selectAndInclude,
          where: mergeWhere(selectValue.where, permissionDefinition),
        };
      } else if (isObject(selectValue)) {
        return {
          ...selectValue,
          ...(await this.resolveSelectAndInclude(
            relationModelName,
            selectValue.select,
            selectValue.include,
            relationsMetadata,
            relationRecursiveContext,
          )),
        };
      }

      return selectValue;
    });
  }

  async resolveSelectAndInclude(
    modelName: string,
    select: Record<string, any> | undefined,
    include: Record<string, any> | undefined,
    relationsMetadata: RelationMetadata[],
    recursiveContext: RecursiveContext = { path: "$" },
  ): Promise<Record<string, any>> {
    if (select) {
      return {
        select: await this.resolveRelationSelect(modelName, select, relationsMetadata, recursiveContext),
      };
    } else if (include) {
      return {
        include: await this.resolveRelationSelect(modelName, include, relationsMetadata, recursiveContext),
      };
    } else {
      return {};
    }
  }

  async resolveCreate(modelName: string, data: Record<string, any>): Promise<Record<string, any>> {
    return mapValues(data, async (dataValue, dataName) => {
      const fieldDef = this.fieldsMap[modelName][dataName];
      if (fieldDef.kind !== "object") {
        return dataValue;
      }

      const relationModelName = fieldDef.type;
      const relationFields = this.fieldsMap[relationModelName];
      const relationPermissions = this.permissionsConfig[relationModelName];

      if (fieldDef.isList) {
        return mapValues(dataValue, async (actionValue, actionName) => {
          switch (actionName) {
            case "create":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              } else {
                return transformValue(actionValue, async (value) => {
                  return this.resolveCreate(relationModelName, value);
                });
              }
            case "createMany":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              }
              break;
            case "connectOrCreate":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              } else if (!relationPermissions.read) {
                return transformValue(actionValue, async (value) => {
                  return {
                    create: await this.resolveCreate(relationModelName, value.create),
                    where: mergeWhereUnique(relationFields, value.where, generateImpossibleWhere(relationFields)),
                  };
                });
              } else if (relationPermissions.read !== true) {
                return transformValue(actionValue, async (value) => {
                  const [create, permissionDefinition] = await Promise.all([
                    this.resolveCreate(relationModelName, value.create),
                    resolvePermissionDefinition(relationPermissions.read, this.context),
                  ]);

                  return {
                    create,
                    where: mergeWhereUnique(relationFields, value.where, permissionDefinition),
                  };
                });
              } else {
                return transformValue(actionValue, async (value) => {
                  return {
                    create: await this.resolveCreate(relationModelName, value),
                    where: value.where,
                  };
                });
              }
            case "connect":
              if (!relationPermissions.read) {
                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, generateImpossibleWhere(relationFields));
                });
              } else if (relationPermissions.read !== true) {
                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, await resolvePermissionDefinition(relationPermissions.read, this.context));
                });
              }
              break;
            default:
              throw new Error("Not implemented");
          }

          return actionValue;
        });
      } else {
        return mapValues(dataValue, async (actionValue, actionName) => {
          switch (actionName) {
            case "create":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              } else {
                return this.resolveCreate(relationModelName, actionValue);
              }
            case "connectOrCreate":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              } else if (!relationPermissions.read) {
                return {
                  create: await this.resolveCreate(relationModelName, actionValue.create),
                  where: mergeWhereUnique(relationFields, actionValue.where, generateImpossibleWhere(relationFields)),
                };
              } else if (relationPermissions.read !== true) {
                const [create, permissionDefinition] = await Promise.all([
                  this.resolveCreate(relationModelName, actionValue.create),
                  resolvePermissionDefinition(relationPermissions.read, this.context),
                ]);

                return {
                  create,
                  where: mergeWhereUnique(relationFields, actionValue.where, permissionDefinition),
                };
              } else {
                return {
                  create: await this.resolveCreate(relationModelName, actionValue.create),
                  where: actionValue.where,
                };
              }
            case "connect":
              if (!relationPermissions.read) {
                return mergeWhereUnique(relationFields, actionValue, generateImpossibleWhere(relationFields));
              } else if (relationPermissions.read !== true) {
                return mergeWhereUnique(relationFields, actionValue, await resolvePermissionDefinition(relationPermissions.read, this.context));
              }
              break;
            default:
              throw new Error("Not implemented");
          }

          return actionValue;
        });
      }
    });
  }

  async resolveUpdate(modelName: string, data: Record<string, any>): Promise<Record<string, any>> {
    return mapValues(data, async (dataValue, dataName) => {
      const fieldDef = this.fieldsMap[modelName][dataName];
      if (fieldDef.kind !== "object") {
        return dataValue;
      }

      const relationModelName = fieldDef.type;
      const relationFields = this.fieldsMap[relationModelName];
      const relationPermissions = this.permissionsConfig[relationModelName];

      if (fieldDef.isList) {
        return mapValues(dataValue, async (actionValue, actionName) => {
          switch (actionName) {
            case "create":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              } else {
                return transformValue(actionValue, async (value) => {
                  return this.resolveCreate(relationModelName, value);
                });
              }
            case "createMany":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              }
              break;
            case "connectOrCreate":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              } else if (!relationPermissions.read) {
                return transformValue(actionValue, async (value) => {
                  return {
                    create: await this.resolveCreate(relationModelName, value.create),
                    where: mergeWhereUnique(relationFields, value.where, generateImpossibleWhere(relationFields)),
                  };
                });
              } else if (relationPermissions.read !== true) {
                return transformValue(actionValue, async (value) => {
                  const [create, permissionDefinition] = await Promise.all([
                    this.resolveCreate(relationModelName, value.create),
                    resolvePermissionDefinition(relationPermissions.read, this.context),
                  ]);

                  return {
                    create,
                    where: mergeWhereUnique(relationFields, value.where, permissionDefinition),
                  };
                });
              } else {
                return transformValue(actionValue, async (value) => {
                  return {
                    create: await this.resolveCreate(relationModelName, value.create),
                    where: value.where,
                  };
                });
              }
            case "set":
            case "connect":
            case "disconnect":
              if (!relationPermissions.read) {
                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, generateImpossibleWhere(relationFields));
                });
              } else if (relationPermissions.read !== true) {
                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, await resolvePermissionDefinition(relationPermissions.read, this.context));
                });
              }
              break;
            case "update":
              if (!relationPermissions.update) {
                throw this.authorizationError;
              } else if (relationPermissions.update !== true) {
                return transformValue(actionValue, async (value) => {
                  const [data, permissionDefinition] = await Promise.all([
                    this.resolveUpdate(relationModelName, value.data),
                    resolvePermissionDefinition(relationPermissions.update, this.context),
                  ]);

                  return {
                    data,
                    where: mergeWhereUnique(relationFields, value.where, permissionDefinition),
                  };
                });
              } else {
                return transformValue(actionValue, async (value) => {
                  return {
                    data: await this.resolveUpdate(relationModelName, value.data),
                    where: value.where,
                  };
                });
              }
            case "updateMany":
              if (!relationPermissions.update) {
                throw this.authorizationError;
              } else if (relationPermissions.update !== true) {
                return transformValue(actionValue, async (value) => {
                  return {
                    data: value.data,
                    where: mergeWhere(value.where, await resolvePermissionDefinition(relationPermissions.update, this.context)),
                  };
                });
              }
              break;
            case "upsert":
              if (!relationPermissions.create || !relationPermissions.update) {
                throw this.authorizationError;
              } else if (relationPermissions.update !== true) {
                return transformValue(actionValue, async (value) => {
                  const [create, update, permissionDefinition] = await Promise.all([
                    this.resolveCreate(relationModelName, value.create),
                    this.resolveUpdate(relationModelName, value.update),
                    resolvePermissionDefinition(relationPermissions.update, this.context),
                  ]);

                  return {
                    create,
                    update,
                    where: mergeWhereUnique(relationFields, value.where, permissionDefinition),
                  };
                });
              } else {
                return transformValue(actionValue, async (value) => {
                  const [create, update] = await Promise.all([
                    this.resolveCreate(relationModelName, value.create),
                    this.resolveUpdate(relationModelName, value.update),
                  ]);

                  return { create, update, where: value.where };
                });
              }
            case "delete":
              if (!relationPermissions.delete) {
                throw this.authorizationError;
              } else if (relationPermissions.delete !== true) {
                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, await resolvePermissionDefinition(relationPermissions.delete, this.context));
                });
              }
              break;
            case "deleteMany":
              if (!relationPermissions.delete) {
                throw this.authorizationError;
              } else if (relationPermissions.delete !== true) {
                return transformValue(actionValue, async (value) => {
                  return mergeWhere(value, await resolvePermissionDefinition(relationPermissions.delete, this.context));
                });
              }
              break;
            default:
              throw new Error("Not implemented");
          }

          return actionValue;
        });
      } else {
        return mapValues(dataValue, async (actionValue, actionName) => {
          switch (actionName) {
            case "create":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              } else {
                return this.resolveCreate(relationModelName, actionValue);
              }
            case "connectOrCreate":
              if (!relationPermissions.create) {
                throw this.authorizationError;
              } else if (!relationPermissions.read) {
                return {
                  create: await this.resolveCreate(relationModelName, actionValue.create),
                  where: mergeWhereUnique(relationFields, actionValue.where, generateImpossibleWhere(relationFields)),
                };
              } else if (relationPermissions.read !== true) {
                const [create, permissionDefinition] = await Promise.all([
                  this.resolveCreate(relationModelName, actionValue.create),
                  resolvePermissionDefinition(relationPermissions.read, this.context),
                ]);

                return {
                  create,
                  where: mergeWhereUnique(relationFields, actionValue.where, permissionDefinition),
                };
              } else {
                return {
                  create: await this.resolveCreate(relationModelName, actionValue.create),
                  where: actionValue.where,
                };
              }
            case "connect":
              if (!relationPermissions.read) {
                return mergeWhereUnique(relationFields, actionValue, generateImpossibleWhere(relationFields));
              } else if (relationPermissions.read !== true) {
                return mergeWhereUnique(relationFields, actionValue, await resolvePermissionDefinition(relationPermissions.read, this.context));
              }
              break;
            case "disconnect":
              if (!relationPermissions.read) {
                return mergeWhere(actionValue, generateImpossibleWhere(relationFields));
              } else if (relationPermissions.read !== true && actionValue === true) {
                return resolvePermissionDefinition(relationPermissions.read, this.context);
              } else if (relationPermissions.read !== true && actionValue !== true) {
                return mergeWhere(actionValue, await resolvePermissionDefinition(relationPermissions.read, this.context));
              }
              break;
            case "update":
              if (!relationPermissions.update) {
                throw this.authorizationError;
              } else if (relationPermissions.update !== true && !actionValue.hasOwnProperty("data")) {
                const [data, where] = await Promise.all([
                  this.resolveUpdate(relationModelName, actionValue),
                  resolvePermissionDefinition(relationPermissions.update, this.context),
                ]);

                return { data, where };
              } else if (relationPermissions.update !== true && !actionValue.where) {
                const [data, where] = await Promise.all([
                  this.resolveUpdate(relationModelName, actionValue.data),
                  resolvePermissionDefinition(relationPermissions.update, this.context),
                ]);

                return { data, where };
              } else if (relationPermissions.update !== true) {
                const [data, permissionDefinition] = await Promise.all([
                  this.resolveUpdate(relationModelName, actionValue.data),
                  resolvePermissionDefinition(relationPermissions.update, this.context),
                ]);

                return {
                  data,
                  where: mergeWhereUnique(relationFields, actionValue.where, permissionDefinition),
                };
              } else if (!actionValue.hasOwnProperty("data")) {
                return this.resolveUpdate(relationModelName, actionValue);
              } else {
                return {
                  data: await this.resolveUpdate(relationModelName, actionValue.data),
                  where: actionValue.where,
                };
              }
            case "upsert":
              if (!relationPermissions.create || !relationPermissions.update) {
                throw this.authorizationError;
              } else if (relationPermissions.update !== true && !actionValue.where) {
                const [create, update, where] = await Promise.all([
                  this.resolveCreate(relationModelName, actionValue.create),
                  this.resolveUpdate(relationModelName, actionValue.update),
                  resolvePermissionDefinition(relationPermissions.update, this.context),
                ]);

                return { create, update, where };
              } else if (relationPermissions.update !== true) {
                const [create, update, permissionDefinition] = await Promise.all([
                  this.resolveCreate(relationModelName, actionValue.create),
                  this.resolveUpdate(relationModelName, actionValue.update),
                  resolvePermissionDefinition(relationPermissions.update, this.context),
                ]);

                return {
                  create,
                  update,
                  where: mergeWhereUnique(relationFields, actionValue.where, permissionDefinition),
                };
              } else {
                const [create, update] = await Promise.all([
                  this.resolveCreate(relationModelName, actionValue.create),
                  this.resolveUpdate(relationModelName, actionValue.update),
                ]);

                return { create, update, where: actionValue.where };
              }
            case "delete":
              if (!relationPermissions.delete) {
                throw this.authorizationError;
              } else if (relationPermissions.delete !== true && actionValue === true) {
                return resolvePermissionDefinition(relationPermissions.delete, this.context);
              } else if (relationPermissions.delete !== true && actionValue !== true) {
                return mergeWhere(actionValue, await resolvePermissionDefinition(relationPermissions.delete, this.context));
              }
              break;
            default:
              throw new Error("Not implemented");
          }

          return actionValue;
        });
      }
    });
  }

  async performRelationProcessing(
    transactionClient: Prisma.TransactionClient,
    result: any | any[],
    relationsMetadata: RelationMetadata[],
  ): Promise<void> {
    for (const relationMetadata of relationsMetadata) {
      switch (relationMetadata.type) {
        case "requiredBelongsTo":
          const matchingRelations = pickByPath(result, Array.isArray(result) ? relationMetadata.path.replace("$.", "$.*.") : relationMetadata.path);
          if (!matchingRelations.length) {
            continue;
          }

          const relationPermissions = this.permissionsConfig[relationMetadata.modelName];

          if (!relationPermissions.read) {
            throw new Error("Referential integrity violation");
          } else if (relationPermissions.read === true) {
            continue;
          }

          const primaryKeyField = getPrimaryKeyField(this.fieldsMap[relationMetadata.modelName]);
          const primaryKeys = uniqueArray(matchingRelations.map((relation) => relation[primaryKeyField.name]));

          const allowedCount = await transactionClient[lowerFirst(relationMetadata.modelName)].count({
            where: mergeWhere(
              { [primaryKeyField.name]: { in: primaryKeys } },
              await resolvePermissionDefinition(relationPermissions.read, this.context),
            ),
          });

          if (primaryKeys.length !== allowedCount) {
            throw new Error("Referential integrity violation");
          }

          break;
        default:
          throw new Error("Not implemented");
      }
    }

    return result;
  }
}
