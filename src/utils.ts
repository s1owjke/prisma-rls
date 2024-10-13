import type { BaseDMMF, DMMF } from "@prisma/client/runtime/library";

import type { FieldsMap, PermissionsConfig, PrismaTypeMap } from "./types";

export const buildFieldsMap = (dmmf: BaseDMMF): FieldsMap => {
  const fieldsMap: FieldsMap = {};

  for (const model of dmmf.datamodel.models) {
    fieldsMap[model.name] = {};
    for (const field of model.fields) {
      fieldsMap[model.name][field.name] = field;
    }
  }

  return fieldsMap;
};

const mapValues = async <T extends Record<string, any>>(object: T, iteratee: (value: T[keyof T], key: keyof T) => Promise<T[keyof T]>) => {
  return Object.fromEntries(await Promise.all(Object.entries(object).map(async ([key, value]) => [key, await iteratee(value, key)])));
};

const transformValue = <T extends any>(value: T | T[], callback: (value: T) => Promise<T>) => {
  return Array.isArray(value) ? Promise.all(value.map(callback)) : callback(value);
};

export const generateImpossibleWhere = (fields: Record<string, DMMF.Field>): Record<string, any> => {
  const targetField = Object.values(fields).find((field) => field.isId || field.isUnique);
  if (!targetField) {
    throw new Error("Couldn't find required id or unique field");
  }

  switch (targetField.type) {
    case "Boolean":
      return { AND: [{ [targetField.name]: { equals: true } }, { [targetField.name]: { not: { equals: false } } }] };
    case "BigInt":
    case "Decimal":
    case "Float":
    case "Int":
      return { AND: [{ [targetField.name]: { equals: 0 } }, { [targetField.name]: { not: { equals: 0 } } }] };
    case "String":
      return { AND: [{ [targetField.name]: { equals: "" } }, { [targetField.name]: { not: { equals: "" } } }] };
    case "Bytes":
      const buffer = Buffer.from([]);
      return { AND: [{ [targetField.name]: { equals: buffer } }, { [targetField.name]: { not: { equals: buffer } } }] };
    case "DateTime":
      const date = new Date();
      return { AND: [{ [targetField.name]: { equals: date } }, { [targetField.name]: { not: { equals: date } } }] };
    case "JSON":
      return { AND: [{ [targetField.name]: { equals: null } }, { [targetField.name]: { not: { equals: null } } }] };
    default:
      throw new Error("Unsupported data type");
  }
};

const mergeWhere = (first: Record<string, any> | undefined, second: Record<string, any>): Record<string, any> => {
  return first ? { AND: [first, second] } : second;
};

const mergeWhereUnique = (
  fieldsMap: FieldsMap,
  modelName: string,
  firstUnique: Record<string, any>,
  second: Record<string, any>,
): Record<string, any> => {
  const unique: Record<string, any> = {};
  const rest: Record<string, any> = {};

  for (const [fieldName, fieldValue] of Object.entries(firstUnique)) {
    const fieldDef = fieldsMap[modelName][fieldName];

    if (fieldDef.isId || fieldDef.isUnique) {
      unique[fieldName] = fieldValue;
    } else {
      rest[fieldName] = fieldValue;
    }
  }

  return { ...unique, AND: [rest, second] };
};

const generateModelRelationsCount = async (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  fieldsMap: FieldsMap,
  modelName: string,
): Promise<Record<string, any>> => {
  const select: Record<string, any> = {};

  for (const [fieldName, fieldDef] of Object.entries(fieldsMap[modelName])) {
    if (fieldDef.kind === "object" && fieldDef.isList) {
      const relationModelName = fieldDef.type;
      const relationPermissions = permissionsConfig[relationModelName];

      select[fieldName] = { where: await resolvePermissionDefinition(relationPermissions.read, context) };
    }
  }

  return select;
};

const resolvePermissionDefinition = async (
  permissionDefinition: boolean | Record<string, any> | ((context: unknown) => Record<string, any>),
  context: unknown,
): Promise<Record<string, any>> => {
  return typeof permissionDefinition === "function" ? await permissionDefinition(context) : permissionDefinition;
};

export const resolveWhere = async (
  permissionDefinition: boolean | Record<string, any> | ((context: unknown) => Record<string, any>),
  context: unknown,
  fieldsMap: FieldsMap,
  modelName: string,
  where: Record<string, any>,
) => {
  if (!permissionDefinition) {
    return mergeWhere(where, generateImpossibleWhere(fieldsMap[modelName]));
  } else if (permissionDefinition === true) {
    return where;
  } else {
    return mergeWhere(where, await resolvePermissionDefinition(permissionDefinition, context));
  }
};

export const resolveWhereUnique = async (
  permissionDefinition: boolean | Record<string, any> | ((context: unknown) => Record<string, any>),
  context: unknown,
  fieldsMap: FieldsMap,
  modelName: string,
  whereUnique: Record<string, any>,
) => {
  if (!permissionDefinition) {
    return mergeWhereUnique(fieldsMap, modelName, whereUnique, generateImpossibleWhere(fieldsMap[modelName]));
  } else if (permissionDefinition === true) {
    return whereUnique;
  } else {
    return mergeWhereUnique(fieldsMap, modelName, whereUnique, await resolvePermissionDefinition(permissionDefinition, context));
  }
};

const resolveRelationSelect = async (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  authorizationError: Error,
  fieldsMap: FieldsMap,
  modelName: string,
  select: Record<string, any>,
): Promise<Record<string, any>> => {
  return mapValues(select, async (selectValue, selectName) => {
    if (selectName === "_count") {
      if (selectValue === true) {
        return { select: generateModelRelationsCount(permissionsConfig, context, fieldsMap, modelName) };
      } else if (selectValue !== false && selectValue.select) {
        return { select: await resolveRelationSelect(permissionsConfig, context, authorizationError, fieldsMap, modelName, selectValue.select) };
      } else {
        return selectValue;
      }
    }

    const fieldDef = fieldsMap[modelName][selectName];
    if (fieldDef.kind !== "object") {
      return selectValue;
    }

    const relationModelName = fieldDef.type;
    const relationPermissions = permissionsConfig[relationModelName];

    if (fieldDef.isList) {
      if (!relationPermissions.read) {
        return { where: generateImpossibleWhere(fieldsMap[modelName]) };
      } else if (relationPermissions.read !== true && selectValue === true) {
        return { where: await resolvePermissionDefinition(relationPermissions.read, context) }; //
      } else if (relationPermissions.read !== true && selectValue !== false) {
        const [selectAndInclude, permissionDefinition] = await Promise.all([
          resolveSelectAndInclude(
            permissionsConfig,
            context,
            authorizationError,
            fieldsMap,
            relationModelName,
            selectValue.select,
            selectValue.include,
          ),
          resolvePermissionDefinition(relationPermissions.read, context),
        ]);

        return {
          ...selectValue,
          ...selectAndInclude,
          where: mergeWhere(selectValue.where, permissionDefinition),
        };
      }
    } else {
      const foreignKeys = fieldDef.relationFromFields?.map((relationFromField) => fieldsMap[modelName][relationFromField]) || [];

      if (foreignKeys.every((foreignKey) => foreignKey.isRequired) && relationPermissions.read !== true && selectValue !== false) {
        return {
          ...selectValue,
          ...(await resolveSelectAndInclude(
            permissionsConfig,
            context,
            authorizationError,
            fieldsMap,
            relationModelName,
            selectValue.select,
            selectValue.include,
          )),
        };
      }
    }

    return selectValue;
  });
};

export const resolveSelectAndInclude = async (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  authorizationError: Error,
  fieldsMap: FieldsMap,
  modelName: string,
  select: Record<string, any> | undefined,
  include: Record<string, any> | undefined,
): Promise<Record<string, any>> => {
  if (select) {
    return { select: await resolveRelationSelect(permissionsConfig, context, authorizationError, fieldsMap, modelName, select) };
  } else if (include) {
    return { include: await resolveRelationSelect(permissionsConfig, context, authorizationError, fieldsMap, modelName, include) };
  } else {
    return {};
  }
};

export const resolveCreate = async (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  authorizationError: Error,
  fieldsMap: FieldsMap,
  modelName: string,
  data: Record<string, any>,
): Promise<Record<string, any>> => {
  return mapValues(data, async (dataValue, dataName) => {
    const fieldDef = fieldsMap[modelName][dataName];
    if (fieldDef.kind !== "object") {
      return dataValue;
    }

    const relationModelName = fieldDef.type;
    const relationPermissions = permissionsConfig[relationModelName];

    if (fieldDef.isList) {
      return mapValues(dataValue, async (actionValue, actionName) => {
        switch (actionName) {
          case "create":
            if (!relationPermissions.create) {
              throw authorizationError;
            } else {
              return transformValue(actionValue, async (value) => {
                return resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value);
              });
            }
          case "createMany":
            if (!relationPermissions.create) {
              throw authorizationError;
            }
            break;
          case "connectOrCreate":
            if (!relationPermissions.create) {
              throw authorizationError;
            } else if (!relationPermissions.read) {
              return transformValue(actionValue, async (value) => {
                return {
                  create: await resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  where: mergeWhereUnique(fieldsMap, relationModelName, value.where, generateImpossibleWhere(fieldsMap[relationModelName])),
                };
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, async (value) => {
                const [create, permissionDefinition] = await Promise.all([
                  resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  resolvePermissionDefinition(relationPermissions.read, context),
                ]);

                return { create, where: mergeWhereUnique(fieldsMap, relationModelName, value.where, permissionDefinition) };
              });
            } else {
              return transformValue(actionValue, async (value) => {
                return {
                  create: await resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value),
                  where: value.where,
                };
              });
            }
          case "connect":
            if (!relationPermissions.read) {
              return transformValue(actionValue, async (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, generateImpossibleWhere(fieldsMap[relationModelName]));
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, async (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, await resolvePermissionDefinition(relationPermissions.read, context));
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
              throw authorizationError;
            } else {
              return resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue);
            }
          case "connectOrCreate":
            if (!relationPermissions.create) {
              throw authorizationError;
            } else if (!relationPermissions.read) {
              return {
                create: await resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, generateImpossibleWhere(fieldsMap[relationModelName])),
              };
            } else if (relationPermissions.read !== true) {
              const [create, permissionDefinition] = await Promise.all([
                resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                resolvePermissionDefinition(relationPermissions.read, context),
              ]);

              return { create, where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, permissionDefinition) };
            } else {
              return {
                create: await resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: actionValue.where,
              };
            }
          case "connect":
            if (!relationPermissions.read) {
              return mergeWhereUnique(fieldsMap, relationModelName, actionValue, generateImpossibleWhere(fieldsMap[relationModelName]));
            } else if (relationPermissions.read !== true) {
              return mergeWhereUnique(
                fieldsMap,
                relationModelName,
                actionValue,
                await resolvePermissionDefinition(relationPermissions.read, context),
              );
            }
            break;
          default:
            throw new Error("Not implemented");
        }

        return actionValue;
      });
    }
  });
};

export const resolveUpdate = async (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  authorizationError: Error,
  fieldsMap: FieldsMap,
  modelName: string,
  data: Record<string, any>,
): Promise<Record<string, any>> => {
  return mapValues(data, async (dataValue, dataName) => {
    const fieldDef = fieldsMap[modelName][dataName];
    if (fieldDef.kind !== "object") {
      return dataValue;
    }

    const relationModelName = fieldDef.type;
    const relationPermissions = permissionsConfig[relationModelName];

    if (fieldDef.isList) {
      return mapValues(dataValue, async (actionValue, actionName) => {
        switch (actionName) {
          case "create":
            if (!relationPermissions.create) {
              throw authorizationError;
            } else {
              return transformValue(actionValue, async (value) => {
                return resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value);
              });
            }
          case "createMany":
            if (!relationPermissions.create) {
              throw authorizationError;
            }
            break;
          case "connectOrCreate":
            if (!relationPermissions.create) {
              throw authorizationError;
            } else if (!relationPermissions.read) {
              return transformValue(actionValue, async (value) => {
                return {
                  create: await resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  where: mergeWhereUnique(fieldsMap, relationModelName, value.where, generateImpossibleWhere(fieldsMap[relationModelName])),
                };
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, async (value) => {
                const [create, permissionDefinition] = await Promise.all([
                  resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  resolvePermissionDefinition(relationPermissions.read, context),
                ]);

                return { create, where: mergeWhereUnique(fieldsMap, relationModelName, value.where, permissionDefinition) };
              });
            } else {
              return transformValue(actionValue, async (value) => {
                return {
                  create: await resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  where: value.where,
                };
              });
            }
          case "set":
          case "connect":
          case "disconnect":
            if (!relationPermissions.read) {
              return transformValue(actionValue, async (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, generateImpossibleWhere(fieldsMap[relationModelName]));
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, async (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, await resolvePermissionDefinition(relationPermissions.read, context));
              });
            }
            break;
          case "update":
            if (!relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true) {
              return transformValue(actionValue, async (value) => {
                const [data, permissionDefinition] = await Promise.all([
                  resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.data),
                  resolvePermissionDefinition(relationPermissions.update, context),
                ]);

                return { data, where: mergeWhereUnique(fieldsMap, relationModelName, value.where, permissionDefinition) };
              });
            } else {
              return transformValue(actionValue, async (value) => {
                return {
                  data: await resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.data),
                  where: value.where,
                };
              });
            }
          case "updateMany":
            if (!relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true) {
              return transformValue(actionValue, async (value) => {
                return {
                  data: value.data,
                  where: mergeWhere(value.where, await resolvePermissionDefinition(relationPermissions.update, context)),
                };
              });
            }
            break;
          case "upsert":
            if (!relationPermissions.create || !relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true) {
              return transformValue(actionValue, async (value) => {
                const [create, update, permissionDefinition] = await Promise.all([
                  resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.update),
                  resolvePermissionDefinition(relationPermissions.update, context),
                ]);

                return { create, update, where: mergeWhereUnique(fieldsMap, relationModelName, value.where, permissionDefinition) };
              });
            } else {
              return transformValue(actionValue, async (value) => {
                const [create, update] = await Promise.all([
                  resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.update),
                ]);

                return { create, update, where: value.where };
              });
            }
          case "delete":
            if (!relationPermissions.delete) {
              throw authorizationError;
            } else if (relationPermissions.delete !== true) {
              return transformValue(actionValue, async (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, await resolvePermissionDefinition(relationPermissions.delete, context));
              });
            }
            break;
          case "deleteMany":
            if (!relationPermissions.delete) {
              throw authorizationError;
            } else if (relationPermissions.delete !== true) {
              return transformValue(actionValue, async (value) => {
                return mergeWhere(value, await resolvePermissionDefinition(relationPermissions.delete, context));
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
              throw authorizationError;
            } else {
              return resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue);
            }
          case "connectOrCreate":
            if (!relationPermissions.create) {
              throw authorizationError;
            } else if (!relationPermissions.read) {
              return {
                create: await resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, generateImpossibleWhere(fieldsMap[relationModelName])),
              };
            } else if (relationPermissions.read !== true) {
              const [create, permissionDefinition] = await Promise.all([
                resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                resolvePermissionDefinition(relationPermissions.read, context),
              ]);

              return { create, where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, permissionDefinition) };
            } else {
              return {
                create: await resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: actionValue.where,
              };
            }
          case "connect":
            if (!relationPermissions.read) {
              return mergeWhereUnique(fieldsMap, relationModelName, actionValue, generateImpossibleWhere(fieldsMap[relationModelName]));
            } else if (relationPermissions.read !== true) {
              return mergeWhereUnique(
                fieldsMap,
                relationModelName,
                actionValue,
                await resolvePermissionDefinition(relationPermissions.read, context),
              );
            }
            break;
          case "disconnect":
            if (!relationPermissions.read) {
              return mergeWhere(actionValue, generateImpossibleWhere(fieldsMap[relationModelName]));
            } else if (relationPermissions.read !== true && actionValue === true) {
              return resolvePermissionDefinition(relationPermissions.read, context);
            } else if (relationPermissions.read !== true && actionValue !== true) {
              return mergeWhere(actionValue, await resolvePermissionDefinition(relationPermissions.read, context));
            }
            break;
          case "update":
            if (!relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true && !actionValue.hasOwnProperty("data")) {
              const [data, where] = await Promise.all([
                resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue),
                resolvePermissionDefinition(relationPermissions.update, context),
              ]);

              return { data, where };
            } else if (relationPermissions.update !== true && !actionValue.where) {
              const [data, where] = await Promise.all([
                resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.data),
                resolvePermissionDefinition(relationPermissions.update, context),
              ]);

              return { data, where };
            } else if (relationPermissions.update !== true) {
              const [data, permissionDefinition] = await Promise.all([
                resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.data),
                resolvePermissionDefinition(relationPermissions.update, context),
              ]);

              return { data, where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, permissionDefinition) };
            } else if (!actionValue.hasOwnProperty("data")) {
              return resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue);
            } else {
              return {
                data: await resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.data),
                where: actionValue.where,
              };
            }
          case "upsert":
            if (!relationPermissions.create || !relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true && !actionValue.where) {
              const [create, update, where] = await Promise.all([
                resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.update),
                resolvePermissionDefinition(relationPermissions.update, context),
              ]);

              return { create, update, where };
            } else if (relationPermissions.update !== true) {
              const [create, update, permissionDefinition] = await Promise.all([
                resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.update),
                resolvePermissionDefinition(relationPermissions.update, context),
              ]);

              return { create, update, where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, permissionDefinition) };
            } else {
              const [create, update] = await Promise.all([
                resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.update),
              ]);

              return { create, update, where: actionValue.where };
            }
          case "delete":
            if (!relationPermissions.delete) {
              throw authorizationError;
            } else if (relationPermissions.delete !== true && actionValue === true) {
              return resolvePermissionDefinition(relationPermissions.delete, context);
            } else if (relationPermissions.delete !== true && actionValue !== true) {
              return mergeWhere(actionValue, await resolvePermissionDefinition(relationPermissions.delete, context));
            }
            break;
          default:
            throw new Error("Not implemented");
        }

        return actionValue;
      });
    }
  });
};
