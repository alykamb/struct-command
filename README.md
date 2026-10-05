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
```

### 3. Component Requirements (Odin-style)

A command can require a **named component** (a `@collidor/struct` struct) instead of a payload shape. Any object that carries that component under a property named after it is accepted, and the handler only ever receives the component.

```typescript
import { createStructCommand, requires } from "@collidor/struct-command";
import { s } from "@collidor/struct";

// A component is a struct with a name
const Position = s.struct({ x: s.number(), y: s.number() }).named("Position");
const Health = s.struct({ hp: s.number(), max: s.number() }).named("Health");

const Move = createStructCommand("Move", requires(Position), s.boolean());

bus.register(Move, (cmd) => {
  cmd.data; // { x, y }  (only the Position component)
  return true;
});

const goblin = { id: "g1", name: "Goblin", position: { x: 1, y: 2 }, health: { hp: 5, max: 10 } };

bus.execute(new Move(goblin));             // goblin.position extracted
bus.execute(new Move({ Position: {...} })); // "Position" works too
// new Move({ id: "x" })                    // compile error: no position/Position property
```

The lookup is a direct property read: the key is the component name with the first letter lower- or upper-cased (`Position` matches `position` or `Position`). No scanning, no registry.

- **Several components:** `requires(Position, Health)` gives `cmd.data` as `{ position, health }` (keys are the lower-cased names).
- **Ambiguity:** if an object has both `position` and `Position`, constructing the command throws `ComponentResolutionError`.
- Component values are validated with their schema when extracted; both missing and wrongly typed components are also compile-time errors.
- Components must be named (`.named("...")`); `requires()` rejects unnamed structs.

---

## API Reference

### `createStructCommand(name, input, output)`
### `createStructCommand(name, { input, output })`
Creates a named command class constructor extending `StructCommand`.

- `name` *(string)*: Unique identifier of the command class. Throws `TypeError` if empty or whitespace.
- `input`: a `@collidor/struct` schema, or `requires(...)`.
- `output`: `@collidor/struct` schema for return value typing.

### `structCommand(input, output)`
### `structCommand({ input, output })`
Creates an anonymous command class constructor extending `StructCommand`.

### `requires(...components)`
Declares required named components (`struct.named("Name")`). Also exports `ComponentResolutionError`, `resolveComponent`, `extractRequirement`.

### `StructCommand`
Base class extending `@collidor/command`'s `Command<TInput, TOutput>`.
- `command.schema.input` / `command.schema.output`: the input and output definitions.
- `command.data`: the typed payload (schema data, or the extracted component(s)).
- `command.validate()`: Validates `data` against the input schema, returning `{ value, issues }`.

---

## License

MIT © [Alykam Burdzaki](https://alykam.com)
