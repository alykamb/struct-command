import { assertEquals, assertInstanceOf } from "@std/assert";
import { s } from "@collidor/struct";
import { Command, CommandBus, AsyncCommandBus } from "@collidor/command";
import { StructCommand, structCommand } from "./structCommand.ts";

// Define schemas for testing
const InputSchema = s.struct({
  name: s.string(),
  age: s.number(),
});

const OutputSchema = s.struct({
  success: s.boolean(),
  id: s.string(),
});

// Create a command class using the factory
class CreateUserCommand extends structCommand(InputSchema, OutputSchema) {}

Deno.test("structCommand - should create a class instance with correct structure", () => {
  const payload = { name: "Alice", age: 30 };
  const command = new CreateUserCommand(payload);

  // Check inheritance
  assertInstanceOf(command, StructCommand);
  assertInstanceOf(command, Command);
  assertInstanceOf(command, CreateUserCommand);

  // Check data
  assertEquals(command.data, payload);

  // Check instance schema properties
  assertEquals(command.schema.input, InputSchema);
  assertEquals(command.schema.output, OutputSchema);
});

Deno.test("structCommand - should support options object signature", () => {
  const OptionsCommand = structCommand({
    input: InputSchema,
    output: OutputSchema,
  });

  const cmd = new OptionsCommand({ name: "Bob", age: 25 });
  assertInstanceOf(cmd, StructCommand);
  assertEquals(cmd.data.name, "Bob");
  assertEquals(cmd.schema.input, InputSchema);
  assertEquals(cmd.schema.output, OutputSchema);
  assertEquals(OptionsCommand.schema.input, InputSchema);
  assertEquals(OptionsCommand.schema.output, OutputSchema);
});

Deno.test("structCommand - should expose static schema property on the generated class", () => {
  assertEquals(CreateUserCommand.schema.input, InputSchema);
  assertEquals(CreateUserCommand.schema.output, OutputSchema);
});

Deno.test("structCommand - should apply struct default values when instantiated without data", () => {
  const DefaultInput = s.struct({
    count: s.number().default(0),
    tag: s.string().default("default"),
  });
  const VoidOutput = s.null();

  const DefaultCommand = structCommand(DefaultInput, VoidOutput);

  // Instantiate without arguments
  const command = new DefaultCommand();

  assertEquals(command.data.count, 0);
  assertEquals(command.data.tag, "default");
});

Deno.test("structCommand - validate() method validates payload against input schema", () => {
  const cmd = new CreateUserCommand({ name: "Charlie", age: 28 });
  const validRes = cmd.validate();
  assertEquals(validRes.value?.name, "Charlie");
  assertEquals(validRes.issues, undefined);

  // Manually invalid data
  const invalidCmd = new CreateUserCommand({ name: 123 as any, age: "invalid" as any });
  const invalidRes = invalidCmd.validate();
  assertEquals(invalidRes.value, undefined);
  assertEquals(Array.isArray(invalidRes.issues), true);
  assertEquals(invalidRes.issues!.length > 0, true);
});

/*
    INTEGRATION WITH COMMAND BUS
*/

Deno.test("commandBus - should register and execute a structCommand synchronously", () => {
  const commandBus = new CommandBus();

  commandBus.register(CreateUserCommand, (command) => {
    assertEquals(command.data.name, "Alice");
    assertEquals(command.data.age, 30);

    return {
      success: true,
      id: "user_123",
    };
  });

  const result = commandBus.execute(
    new CreateUserCommand({ name: "Alice", age: 30 }),
  );

  assertEquals(result, { success: true, id: "user_123" });
});

Deno.test("commandBus - should register and execute a structCommand asynchronously", async () => {
  const asyncBus = new AsyncCommandBus();

  asyncBus.register(CreateUserCommand, async (command) => {
    assertEquals(command.data.name, "Alice");

    return {
      success: true,
      id: "async_user_999",
    };
  });

  const result = await asyncBus.execute(
    new CreateUserCommand({ name: "Alice", age: 30 }),
  );

  assertEquals(result, { success: true, id: "async_user_999" });
});

Deno.test("commandBus - should handle structCommand in streams", async () => {
  const commandBus = new CommandBus();
  const StreamInput = s.struct({ limit: s.number() });
  const StreamOutput = s.number();

  class NumberStreamCommand extends structCommand(StreamInput, StreamOutput) {}

  commandBus.registerStream(NumberStreamCommand, (command, _ctx, next) => {
    for (let i = 0; i < command.data.limit; i++) {
      next(i, i === command.data.limit - 1);
    }
    return () => {};
  });

  const results: number[] = [];
  await new Promise((resolve) => {
    commandBus.stream(
      new NumberStreamCommand({ limit: 5 }),
      (data, done) => {
        results.push(data);
        if (done) resolve(undefined);
      },
    );
  });

  assertEquals(results, [0, 1, 2, 3, 4]);
});

/*
    CAPABILITY POWER & INPUT EXTRACTION TESTS
*/

import { StandardCapabilities } from "@collidor/struct";

Deno.test("capability power - accepts inputs containing the necessary input and extracts only defined fields", () => {
  const PositionInput = s.struct({
    x: s.number(),
    y: s.number(),
  });
  const MoveCommand = structCommand(PositionInput, s.boolean());

  // Entity with rich domain state (superset)
  const goblinEntity = {
    id: "goblin_123",
    name: "Goblin Scout",
    x: 150,
    y: 300,
    hp: 12,
    max_hp: 12,
    inventory: ["rusty_dagger", "torch"],
  };

  // Instantiating with the superset entity
  const command = new MoveCommand(goblinEntity);

  // command.data MUST contain ONLY the defined fields ({ x, y })
  assertEquals(command.data, { x: 150, y: 300 });

  // Extraneous fields must be extracted and stripped
  const rawData = command.data as any;
  assertEquals(rawData.id, undefined);
  assertEquals(rawData.name, undefined);
  assertEquals(rawData.hp, undefined);
  assertEquals(rawData.inventory, undefined);
});

Deno.test("capability power - command handlers receive only the defined input payload", () => {
  const PositionInput = s.struct({
    x: s.number(),
    y: s.number(),
  });
  const MoveCommand = structCommand(PositionInput, s.string());

  const bus = new CommandBus();
  let receivedKeys: string[] = [];

  bus.register(MoveCommand, (cmd) => {
    receivedKeys = Object.keys(cmd.data);
    // Handler only needs x and y
    return `moved to ${cmd.data.x}, ${cmd.data.y}`;
  });

  const fullPlayerObject = {
    x: 42,
    y: 84,
    token: "auth_token_xyz",
    stats: { strength: 18 },
    tags: ["hero", "warrior"],
  };

  const result = bus.execute(new MoveCommand(fullPlayerObject));

  assertEquals(result, "moved to 42, 84");
  assertEquals(receivedKeys.sort(), ["x", "y"].sort());
});

Deno.test("capability power - supports StructuralCapability directly as input definition", () => {
  // Directly define command input using StandardCapabilities.HasPosition
  const SpatialCommand = structCommand(
    StandardCapabilities.HasPosition,
    s.boolean(),
  );

  const entity = {
    id: "entity_99",
    name: "Drone",
    x: 10,
    y: 20,
    z: 30,
    battery: 98,
  };

  const cmd = new SpatialCommand(entity);

  // Extracted data has x, y, z
  assertEquals(cmd.data.x, 10);
  assertEquals(cmd.data.y, 20);
  assertEquals(cmd.data.z, 30);
  assertEquals((cmd.data as any).id, undefined);
  assertEquals((cmd.data as any).battery, undefined);

  // Capability validation
  const validation = cmd.validate();
  assertEquals(validation.value?.x, 10);
  assertEquals(validation.issues, undefined);

  // satisfiesCapability helper
  assertEquals(cmd.satisfiesCapability(StandardCapabilities.HasPosition), true);
  assertEquals(cmd.satisfiesCapability(StandardCapabilities.HasHealth), false);
});

Deno.test("capability power - reports validation issues when capability requirements are missing or invalid", () => {
  const CombatCommand = structCommand(
    StandardCapabilities.HasCombatant,
    s.boolean(),
  );

  // Invalid: name is a number instead of string, initiative is wrong type
  const invalidData = {
    name: 12345 as any,
    initiative: "fast" as any,
    extra: "discarded",
  };

  const cmd = new CombatCommand(invalidData);
  const res = cmd.validate();

  assertEquals(res.value, undefined);
  assertEquals(Array.isArray(res.issues), true);
  assertEquals(res.issues!.length > 0, true);
});

