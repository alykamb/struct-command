# @collidor/struct-command

[![JSR](https://jsr.io/badges/@collidor/struct-command)](https://jsr.io/@collidor/struct-command)
[![npm version](https://badge.fury.io/js/@collidor%2Fstruct-command.svg)](https://badge.fury.io/js/@collidor%2Fstruct-command)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight, type-safe command wrapper that unifies **`@collidor/struct`** schemas for input and output definition, validation, and type inference on **`@collidor/command`** buses.

---

## Features

- 🛡️ **End-to-End Type Safety**: Automatically infers input payload (`Infer<TInput>`) and return type (`Infer<TOutput>`) from `@collidor/struct` schemas.
- ⚡ **Standard Schema V1 Compliant**: Works seamlessly with `@collidor/struct`'s `BaseSchema` and any Standard Schema V1 validator.
- 📋 **Zero-Boilerplate Defaults**: Automatically instantiates with schema defaults (via `.parse({})`) when called without arguments.
- 🔒 **Mangle-Safe Factory**: `createStructCommand` creates classes with deterministic, preserved `name` properties to prevent bundler minification bugs during command routing.
- 🔄 **Full CQRS Integration**: Directly compatible with `CommandBus`, `AsyncCommandBus`, streaming commands, and cross-window PortChannel IPC.

---

## Installation

### Deno / JSR
```bash
deno add jsr:@collidor/struct-command
```

### Node.js / NPM / PNPM
```bash
npm install @collidor/struct-command @collidor/struct @collidor/command
# or
pnpm add @collidor/struct-command @collidor/struct @collidor/command
```

---

## Quickstart

### 1. Defining Commands with `createStructCommand` (Recommended)

`createStructCommand` ensures the class `name` is preserved in production builds:

```typescript
import { createStructCommand } from "@collidor/struct-command";
import { s } from "@collidor/struct";
import { CommandBus } from "@collidor/command";

// Define input and output structs
const InputSchema = s.struct({
  userId: s.string(),
  amount: s.number().positive(),
});

const OutputSchema = s.struct({
  transactionId: s.string(),
  success: s.boolean(),
});

// Create command constructor
export const TransferFundsCommand = createStructCommand(
  "TransferFundsCommand",
  InputSchema,
  OutputSchema
);

// Register and execute on CommandBus
const bus = new CommandBus();

bus.register(TransferFundsCommand, (cmd) => {
  console.log(`Processing transfer of $${cmd.data.amount} for user ${cmd.data.userId}`);
  return {
    transactionId: "tx_99812",
    success: true,
  };
});

const result = bus.execute(
  new TransferFundsCommand({ userId: "user_42", amount: 150 })
);
console.log(result.transactionId); // "tx_99812"
```

### 2. Defining Commands with `structCommand` class factory

You can also use the `structCommand` helper for subclassing:

```typescript
import { structCommand } from "@collidor/struct-command";
import { s } from "@collidor/struct";

const FilterSchema = s.struct({
  query: s.string().default(""),
  limit: s.number().default(10),
});

const ResultSchema = s.array(s.string());

export class SearchArticlesCommand extends structCommand(FilterSchema, ResultSchema) {}

// Defaults are applied when instantiating without arguments:
const cmd = new SearchArticlesCommand();
console.log(cmd.data.query); // ""
console.log(cmd.data.limit); // 10
### 3. Capability Power & Automatic Input Extraction (Odin-Inspired)

Commands leverage **structural capabilities**: they accept inputs that contain the necessary data (such as rich domain models or game entities), and **automatically extract strictly the defined fields**. Extraneous properties are stripped away, so command handlers continue to receive and depend only on the defined input.

```typescript
import { createStructCommand } from "@collidor/struct-command";
import { s, StandardCapabilities } from "@collidor/struct";
import { CommandBus } from "@collidor/command";

// Define command using a struct or a StructuralCapability
export const MoveCommand = createStructCommand(
  "MoveCommand",
  StandardCapabilities.HasPosition, // Requires { x: number, y: number, z?: number }
  s.boolean()
);

const bus = new CommandBus();

bus.register(MoveCommand, (cmd) => {
  // Handler only receives { x, y, z }!
  console.log(`Moving to coordinates (${cmd.data.x}, ${cmd.data.y})`);
  return true;
});

// A complex game entity with stats, inventory, and combat pools:
const goblinEntity = {
  id: "goblin_99",
  name: "Goblin Scout",
  x: 100,
  y: 250,
  hp: 12,
  max_hp: 12,
  inventory: ["dagger", "torch"],
};

// Pass the entire entity: MoveCommand extracts ONLY { x, y }!
const cmd = new MoveCommand(goblinEntity);
console.log(cmd.data); // { x: 100, y: 250 }
console.log((cmd.data as any).inventory); // undefined

bus.execute(cmd);
```

You can also check capability satisfaction directly on any command instance:
```typescript
cmd.satisfiesCapability(StandardCapabilities.HasPosition); // true
cmd.satisfiesCapability(StandardCapabilities.HasHealth);   // false
```

---

## API Reference

### `createStructCommand(name, inputSchema, outputSchema)`
### `createStructCommand(name, { input, output })`
Creates a named command class constructor extending `StructCommand`.

- `name` *(string)*: Unique identifier of the command class. Throws `TypeError` if empty or whitespace.
- `inputSchema`: `@collidor/struct` schema or `StructuralCapability` for payload validation, extraction, and typing.
- `outputSchema`: `@collidor/struct` schema for return value typing.

### `structCommand(inputSchema, outputSchema)`
### `structCommand({ input, output })`
Creates an anonymous command class constructor extending `StructCommand`.

### `StructCommand`
Base class extending `@collidor/command`'s `Command<TInput, TOutput>`.
- `command.schema.input`: The input schema or capability descriptor.
- `command.schema.output`: The output schema descriptor.
- `command.data`: The typed and extracted input payload (extraneous properties stripped).
- `command.validate()`: Validates `data` against the input schema or capability, returning `{ value, issues }`.
- `command.satisfiesCapability(capability)`: Returns whether `command.data` satisfies a given `StructuralCapability`.

### Utilities
- `extractStructInput(schema, data)`: Extracts defined fields from an input object based on the schema or capability, stripping extra keys.
- `capabilityToStruct(capability)`: Converts a `StructuralCapability` into an executable `StructSchema`.
- `isStructuralCapability(value)`: Type guard identifying `StructuralCapability` objects.


---

## License

MIT © [Alykam Burdzaki](https://alykam.com)
