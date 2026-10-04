import { Command, COMMAND_RETURN } from "@collidor/command";
import {
  s,
  CapabilityValidator,
  type BaseSchema,
  type StructuralCapability,
  type CapabilityFieldRequirement,
} from "@collidor/struct";

export interface StandardSchemaV1Issue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

export interface StandardSchemaV1Result<Output = unknown> {
  readonly value?: Output;
  readonly issues?: ReadonlyArray<StandardSchemaV1Issue>;
}

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
      options?: Record<string, unknown>,
    ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
    readonly types?: {
      readonly input: Input;
      readonly output: Output;
    } | undefined;
  };
}

export type ValidateResult<Output = unknown> =
  | { value: Output; issues?: undefined }
  | { value?: undefined; issues: ReadonlyArray<StandardSchemaV1Issue> };

export type AnyStructSchema =
  | BaseSchema<any, any>
  | StandardSchemaV1<any, any>
  | {
      parse(input: unknown): any;
      _output?: any;
      _input?: any;
      "~standard"?: StandardSchemaV1<any, any>["~standard"];
    };

export type AnyCommandInput = AnyStructSchema | StructuralCapability;

export function isStructuralCapability(value: unknown): value is StructuralCapability {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as any).name === "string" &&
    "fields" in value &&
    Array.isArray((value as any).fields)
  );
}

export function capabilityToStruct(capability: StructuralCapability): BaseSchema<any, any> {
  const shape: Record<string, BaseSchema<any, any>> = {};
  for (const field of capability.fields) {
    const kinds = Array.isArray(field.kind) ? field.kind : [field.kind];
    let fieldSchema: BaseSchema<any, any>;
    if (kinds.includes("string")) {
      fieldSchema = s.string();
    } else if (kinds.includes("number") || kinds.includes("integer")) {
      fieldSchema = s.number();
    } else if (kinds.includes("boolean")) {
      fieldSchema = s.boolean();
    } else if (kinds.includes("date")) {
      fieldSchema = s.date();
    } else if (kinds.includes("bigint")) {
      fieldSchema = s.bigint();
    } else {
      fieldSchema = s.any();
    }

    if (field.optional) {
      fieldSchema = (fieldSchema as any).optional();
    }
    shape[field.name] = fieldSchema;
  }
  const structSchema = s.struct(shape) as any;
  structSchema.capability = capability;
  return structSchema;
}

export type InferCapabilityField<T extends CapabilityFieldRequirement> =
  T["kind"] extends "string"
    ? string
    : T["kind"] extends "number" | "integer"
      ? number
      : T["kind"] extends ("number" | "integer")[]
        ? number
        : T["kind"] extends "boolean"
          ? boolean
          : T["kind"] extends "date"
            ? Date
            : T["kind"] extends "bigint"
              ? bigint
              : any;

export type StandardCapabilityTypes = {
  HasPosition: { x: number; y: number; z?: number };
  HasHealth: { hp: number; max_hp?: number };
  HasVelocity: { vx: number; vy: number };
  HasCombatant: { name: string; initiative?: number; is_active?: boolean };
};

export type InferCapability<T extends StructuralCapability> =
  T["name"] extends keyof StandardCapabilityTypes
    ? StandardCapabilityTypes[T["name"]]
    : T extends { fields: ReadonlyArray<infer F> }
      ? F extends { name: infer N extends string }
        ? string extends N
          ? Record<string, any>
          : { [K in N]: any }
        : Record<string, any>
      : Record<string, any>;

export type InferSchemaOutput<T> = T extends StructuralCapability
  ? InferCapability<T>
  : T extends BaseSchema<any, infer O>
    ? O
    : T extends StandardSchemaV1<any, infer O>
      ? O
      : T extends { _output: infer O }
        ? O
        : T extends { "~standard": { types?: { output: infer O } } }
          ? O
          : T extends { parse(input: unknown): infer O }
            ? O
            : any;

export type InferSchemaInput<T> = T extends StructuralCapability
  ? InferCapability<T>
  : T extends BaseSchema<infer I, any>
    ? I
    : T extends StandardSchemaV1<infer I, any>
      ? I
      : T extends { _input: infer I }
        ? I
        : T extends { "~standard": { types?: { input: infer I } } }
          ? I
          : InferSchemaOutput<T>;

export type CapabilityInput<T> = T extends readonly any[]
  ? T
  : T extends object
    ? { [K in keyof T]: T[K] } & Record<string, unknown>
    : T;

export function parseStructDefault<T = any>(schema: any): T {
  if (isStructuralCapability(schema)) {
    const converted = capabilityToStruct(schema);
    return parseStructDefault(converted);
  }
  if (typeof schema?.parse === "function") {
    return schema.parse({});
  }
  if (schema?.["~standard"]) {
    const res = schema["~standard"].validate({});
    if (res && "value" in res && (!("issues" in res) || !res.issues?.length)) {
      return res.value;
    }
    if ("issues" in res && res.issues?.length) {
      throw new Error(`Struct validation failed on default values: ${JSON.stringify(res.issues)}`);
    }
  }
  return {} as T;
}

export function extractStructInput<T = any>(schema: AnyCommandInput, data: unknown): T {
  if (data === undefined) {
    return parseStructDefault(schema);
  }

  if (data === null || typeof data !== "object") {
    return data as T;
  }

  if (isStructuralCapability(schema)) {
    const extracted: Record<string, unknown> = {};
    for (const req of schema.fields) {
      if (req.name in (data as Record<string, unknown>)) {
        const val = (data as Record<string, unknown>)[req.name];
        if (val !== undefined) {
          extracted[req.name] = val;
        }
      }
    }
    return extracted as T;
  }

  const sAny = schema as any;
  if (typeof sAny.safeParse === "function") {
    const res = sAny.safeParse(data);
    if (res.success) {
      return res.data;
    }
  }

  const fields = sAny.shape
    ? Object.keys(sAny.shape)
    : sAny.descriptor?.fields
      ? Object.keys(sAny.descriptor.fields)
      : null;

  if (fields && fields.length > 0) {
    const extracted: Record<string, unknown> = {};
    for (const key of fields) {
      if (key in (data as Record<string, unknown>)) {
        const val = (data as Record<string, unknown>)[key];
        if (val !== undefined) {
          extracted[key] = val;
        }
      }
    }
    return extracted as T;
  }

  return data as T;
}

export class StructCommand<
  const TInputSchema extends AnyCommandInput = AnyCommandInput,
  const TOutputSchema extends AnyStructSchema = AnyStructSchema,
> extends Command<InferSchemaOutput<TInputSchema>, InferSchemaOutput<TOutputSchema>> {
  constructor(
    public schema: {
      input: TInputSchema;
      output: TOutputSchema;
    },
    data?: CapabilityInput<InferSchemaInput<TInputSchema>>,
  ) {
    const extracted = extractStructInput<InferSchemaOutput<TInputSchema>>(
      schema.input,
      data,
    );
    super(extracted);
  }

  public validate(): ValidateResult<InferSchemaOutput<TInputSchema>> {
    const inputSchema = this.schema.input as any;
    if (isStructuralCapability(inputSchema)) {
      const capRes = CapabilityValidator.validateEntityData(
        this.data as Record<string, unknown>,
        inputSchema,
      );
      if (capRes.valid) {
        return { value: this.data };
      }
      const issues: StandardSchemaV1Issue[] = [
        ...capRes.missingFields.map((f) => ({
          path: [{ key: f }],
          message: `Field "${f}" is required by capability "${inputSchema.name}"`,
        })),
        ...capRes.typeMismatches.map((m) => ({
          path: [{ key: m.field }],
          message: `Field "${m.field}" expected ${m.expected}, received ${m.actual}`,
        })),
      ];
      return { issues };
    }

    if (typeof inputSchema?.validate === "function") {
      return inputSchema.validate(this.data);
    }
    if (inputSchema?.["~standard"]) {
      const res = inputSchema["~standard"].validate(this.data);
      if ("value" in res && (!("issues" in res) || !res.issues?.length)) {
        return { value: res.value };
      }
      return { issues: (res as any).issues ?? [] };
    }
    return { value: this.data };
  }

  public satisfiesCapability(capability: StructuralCapability): boolean {
    if (typeof this.data === "object" && this.data !== null) {
      return CapabilityValidator.satisfies(
        this.data as Record<string, unknown>,
        capability,
      );
    }
    return false;
  }
}

export type StructCommandType<
  TInputSchema extends AnyCommandInput = AnyCommandInput,
  TOutputSchema extends AnyStructSchema = AnyStructSchema,
> = Command<InferSchemaOutput<TInputSchema>, InferSchemaOutput<TOutputSchema>> & {
  schema: {
    input: TInputSchema;
    output: TOutputSchema;
  };
  data: InferSchemaOutput<TInputSchema>;
  validate(): ValidateResult<InferSchemaOutput<TInputSchema>>;
  satisfiesCapability(capability: StructuralCapability): boolean;
};

export function structCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  inputSchema: TInputSchema,
  outputSchema: TOutputSchema,
):
  & (new (
    data?: CapabilityInput<InferSchemaInput<TInputSchema>>,
  ) => Command<InferSchemaOutput<TInputSchema>, InferSchemaOutput<TOutputSchema>> & {
    schema: {
      input: TInputSchema;
      output: TOutputSchema;
    };
    data: InferSchemaOutput<TInputSchema>;
    validate(): ValidateResult<InferSchemaOutput<TInputSchema>>;
    satisfiesCapability(capability: StructuralCapability): boolean;
  })
  & {
    schema: {
      input: TInputSchema;
      output: TOutputSchema;
    };
  };

export function structCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  options: {
    input: TInputSchema;
    output: TOutputSchema;
  },
):
  & (new (
    data?: CapabilityInput<InferSchemaInput<TInputSchema>>,
  ) => Command<InferSchemaOutput<TInputSchema>, InferSchemaOutput<TOutputSchema>> & {
    schema: {
      input: TInputSchema;
      output: TOutputSchema;
    };
    data: InferSchemaOutput<TInputSchema>;
    validate(): ValidateResult<InferSchemaOutput<TInputSchema>>;
    satisfiesCapability(capability: StructuralCapability): boolean;
  })
  & {
    schema: {
      input: TInputSchema;
      output: TOutputSchema;
    };
  };

export function structCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  inputOrOptions:
    | TInputSchema
    | { input: TInputSchema; output: TOutputSchema },
  maybeOutput?: TOutputSchema,
): any {
  let inputSchema: TInputSchema;
  let outputSchema: TOutputSchema;

  if (
    inputOrOptions &&
    typeof inputOrOptions === "object" &&
    "input" in inputOrOptions &&
    "output" in inputOrOptions &&
    maybeOutput === undefined
  ) {
    inputSchema = inputOrOptions.input;
    outputSchema = inputOrOptions.output;
  } else {
    inputSchema = inputOrOptions as TInputSchema;
    outputSchema = maybeOutput as TOutputSchema;
  }

  const schema = {
    input: inputSchema,
    output: outputSchema,
  } as const;

  return class extends StructCommand<TInputSchema, TOutputSchema> {
    public static schema = schema;
    public override [COMMAND_RETURN]!: InferSchemaOutput<TOutputSchema>;
    override schema = schema;

    constructor(data?: CapabilityInput<InferSchemaInput<TInputSchema>>) {
      super(schema, data);
    }
  } as any;
}
