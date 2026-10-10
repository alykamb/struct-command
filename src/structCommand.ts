import { Command, COMMAND_RETURN } from "@collidor/command";
import type { BaseSchema } from "@collidor/struct";
import {
  extractRequirement,
  isComponentRequirement,
  type ComponentRequirement,
  type HolderGuard,
  type RequirementOutput,
} from "./requires.ts";

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

/** A command input is either a schema or a set of required components (Odin-style). */
export type AnyCommandInput = AnyStructSchema | ComponentRequirement;

export type InferSchemaOutput<T> = T extends ComponentRequirement
  ? RequirementOutput<T>
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

export type InferSchemaInput<T> = T extends ComponentRequirement
  ? never
  : T extends BaseSchema<infer I, any>
    ? I
    : T extends StandardSchemaV1<infer I, any>
      ? I
      : T extends { _input: infer I }
        ? I
        : T extends { "~standard": { types?: { input: infer I } } }
          ? I
          : InferSchemaOutput<T>;

/** Constructor type: plain schemas take their input; requirements accept any holder object. */
export type StructCommandCtorArgs<T> = T extends ComponentRequirement
  ? never
  : [data?: InferSchemaInput<T>];

export function parseStructDefault<T = any>(schema: any): T {
  if (isComponentRequirement(schema)) {
    return undefined as T;
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

/**
 * Resolves the command payload from whatever the caller passed in:
 * - requirement: pulls the required component(s) out of the game object via the usage index.
 * - schema: uses defaults when nothing is passed, else the data as given.
 */
export function extractStructInput<T = any>(input: AnyCommandInput, data: unknown): T {
  if (isComponentRequirement(input)) {
    return extractRequirement(input, data) as T;
  }
  if (data === undefined) {
    return parseStructDefault(input);
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
    data?: unknown,
  ) {
    super(extractStructInput<InferSchemaOutput<TInputSchema>>(schema.input, data));
  }

  public validate(): ValidateResult<InferSchemaOutput<TInputSchema>> {
    const inputSchema = this.schema.input as any;
    if (isComponentRequirement(inputSchema)) {
      // Components were already resolved and validated at construction time.
      return { value: this.data };
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
}

export type StructCommandInstanceType<
  TInputSchema extends AnyCommandInput,
  TOutputSchema extends AnyStructSchema,
> = Command<InferSchemaOutput<TInputSchema>, InferSchemaOutput<TOutputSchema>> & {
  schema: {
    input: TInputSchema;
    output: TOutputSchema;
  };
  data: InferSchemaOutput<TInputSchema>;
  validate(): ValidateResult<InferSchemaOutput<TInputSchema>>;
};

export type StructCommandType<
  TInputSchema extends AnyCommandInput = AnyCommandInput,
  TOutputSchema extends AnyStructSchema = AnyStructSchema,
> = StructCommandInstanceType<TInputSchema, TOutputSchema>;

/** Constructor shape produced by `structCommand` for a given input. */
export type StructCommandClass<
  TInputSchema extends AnyCommandInput,
  TOutputSchema extends AnyStructSchema,
> =
  & (TInputSchema extends ComponentRequirement
    ? new <H extends object>(
      data: H & HolderGuard<H, TInputSchema>,
    ) => StructCommandInstanceType<TInputSchema, TOutputSchema>
    : new (
      ...args: StructCommandCtorArgs<TInputSchema>
    ) => StructCommandInstanceType<TInputSchema, TOutputSchema>)
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
  inputSchema: TInputSchema,
  outputSchema: TOutputSchema,
): StructCommandClass<TInputSchema, TOutputSchema>;

export function structCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  options: {
    input: TInputSchema;
    output: TOutputSchema;
  },
): StructCommandClass<TInputSchema, TOutputSchema>;

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
    !isComponentRequirement(inputOrOptions) &&
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

    constructor(data?: unknown) {
      super(schema, data);
    }
  } as any;
}
