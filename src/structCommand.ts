import { Command, COMMAND_RETURN } from "@collidor/command";
import type { BaseSchema } from "@collidor/struct";

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

export type InferSchemaOutput<T> = T extends BaseSchema<any, infer O>
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

export type InferSchemaInput<T> = T extends BaseSchema<infer I, any>
  ? I
  : T extends StandardSchemaV1<infer I, any>
    ? I
    : T extends { _input: infer I }
      ? I
      : T extends { "~standard": { types?: { input: infer I } } }
        ? I
        : InferSchemaOutput<T>;

export function parseStructDefault<T = any>(schema: any): T {
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

export class StructCommand<
  const TInputSchema extends AnyStructSchema = AnyStructSchema,
  const TOutputSchema extends AnyStructSchema = AnyStructSchema,
> extends Command<InferSchemaOutput<TInputSchema>, InferSchemaOutput<TOutputSchema>> {
  constructor(
    public schema: {
      input: TInputSchema;
      output: TOutputSchema;
    },
    public override data: InferSchemaOutput<TInputSchema> = parseStructDefault(schema.input),
  ) {
    super(data);
  }

  public validate(): ValidateResult<InferSchemaOutput<TInputSchema>> {
    const inputSchema = this.schema.input as any;
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
}

export type StructCommandType<
  TInputSchema extends AnyStructSchema = AnyStructSchema,
  TOutputSchema extends AnyStructSchema = AnyStructSchema,
> = Command<InferSchemaOutput<TInputSchema>, InferSchemaOutput<TOutputSchema>> & {
  schema: {
    input: TInputSchema;
    output: TOutputSchema;
  };
  data: InferSchemaOutput<TInputSchema>;
  validate(): ValidateResult<InferSchemaOutput<TInputSchema>>;
};

export function structCommand<
  const TInputSchema extends AnyStructSchema,
  const TOutputSchema extends AnyStructSchema,
>(
  inputSchema: TInputSchema,
  outputSchema: TOutputSchema,
):
  & (new <R = InferSchemaOutput<TOutputSchema>, V = InferSchemaOutput<TInputSchema>>(
    data?: V,
  ) => Command<V, R> & {
    schema: {
      input: TInputSchema;
      output: TOutputSchema;
    };
    data: V;
    validate(): ValidateResult<V>;
  })
  & {
    schema: {
      input: TInputSchema;
      output: TOutputSchema;
    };
  };

export function structCommand<
  const TInputSchema extends AnyStructSchema,
  const TOutputSchema extends AnyStructSchema,
>(
  options: {
    input: TInputSchema;
    output: TOutputSchema;
  },
):
  & (new <R = InferSchemaOutput<TOutputSchema>, V = InferSchemaOutput<TInputSchema>>(
    data?: V,
  ) => Command<V, R> & {
    schema: {
      input: TInputSchema;
      output: TOutputSchema;
    };
    data: V;
    validate(): ValidateResult<V>;
  })
  & {
    schema: {
      input: TInputSchema;
      output: TOutputSchema;
    };
  };

export function structCommand<
  const TInputSchema extends AnyStructSchema,
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

    constructor(data?: InferSchemaOutput<TInputSchema>) {
      const resolvedData = data !== undefined
        ? data
        : parseStructDefault(schema.input);
      super(schema, resolvedData);
    }
  } as any;
}
