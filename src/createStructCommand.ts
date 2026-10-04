import { COMMAND_RETURN } from "@collidor/command";
import type { StructuralCapability } from "@collidor/struct";
import {
  StructCommand,
  type AnyStructSchema,
  type AnyCommandInput,
  type InferSchemaOutput,
  type InferSchemaInput,
  type CapabilityInput,
} from "./structCommand.ts";

export interface StructCommandInstance<
  TInputSchema extends AnyCommandInput = AnyCommandInput,
  TOutputSchema extends AnyStructSchema = AnyStructSchema,
> extends StructCommand<TInputSchema, TOutputSchema> {
  schema: {
    input: TInputSchema;
    output: TOutputSchema;
  };
  data: InferSchemaOutput<TInputSchema>;
  satisfiesCapability(capability: StructuralCapability): boolean;
}

export interface StructCommandConstructor<
  TInputSchema extends AnyCommandInput = AnyCommandInput,
  TOutputSchema extends AnyStructSchema = AnyStructSchema,
> {
  new (
    ...args: [data?: CapabilityInput<InferSchemaInput<TInputSchema>>]
  ): StructCommandInstance<TInputSchema, TOutputSchema>;
  readonly prototype: StructCommandInstance<TInputSchema, TOutputSchema>;
  readonly name: string;
  readonly schema: {
    readonly input: TInputSchema;
    readonly output: TOutputSchema;
  };
}

/**
 * Creates a struct-validated command class constructor with an explicit name and schemas.
 *
 * This protects against bundlers minifying or mangling class names in production,
 * ensuring that command routing and serialization based on `command.constructor.name`
 * remain stable and deterministic across microfrontends and workers.
 *
 * @param name The unique name of the struct command.
 * @param inputSchema The @collidor/struct schema or StructuralCapability for payload validation and typing.
 * @param outputSchema The @collidor/struct schema for return value typing.
 * @returns A class constructor extending StructCommand with the specified name and schemas.
 *
 * @example
 * ```ts
 * const CreateUser = createStructCommand(
 *   "CreateUser",
 *   s.struct({ name: s.string() }),
 *   s.struct({ id: s.string() }),
 * );
 *
 * bus.register(CreateUser, (cmd) => ({ id: "123" }));
 * const res = bus.execute(new CreateUser({ name: "Alice" }));
 * ```
 */
export function createStructCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  name: string,
  inputSchema: TInputSchema,
  outputSchema: TOutputSchema,
): StructCommandConstructor<TInputSchema, TOutputSchema>;

export function createStructCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  name: string,
  options: {
    input: TInputSchema;
    output: TOutputSchema;
  },
): StructCommandConstructor<TInputSchema, TOutputSchema>;

export function createStructCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  name: string,
  inputOrOptions:
    | TInputSchema
    | { input: TInputSchema; output: TOutputSchema },
  maybeOutput?: TOutputSchema,
): StructCommandConstructor<TInputSchema, TOutputSchema> {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("StructCommand name must be a non-empty string");
  }

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

  const StructCommandClass = class extends StructCommand<
    TInputSchema,
    TOutputSchema
  > {
    public static schema = schema;
    public override [COMMAND_RETURN]!: InferSchemaOutput<TOutputSchema>;
    override schema = schema;

    constructor(...args: any[]) {
      super(schema, args[0]);
    }
  };

  Object.defineProperty(StructCommandClass, "name", {
    value: name,
    configurable: true,
  });

  return StructCommandClass as unknown as StructCommandConstructor<
    TInputSchema,
    TOutputSchema
  >;
}
