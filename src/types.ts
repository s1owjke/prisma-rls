import type { DMMF } from "@prisma/client/runtime/library";

export type PrismaTypeMap = {
  model: Record<string, any>;
};

export type PrismaModelName<TypeMap extends PrismaTypeMap> = keyof TypeMap["model"];

export type PrismaModelWhere<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>> = NonNullable<
  TypeMap["model"][ModelName]["operations"]["findMany"]["args"]["where"]
>;

export type ModelPermissionsConfig<TypeMap extends PrismaTypeMap, ModelName extends PrismaModelName<TypeMap>, Context extends unknown> = {
  read: boolean | PrismaModelWhere<TypeMap, ModelName> | ((context: Context) => PrismaModelWhere<TypeMap, ModelName>);
  create: boolean;
  update: boolean | PrismaModelWhere<TypeMap, ModelName> | ((context: Context) => PrismaModelWhere<TypeMap, ModelName>);
  delete: boolean | PrismaModelWhere<TypeMap, ModelName> | ((context: Context) => PrismaModelWhere<TypeMap, ModelName>);
};

export type PermissionsConfig<TypeMap extends PrismaTypeMap, Context extends unknown> = {
  [ModelName in PrismaModelName<TypeMap>]: ModelPermissionsConfig<TypeMap, ModelName, Context>;
};

export type AllOperationsArgs = {
  operation: string;
  model: string;
  args: Record<string, any>;
  query: (args: Record<string, any>) => Promise<unknown>;
};

export type FieldsMap = Record<string, Record<string, DMMF.Field>>;
