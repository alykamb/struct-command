import { COMMAND_RETURN } from "@collidor/command";
import {
  StructCommand,
  type AnyCommandInput,
  type AnyStructSchema,
  type InferSchemaOutput,
  type StructCommandClass,
} from "./structCommand.ts";
import { isComponentRequirement } from "./requires.ts";

export interface StructCommandConstructor<
  TInputSchema extends AnyCommandInput = AnyCommandInput,
  TOutputSchema extends AnyStructSchema = AnyStructSchema,
> extends Pick<StructCommandClass<TInputSchema, TOutputSchema>, "schema"> {
  readonly name: string;
}

/** Named command class: constructor typing follows the input kind (schema or requirement). */
export type NamedStructCommand<
  TInputSchema extends AnyCommandInput,
  TOutputSchema extends AnyStructSchema,
> = StructCommandClass<TInputSchema, TOutputSchema> & { readonly name: string };

/**
 * Creates a struct-validated command class constructor with an explicit name and schemas.
 *
 * This protects against bundlers minifying or mangling class names in production,
 * ensuring that command routing and serialization based on `command.constructor.name`
 * remain stable and deterministic across microfrontends and workers.
 *
 * The input may be a `@collidor/struct` schema, or `requires(Component)` to accept any game
 * object carrying that component (the handler receives only the component).
 *
 * @example
 * ```ts
 * const Move = createStructCommand("Move", requires(Position), s.boolean());
 * bus.execute(new Move(goblin)); // goblin.position is extracted
 * ```
 */
export function createStructCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  name: string,
  inputSchema: TInputSchema,
  outputSchema: TOutputSchema,
): NamedStructCommand<TInputSchema, TOutputSchema>;

export function createStructCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  name: string,
  options: {
    input: TInputSchema;
    output: TOutputSchema;
  },
): NamedStructCommand<TInputSchema, TOutputSchema>;

export function createStructCommand<
  const TInputSchema extends AnyCommandInput,
  const TOutputSchema extends AnyStructSchema,
>(
  name: string,
  inputOrOptions:
    | TInputSchema
    | { input: TInputSchema; output: TOutputSchema },
  maybeOutput?: TOutputSchema,
): NamedStructCommand<TInputSchema, TOutputSchema> {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("StructCommand name must be a non-empty string");
  }

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

  const StructCommandClass = class extends StructCommand<
    TInputSchema,
    TOutputSchema
  > {
    public static schema = schema;
    public override [COMMAND_RETURN]!: InferSchemaOutput<TOutputSchema>;
    override schema = schema;

    constructor(data?: unknown) {
      super(schema, data);
    }
  };

  Object.defineProperty(StructCommandClass, "name", {
    value: name,
    configurable: true,
  });

  return StructCommandClass as unknown as NamedStructCommand<
    TInputSchema,
    TOutputSchema
  >;
}
