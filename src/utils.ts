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

const mapValues = <T extends Record<string, any>>(object: T, iteratee: (value: T[keyof T], key: keyof T) => T[keyof T]) => {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, iteratee(value, key)]));
};

const transformValue = <T extends any>(value: T | T[], callback: (value: T) => T) => {
  return Array.isArray(value) ? value.map(callback) : callback(value);
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

const generateModelRelationsCount = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  fieldsMap: FieldsMap,
  modelName: string,
): Record<string, any> => {
  const select: Record<string, any> = {};

  for (const [fieldName, fieldDef] of Object.entries(fieldsMap[modelName])) {
    if (fieldDef.kind === "object" && fieldDef.isList) {
      const relationModelName = fieldDef.type;
      const relationPermissions = permissionsConfig[relationModelName];

      select[fieldName] = { where: resolvePermissionDefinition(relationPermissions.read, context) };
    }
  }

  return select;
};

const resolvePermissionDefinition = (
  permissionDefinition: boolean | Record<string, any> | ((context: unknown) => Record<string, any>),
  context: unknown,
): Record<string, any> => {
  return typeof permissionDefinition === "function" ? permissionDefinition(context) : permissionDefinition;
};

export const resolveWhere = (
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
    return mergeWhere(where, resolvePermissionDefinition(permissionDefinition, context));
  }
};

export const resolveWhereUnique = (
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
    return mergeWhereUnique(fieldsMap, modelName, whereUnique, resolvePermissionDefinition(permissionDefinition, context));
  }
};

const resolveRelationSelect = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  authorizationError: Error,
  fieldsMap: FieldsMap,
  modelName: string,
  select: Record<string, any>,
): Record<string, any> => {
  return mapValues(select, (selectValue, selectName) => {
    if (selectName === "_count") {
      if (selectValue === true) {
        return { select: generateModelRelationsCount(permissionsConfig, context, fieldsMap, modelName) };
      } else if (selectValue !== false && selectValue.select) {
        return { select: resolveRelationSelect(permissionsConfig, context, authorizationError, fieldsMap, modelName, selectValue.select) };
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
        return { where: resolvePermissionDefinition(relationPermissions.read, context) }; //
      } else if (relationPermissions.read !== true && selectValue !== false) {
        return {
          ...selectValue,
          ...resolveSelectAndInclude(
            permissionsConfig,
            context,
            authorizationError,
            fieldsMap,
            relationModelName,
            selectValue.select,
            selectValue.include,
          ),
          where: mergeWhere(selectValue.where, resolvePermissionDefinition(relationPermissions.read, context)),
        };
      }
    } else {
      const foreignKeys = fieldDef.relationFromFields?.map((relationFromField) => fieldsMap[modelName][relationFromField]) || [];

      if (foreignKeys.every((foreignKey) => foreignKey.isRequired) && relationPermissions.read !== true && selectValue !== false) {
        return {
          ...selectValue,
          ...resolveSelectAndInclude(
            permissionsConfig,
            context,
            authorizationError,
            fieldsMap,
            relationModelName,
            selectValue.select,
            selectValue.include,
          ),
        };
      }
    }

    return selectValue;
  });
};

export const resolveSelectAndInclude = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  authorizationError: Error,
  fieldsMap: FieldsMap,
  modelName: string,
  select: Record<string, any> | undefined,
  include: Record<string, any> | undefined,
): Record<string, any> => {
  if (select) {
    return { select: resolveRelationSelect(permissionsConfig, context, authorizationError, fieldsMap, modelName, select) };
  } else if (include) {
    return { include: resolveRelationSelect(permissionsConfig, context, authorizationError, fieldsMap, modelName, include) };
  } else {
    return {};
  }
};

export const resolveCreate = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  authorizationError: Error,
  fieldsMap: FieldsMap,
  modelName: string,
  data: Record<string, any>,
): Record<string, any> => {
  return mapValues(data, (dataValue, dataName) => {
    const fieldDef = fieldsMap[modelName][dataName];
    if (fieldDef.kind !== "object") {
      return dataValue;
    }

    const relationModelName = fieldDef.type;
    const relationPermissions = permissionsConfig[relationModelName];

    if (fieldDef.isList) {
      return mapValues(dataValue, (actionValue, actionName) => {
        switch (actionName) {
          case "create":
            if (!relationPermissions.create) {
              throw authorizationError;
            } else {
              return transformValue(actionValue, (value) => {
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
              return transformValue(actionValue, (value) => {
                return {
                  create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  where: mergeWhereUnique(fieldsMap, relationModelName, value.where, generateImpossibleWhere(fieldsMap[relationModelName])),
                };
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, (value) => {
                return {
                  create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  where: mergeWhereUnique(fieldsMap, relationModelName, value.where, resolvePermissionDefinition(relationPermissions.read, context)),
                };
              });
            } else {
              return transformValue(actionValue, (value) => {
                return {
                  create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value),
                  where: value.where,
                };
              });
            }
          case "connect":
            if (!relationPermissions.read) {
              return transformValue(actionValue, (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, generateImpossibleWhere(fieldsMap[relationModelName]));
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, resolvePermissionDefinition(relationPermissions.read, context));
              });
            }
            break;
          default:
            throw new Error("Not implemented");
        }

        return actionValue;
      });
    } else {
      return mapValues(dataValue, (actionValue, actionName) => {
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
                create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, generateImpossibleWhere(fieldsMap[relationModelName])),
              };
            } else if (relationPermissions.read !== true) {
              return {
                create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: mergeWhereUnique(
                  fieldsMap,
                  relationModelName,
                  actionValue.where,
                  resolvePermissionDefinition(relationPermissions.read, context),
                ),
              };
            } else {
              return {
                create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: actionValue.where,
              };
            }
          case "connect":
            if (!relationPermissions.read) {
              return mergeWhereUnique(fieldsMap, relationModelName, actionValue, generateImpossibleWhere(fieldsMap[relationModelName]));
            } else if (relationPermissions.read !== true) {
              return mergeWhereUnique(fieldsMap, relationModelName, actionValue, resolvePermissionDefinition(relationPermissions.read, context));
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

export const resolveUpdate = (
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>,
  context: unknown,
  authorizationError: Error,
  fieldsMap: FieldsMap,
  modelName: string,
  data: Record<string, any>,
): Record<string, any> => {
  return mapValues(data, (dataValue, dataName) => {
    const fieldDef = fieldsMap[modelName][dataName];
    if (fieldDef.kind !== "object") {
      return dataValue;
    }

    const relationModelName = fieldDef.type;
    const relationPermissions = permissionsConfig[relationModelName];

    if (fieldDef.isList) {
      return mapValues(dataValue, (actionValue, actionName) => {
        switch (actionName) {
          case "create":
            if (!relationPermissions.create) {
              throw authorizationError;
            } else {
              return transformValue(actionValue, (value) => {
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
              return transformValue(actionValue, (value) => {
                return {
                  create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  where: mergeWhereUnique(fieldsMap, relationModelName, value.where, generateImpossibleWhere(fieldsMap[relationModelName])),
                };
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, (value) => {
                return {
                  create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  where: mergeWhereUnique(fieldsMap, relationModelName, value.where, resolvePermissionDefinition(relationPermissions.read, context)),
                };
              });
            } else {
              return transformValue(actionValue, (value) => {
                return {
                  create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  where: value.where,
                };
              });
            }
          case "set":
          case "connect":
          case "disconnect":
            if (!relationPermissions.read) {
              return transformValue(actionValue, (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, generateImpossibleWhere(fieldsMap[relationModelName]));
              });
            } else if (relationPermissions.read !== true) {
              return transformValue(actionValue, (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, resolvePermissionDefinition(relationPermissions.read, context));
              });
            }
            break;
          case "update":
            if (!relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true) {
              return transformValue(actionValue, (value) => {
                return {
                  data: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.data),
                  where: mergeWhereUnique(
                    fieldsMap,
                    relationModelName,
                    value.where,
                    resolvePermissionDefinition(relationPermissions.update, context),
                  ),
                };
              });
            } else {
              return transformValue(actionValue, (value) => {
                return {
                  data: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.data),
                  where: value.where,
                };
              });
            }
          case "updateMany":
            if (!relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true) {
              return transformValue(actionValue, (value) => {
                return {
                  data: value.data,
                  where: mergeWhere(value.where, resolvePermissionDefinition(relationPermissions.update, context)),
                };
              });
            }
            break;
          case "upsert":
            if (!relationPermissions.create || !relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true) {
              return transformValue(actionValue, (value) => {
                return {
                  create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  update: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.update),
                  where: mergeWhereUnique(
                    fieldsMap,
                    relationModelName,
                    value.where,
                    resolvePermissionDefinition(relationPermissions.update, context),
                  ),
                };
              });
            } else {
              return transformValue(actionValue, (value) => {
                return {
                  create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.create),
                  update: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, value.update),
                  where: value.where,
                };
              });
            }
          case "delete":
            if (!relationPermissions.delete) {
              throw authorizationError;
            } else if (relationPermissions.delete !== true) {
              return transformValue(actionValue, (value) => {
                return mergeWhereUnique(fieldsMap, relationModelName, value, resolvePermissionDefinition(relationPermissions.delete, context));
              });
            }
            break;
          case "deleteMany":
            if (!relationPermissions.delete) {
              throw authorizationError;
            } else if (relationPermissions.delete !== true) {
              return transformValue(actionValue, (value) => {
                return mergeWhere(value, resolvePermissionDefinition(relationPermissions.delete, context));
              });
            }
            break;
          default:
            throw new Error("Not implemented");
        }

        return actionValue;
      });
    } else {
      return mapValues(dataValue, (actionValue, actionName) => {
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
                create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: mergeWhereUnique(fieldsMap, relationModelName, actionValue.where, generateImpossibleWhere(fieldsMap[relationModelName])),
              };
            } else if (relationPermissions.read !== true) {
              return {
                create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: mergeWhereUnique(
                  fieldsMap,
                  relationModelName,
                  actionValue.where,
                  resolvePermissionDefinition(relationPermissions.read, context),
                ),
              };
            } else {
              return {
                create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                where: actionValue.where,
              };
            }
          case "connect":
            if (!relationPermissions.read) {
              return mergeWhereUnique(fieldsMap, relationModelName, actionValue, generateImpossibleWhere(fieldsMap[relationModelName]));
            } else if (relationPermissions.read !== true) {
              return mergeWhereUnique(fieldsMap, relationModelName, actionValue, resolvePermissionDefinition(relationPermissions.read, context));
            }
            break;
          case "disconnect":
            if (!relationPermissions.read) {
              return mergeWhere(actionValue, generateImpossibleWhere(fieldsMap[relationModelName]));
            } else if (relationPermissions.read !== true && actionValue === true) {
              return resolvePermissionDefinition(relationPermissions.read, context);
            } else if (relationPermissions.read !== true && actionValue !== true) {
              return mergeWhere(actionValue, resolvePermissionDefinition(relationPermissions.read, context));
            }
            break;
          case "update":
            if (!relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true && !actionValue.hasOwnProperty("data")) {
              return {
                data: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue),
                where: resolvePermissionDefinition(relationPermissions.update, context),
              };
            } else if (relationPermissions.update !== true && !actionValue.where) {
              return {
                data: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.data),
                where: resolvePermissionDefinition(relationPermissions.update, context),
              };
            } else if (relationPermissions.update !== true) {
              return {
                data: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.data),
                where: mergeWhereUnique(
                  fieldsMap,
                  relationModelName,
                  actionValue.where,
                  resolvePermissionDefinition(relationPermissions.update, context),
                ),
              };
            } else if (!actionValue.hasOwnProperty("data")) {
              return resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue);
            } else {
              return {
                data: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.data),
                where: actionValue.where,
              };
            }
          case "upsert":
            if (!relationPermissions.create || !relationPermissions.update) {
              throw authorizationError;
            } else if (relationPermissions.update !== true && !actionValue.where) {
              return {
                create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                update: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.update),
                where: resolvePermissionDefinition(relationPermissions.update, context),
              };
            } else if (relationPermissions.update !== true) {
              return {
                create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                update: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.update),
                where: mergeWhereUnique(
                  fieldsMap,
                  relationModelName,
                  actionValue.where,
                  resolvePermissionDefinition(relationPermissions.update, context),
                ),
              };
            } else {
              return {
                create: resolveCreate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.create),
                update: resolveUpdate(permissionsConfig, context, authorizationError, fieldsMap, relationModelName, actionValue.update),
                where: actionValue.where,
              };
            }
          case "delete":
            if (!relationPermissions.delete) {
              throw authorizationError;
            } else if (relationPermissions.delete !== true && actionValue === true) {
              return resolvePermissionDefinition(relationPermissions.delete, context);
            } else if (relationPermissions.delete !== true && actionValue !== true) {
              return mergeWhere(actionValue, resolvePermissionDefinition(relationPermissions.delete, context));
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
