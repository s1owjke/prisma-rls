import type { Prisma } from "@prisma/client/extension";

import { ReferentialIntegrityError } from "./errors";
import type {
  FieldsMap,
  ModelCreateInput,
  ModelCreateNestedManyInput,
  ModelCreateNestedOneInput,
  ModelSelectInput,
  ModelSelectNestedCountInput,
  ModelSelectNestedInput,
  ModelSelectNestedRequiredInput,
  ModelUpdateInput,
  ModelUpdateNestedManyInput,
  ModelUpdateNestedOneInput,
  ModelUpdateNestedOneRequiredInput,
  PermissionsConfig,
  PrismaTypeMap,
  RecursiveContext,
  RelationMetadata,
} from "./types";
import {
  generateImpossibleWhere,
  getUniqueField,
  isObject,
  lowerFirst,
  mapObjectValues,
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

  async resolveWhere(
    permissionDefinition: boolean | Record<string, unknown> | ((context: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>),
    modelName: string,
    where: Record<string, unknown> | undefined,
  ) {
    if (!permissionDefinition) {
      return generateImpossibleWhere(this.fieldsMap[modelName]);
    } else if (permissionDefinition === true) {
      return where;
    } else {
      return mergeWhere(where, await resolvePermissionDefinition(permissionDefinition, this.context));
    }
  }

  async resolveWhereUnique(
    permissionDefinition: boolean | Record<string, unknown> | ((context: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>),
    modelName: string,
    whereUnique: Record<string, unknown>,
  ) {
    if (!permissionDefinition) {
      return mergeWhereUnique(this.fieldsMap[modelName], whereUnique, generateImpossibleWhere(this.fieldsMap[modelName]));
    } else if (permissionDefinition === true) {
      return whereUnique;
    } else {
      return mergeWhereUnique(this.fieldsMap[modelName], whereUnique, await resolvePermissionDefinition(permissionDefinition, this.context));
    }
  }

  protected async generateModelRelationsCount(modelName: string): Promise<ModelSelectInput> {
    const select: ModelSelectInput = {};

    for (const [fieldName, fieldDef] of Object.entries(this.fieldsMap[modelName])) {
      if (fieldDef.kind === "object" && fieldDef.isList) {
        const relationModelName = fieldDef.type;
        const relationPermissions = this.permissionsConfig[relationModelName];

        if (!relationPermissions.read) {
          select[fieldName] = false;
        } else if (relationPermissions.read !== true) {
          select[fieldName] = { where: await resolvePermissionDefinition(relationPermissions.read, this.context) };
        } else {
          select[fieldName] = true;
        }
      }
    }

    return select;
  }

  protected async resolveRelationSelect(
    modelName: string,
    select: ModelSelectInput,
    relationsMetadata: RelationMetadata[],
    recursiveContext: RecursiveContext,
  ): Promise<ModelSelectInput> {
    return mapObjectValues(select, async ([selectName, selectValue]) => {
      if (!selectValue) return selectValue;

      if (selectName === "_count") {
        const narrowedSelectValue = selectValue as true | ModelSelectNestedCountInput;

        if (isObject(narrowedSelectValue) && isObject(narrowedSelectValue.select)) {
          const countRecursiveContext = { path: `${recursiveContext.path}.${selectName}` };
          return { select: await this.resolveRelationSelect(modelName, narrowedSelectValue.select, relationsMetadata, countRecursiveContext) };
        } else {
          return { select: await this.generateModelRelationsCount(modelName) };
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
        path: fieldDef.isList ? `${recursiveContext.path}.${selectName}.*` : `${recursiveContext.path}.${selectName}`,
      };

      if (!fieldDef.isList && fieldDef.isRequired) {
        const narrowedSelectValue = selectValue as true | ModelSelectNestedRequiredInput;

        if (this.checkRequiredBelongsTo && relationPermissions.read !== true) {
          const uniqueField = getUniqueField(relationFields);

          if (
            isObject(narrowedSelectValue) &&
            isObject(narrowedSelectValue.select) &&
            !narrowedSelectValue.select[uniqueField.name] &&
            !narrowedSelectValue.include
          ) {
            throw new Error("You must select a primary key or other unique field for the required belongs to relations");
          }

          relationsMetadata.push({
            type: "requiredBelongsTo",
            path: relationRecursiveContext.path,
            modelName: relationModelName,
          });
        }

        if (isObject(narrowedSelectValue)) {
          return {
            ...narrowedSelectValue,
            ...(await this.resolveSelectAndInclude(
              relationModelName,
              narrowedSelectValue.select,
              narrowedSelectValue.include,
              relationsMetadata,
              relationRecursiveContext,
            )),
          };
        } else {
          return narrowedSelectValue;
        }
      }

      const narrowedSelectValue = selectValue as true | ModelSelectNestedInput;

      if (!relationPermissions.read) {
        return { where: generateImpossibleWhere(relationFields) };
      } else if (relationPermissions.read !== true) {
        if (isObject(narrowedSelectValue)) {
          const [selectAndInclude, permissionDefinition] = await Promise.all([
            this.resolveSelectAndInclude(
              relationModelName,
              narrowedSelectValue.select,
              narrowedSelectValue.include,
              relationsMetadata,
              relationRecursiveContext,
            ),
            resolvePermissionDefinition(relationPermissions.read, this.context),
          ]);

          return {
            ...narrowedSelectValue,
            ...selectAndInclude,
            where: mergeWhere(narrowedSelectValue.where, permissionDefinition),
          };
        } else {
          return { where: await resolvePermissionDefinition(relationPermissions.read, this.context) };
        }
      } else {
        if (isObject(narrowedSelectValue)) {
          return {
            ...narrowedSelectValue,
            ...(await this.resolveSelectAndInclude(
              relationModelName,
              narrowedSelectValue.select,
              narrowedSelectValue.include,
              relationsMetadata,
              relationRecursiveContext,
            )),
          };
        }
      }

      return narrowedSelectValue;
    });
  }

  async resolveSelectAndInclude(
    modelName: string,
    select: ModelSelectInput | null | undefined,
    include: ModelSelectInput | null | undefined,
    relationsMetadata: RelationMetadata[],
    recursiveContext: RecursiveContext,
  ): Promise<Record<string, unknown>> {
    if (select) {
      return { select: await this.resolveRelationSelect(modelName, select, relationsMetadata, recursiveContext) };
    } else if (include) {
      return { include: await this.resolveRelationSelect(modelName, include, relationsMetadata, recursiveContext) };
    } else {
      return {};
    }
  }

  async resolveCreate(modelName: string, data: ModelCreateInput): Promise<ModelCreateInput> {
    return mapObjectValues(data, async ([dataName, dataValue]) => {
      const fieldDef = this.fieldsMap[modelName][dataName];
      if (fieldDef.kind !== "object") {
        return dataValue;
      }

      const relationModelName = fieldDef.type;
      const relationFields = this.fieldsMap[relationModelName];
      const relationPermissions = this.permissionsConfig[relationModelName];

      if (fieldDef.isList) {
        return mapObjectValues(dataValue as ModelCreateNestedManyInput, async ([actionName, actionValue]) => {
          if (!actionValue) return actionValue;

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
              } else {
                if (!relationPermissions.read) {
                  return transformValue(actionValue, async (value) => {
                    return {
                      create: await this.resolveCreate(relationModelName, value.create),
                      where: mergeWhereUnique(relationFields, value.where, generateImpossibleWhere(relationFields)),
                    };
                  });
                } else if (relationPermissions.read !== true) {
                  const permissionDefinition = await resolvePermissionDefinition(relationPermissions.read, this.context);

                  return transformValue(actionValue, async (value) => {
                    return {
                      create: await this.resolveCreate(relationModelName, value.create),
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
              }
            case "connect":
              if (!relationPermissions.read) {
                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, generateImpossibleWhere(relationFields));
                });
              } else if (relationPermissions.read !== true) {
                const permissionDefinition = await resolvePermissionDefinition(relationPermissions.read, this.context);

                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, permissionDefinition);
                });
              }
              break;
            default:
              throw new Error(`Failed to resolve the operation '${actionName}' in the nested create for a list relation`);
          }

          return actionValue;
        });
      } else {
        return mapObjectValues(dataValue as ModelCreateNestedOneInput, async ([actionName, actionValue]) => {
          if (!actionValue) return actionValue;

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
              } else {
                if (!relationPermissions.read) {
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
              }
            case "connect":
              if (!relationPermissions.read) {
                return mergeWhereUnique(relationFields, actionValue, generateImpossibleWhere(relationFields));
              } else if (relationPermissions.read !== true) {
                return mergeWhereUnique(relationFields, actionValue, await resolvePermissionDefinition(relationPermissions.read, this.context));
              }
              break;
            default:
              throw new Error(`Failed to resolve the operation '${actionName}' in the nested create for a non-list relation`);
          }

          return actionValue;
        });
      }
    });
  }

  async resolveUpdate(modelName: string, data: ModelUpdateInput): Promise<ModelUpdateInput> {
    return mapObjectValues(data, async ([dataName, dataValue]) => {
      const fieldDef = this.fieldsMap[modelName][dataName];
      if (fieldDef.kind !== "object") {
        return dataValue;
      }

      const relationModelName = fieldDef.type;
      const relationFields = this.fieldsMap[relationModelName];
      const relationPermissions = this.permissionsConfig[relationModelName];

      if (fieldDef.isList) {
        return mapObjectValues(dataValue as ModelUpdateNestedManyInput, async ([actionName, actionValue]) => {
          if (!actionValue) return actionValue;

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
              } else {
                if (!relationPermissions.read) {
                  return transformValue(actionValue, async (value) => {
                    return {
                      create: await this.resolveCreate(relationModelName, value.create),
                      where: mergeWhereUnique(relationFields, value.where, generateImpossibleWhere(relationFields)),
                    };
                  });
                } else if (relationPermissions.read !== true) {
                  const permissionDefinition = await resolvePermissionDefinition(relationPermissions.read, this.context);

                  return transformValue(actionValue, async (value) => {
                    return {
                      create: await this.resolveCreate(relationModelName, value.create),
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
              }
            case "set":
            case "connect":
            case "disconnect":
              if (!relationPermissions.read) {
                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, generateImpossibleWhere(relationFields));
                });
              } else if (relationPermissions.read !== true) {
                const permissionDefinition = await resolvePermissionDefinition(relationPermissions.read, this.context);

                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, permissionDefinition);
                });
              }
              break;
            case "update":
              if (!relationPermissions.update) {
                throw this.authorizationError;
              } else if (relationPermissions.update !== true) {
                const permissionDefinition = await resolvePermissionDefinition(relationPermissions.update, this.context);

                return transformValue(actionValue, async (value) => {
                  return {
                    data: await this.resolveUpdate(relationModelName, value.data),
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
                const permissionDefinition = await resolvePermissionDefinition(relationPermissions.update, this.context);

                return transformValue(actionValue, async (value) => {
                  return {
                    data: value.data,
                    where: mergeWhere(value.where, permissionDefinition),
                  };
                });
              }
              break;
            case "upsert":
              if (!relationPermissions.create || !relationPermissions.update) {
                throw this.authorizationError;
              } else if (relationPermissions.update !== true) {
                const permissionDefinition = await resolvePermissionDefinition(relationPermissions.update, this.context);

                return transformValue(actionValue, async (value) => {
                  const [create, update] = await Promise.all([
                    this.resolveCreate(relationModelName, value.create),
                    this.resolveUpdate(relationModelName, value.update),
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
                const permissionDefinition = await resolvePermissionDefinition(relationPermissions.delete, this.context);

                return transformValue(actionValue, async (value) => {
                  return mergeWhereUnique(relationFields, value, permissionDefinition);
                });
              }
              break;
            case "deleteMany":
              if (!relationPermissions.delete) {
                throw this.authorizationError;
              } else if (relationPermissions.delete !== true) {
                const permissionDefinition = await resolvePermissionDefinition(relationPermissions.delete, this.context);

                return transformValue(actionValue, async (value) => {
                  return mergeWhere(value, permissionDefinition);
                });
              }
              break;
            default:
              throw new Error(`Failed to resolve the operation '${actionName}' in the nested update for a list relation`);
          }

          return actionValue;
        });
      } else {
        return mapObjectValues(dataValue as ModelUpdateNestedOneInput & ModelUpdateNestedOneRequiredInput, async ([actionName, actionValue]) => {
          if (!actionValue) return actionValue;

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
              } else {
                if (!relationPermissions.read) {
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
                return generateImpossibleWhere(relationFields);
              } else if (relationPermissions.read !== true) {
                if (isObject(actionValue)) {
                  return mergeWhere(actionValue, await resolvePermissionDefinition(relationPermissions.read, this.context));
                } else {
                  return resolvePermissionDefinition(relationPermissions.read, this.context);
                }
              }
              break;
            case "update":
              if (!relationPermissions.update) {
                throw this.authorizationError;
              } else if (relationPermissions.update !== true) {
                if (!actionValue.data) {
                  const [data, where] = await Promise.all([
                    this.resolveUpdate(relationModelName, actionValue),
                    resolvePermissionDefinition(relationPermissions.update, this.context),
                  ]);

                  return { data, where };
                } else if (!actionValue.where) {
                  const [data, where] = await Promise.all([
                    this.resolveUpdate(relationModelName, actionValue.data),
                    resolvePermissionDefinition(relationPermissions.update, this.context),
                  ]);

                  return { data, where };
                } else {
                  const [data, permissionDefinition] = await Promise.all([
                    this.resolveUpdate(relationModelName, actionValue.data),
                    resolvePermissionDefinition(relationPermissions.update, this.context),
                  ]);

                  return {
                    data,
                    where: mergeWhereUnique(relationFields, actionValue.where, permissionDefinition),
                  };
                }
              } else {
                if (!actionValue.data) {
                  return this.resolveUpdate(relationModelName, actionValue);
                } else {
                  return {
                    data: await this.resolveUpdate(relationModelName, actionValue.data),
                    where: actionValue.where,
                  };
                }
              }
            case "upsert":
              if (!relationPermissions.create || !relationPermissions.update) {
                throw this.authorizationError;
              } else if (relationPermissions.update !== true) {
                if (!actionValue.where) {
                  const [create, update, where] = await Promise.all([
                    this.resolveCreate(relationModelName, actionValue.create),
                    this.resolveUpdate(relationModelName, actionValue.update),
                    resolvePermissionDefinition(relationPermissions.update, this.context),
                  ]);

                  return { create, update, where };
                } else {
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
                }
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
              } else if (relationPermissions.delete !== true) {
                if (isObject(actionValue)) {
                  return mergeWhere(actionValue, await resolvePermissionDefinition(relationPermissions.delete, this.context));
                } else {
                  return resolvePermissionDefinition(relationPermissions.delete, this.context);
                }
              }
              break;
            default:
              throw new Error(`Failed to resolve the operation '${actionName}' in the nested update for a non-list relation`);
          }

          return actionValue;
        });
      }
    });
  }

  async performRelationProcessing(
    transactionClient: Prisma.TransactionClient,
    result: unknown,
    relationsMetadata: RelationMetadata[],
  ): Promise<unknown> {
    for (const relationMetadata of relationsMetadata) {
      switch (relationMetadata.type) {
        case "requiredBelongsTo":
          const matchingRelations = pickByPath(result, relationMetadata.path);
          if (!matchingRelations.length) {
            continue;
          }

          const relationPermissions = this.permissionsConfig[relationMetadata.modelName];

          if (!relationPermissions.read) {
            throw new ReferentialIntegrityError();
          } else if (relationPermissions.read === true) {
            continue;
          }

          const uniqueField = getUniqueField(this.fieldsMap[relationMetadata.modelName]);
          const uniqueFieldValues = uniqueArray(matchingRelations.map((relation) => relation[uniqueField.name]));

          const allowedCount = await transactionClient[lowerFirst(relationMetadata.modelName)].count({
            where: mergeWhere(
              { [uniqueField.name]: { in: uniqueFieldValues } },
              await resolvePermissionDefinition(relationPermissions.read, this.context),
            ),
          });

          if (uniqueFieldValues.length !== allowedCount) {
            throw new ReferentialIntegrityError();
          }

          break;
        default:
          throw new Error(`Failed to resolve the relation metadata type '${relationMetadata.type}' during relation processing`);
      }
    }

    return result;
  }
}
