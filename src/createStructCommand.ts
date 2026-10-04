import { COMMAND_RETURN } from "@collidor/command";
import {
  StructCommand,
  parseStructDefault,
  type AnyStructSchema,
  type InferSchemaOutput,
} from "./structCommand.ts";

export interface StructCommandInstance<
  TInputSchema extends AnyStructSchema = AnyStructSchema,
  TOutputSchema extends AnyStructSchema = AnyStructSchema,
> extends StructCommand<TInputSchema, TOutputSchema> {
  schema: {
    input: TInputSchema;
    output: TOutputSchema;
  };
  data: InferSchemaOutput<TInputSchema>;
}

export interface StructCommandConstructor<
  TInputSchema extends AnyStructSchema = AnyStructSchema,
  TOutputSchema extends AnyStructSchema = AnyStructSchema,
> {
  new (
    ...args: [data?: InferSchemaOutput<TInputSchema>]
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
 * @param inputSchema The @collidor/struct schema for payload validation and typing.
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
  const TInputSchema extends AnyStructSchema,
  const TOutputSchema extends AnyStructSchema,
>(
  name: string,
  inputSchema: TInputSchema,
  outputSchema: TOutputSchema,
): StructCommandConstructor<TInputSchema, TOutputSchema>;

export function createStructCommand<
  const TInputSchema extends AnyStructSchema,
  const TOutputSchema extends AnyStructSchema,
>(
  name: string,
  options: {
    input: TInputSchema;
    output: TOutputSchema;
  },
): StructCommandConstructor<TInputSchema, TOutputSchema>;

export function createStructCommand<
  const TInputSchema extends AnyStructSchema,
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
      const data = args.length > 0 && args[0] !== undefined
        ? args[0]
        : parseStructDefault(schema.input);
      super(schema, data);
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
