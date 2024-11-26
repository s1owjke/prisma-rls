import { ModelPermissionsConfig, PrismaModelName, PrismaTypeMap } from "../src/types";

export type PartialPermissionsConfig<TypeMap extends PrismaTypeMap, Context extends unknown> = Partial<{
  [ModelName in PrismaModelName<TypeMap>]: Partial<ModelPermissionsConfig<TypeMap, ModelName, Context>>;
}>;
