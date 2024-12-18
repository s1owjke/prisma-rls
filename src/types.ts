import type { BaseDMMF, DMMF } from "@prisma/client/runtime/library";

export type PrismaTypeMap = {
  model: Record<string, any>;
};

export type PrismaModelName<TypeMap extends PrismaTypeMap> = keyof TypeMap["model"];

export type PrismaModelWhere<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>> = NonNullable<
  TypeMap["model"][ModelName]["operations"]["findMany"]["args"]["where"]
>;

export type PrismaModelWhereResolver<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>, Context extends unknown> = (
  context: Context,
) => PrismaModelWhere<TypeMap, ModelName> | Promise<PrismaModelWhere<TypeMap, ModelName>>;

export type PermissionDefinition<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>, Context extends unknown> =
  | boolean
  | PrismaModelWhere<TypeMap, ModelName>
  | PrismaModelWhereResolver<TypeMap, ModelName, Context>;

export type ModelPermissionsConfig<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>, Context extends unknown> = {
  read: PermissionDefinition<TypeMap, ModelName, Context>;
  create: boolean;
  update: PermissionDefinition<TypeMap, ModelName, Context>;
  delete: PermissionDefinition<TypeMap, ModelName, Context>;
};

export type PermissionsConfig<TypeMap extends PrismaTypeMap, Context extends unknown> = {
  [ModelName in PrismaModelName<TypeMap>]: ModelPermissionsConfig<TypeMap, ModelName, Context>;
};

export type ExtensionOptions = {
  dmmf: BaseDMMF;
  permissionsConfig: PermissionsConfig<PrismaTypeMap, unknown>;
  context: unknown;
  authorizationError?: Error;
  checkRequiredBelongsTo?: boolean;
};

export type AllOperationsArgs = {
  operation: string;
  model: PrismaModelName<PrismaTypeMap>;
  args: Record<string, any>;
  query: (args: Record<string, any>) => Promise<unknown>;
};

export type FieldsMap = Record<string, Record<string, DMMF.Field>>;

export type RelationMetadata = {
  type: "requiredBelongsTo";
  path: string;
  modelName: PrismaModelName<PrismaTypeMap>;
};

export type RecursiveContext = {
  path: string;
};
