import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { s } from "@collidor/struct";
import { Command, CommandBus } from "@collidor/command";
import { StructCommand } from "./structCommand.ts";
import { createStructCommand } from "./createStructCommand.ts";

const InputSchema = s.struct({
  name: s.string(),
  age: s.number(),
});

const OutputSchema = s.struct({
  success: s.boolean(),
  id: s.string(),
});

Deno.test("createStructCommand - Basic Creation and Naming", async (t) => {
  await t.step("should create a struct command class with explicit name", () => {
    const CreateUserCommand = createStructCommand(
      "CreateUserCommand",
      InputSchema,
      OutputSchema,
    );

    assertEquals(CreateUserCommand.name, "CreateUserCommand");

    const payload = { name: "Alice", age: 30 };
    const command = new CreateUserCommand(payload);

    assertEquals(command.constructor.name, "CreateUserCommand");
    assertEquals(command.data, payload);
    assertEquals(command.schema.input, InputSchema);
    assertEquals(command.schema.output, OutputSchema);
    assertEquals(CreateUserCommand.schema.input, InputSchema);
    assertEquals(CreateUserCommand.schema.output, OutputSchema);

    assertInstanceOf(command, StructCommand);
    assertInstanceOf(command, Command);
    assertInstanceOf(command, CreateUserCommand);
  });

  await t.step("should support options object signature", () => {
    const OptionsCommand = createStructCommand("OptionsCommand", {
      input: InputSchema,
      output: OutputSchema,
    });

    assertEquals(OptionsCommand.name, "OptionsCommand");
    assertEquals(OptionsCommand.schema.input, InputSchema);
    assertEquals(OptionsCommand.schema.output, OutputSchema);

    const cmd = new OptionsCommand({ name: "Bob", age: 25 });
    assertEquals(cmd.data.name, "Bob");
    assertEquals(cmd.constructor.name, "OptionsCommand");
  });

  await t.step("should apply struct default values when instantiated without arguments", () => {
    const DefaultInput = s.struct({
      count: s.number().default(0),
      tag: s.string().default("default"),
    });
    const VoidOutput = s.null();

    const DefaultCommand = createStructCommand(
      "DefaultCommand",
      DefaultInput,
      VoidOutput,
    );

    const command = new DefaultCommand();
    assertEquals(command.data.count, 0);
    assertEquals(command.data.tag, "default");
    assertEquals(command.constructor.name, "DefaultCommand");
  });
});

Deno.test("createStructCommand - Name Validation", async (t) => {
  await t.step("should throw TypeError for empty or whitespace name", () => {
    assertThrows(
      () => createStructCommand("", InputSchema, OutputSchema),
      TypeError,
      "StructCommand name must be a non-empty string",
    );
    assertThrows(
      () => createStructCommand("   ", InputSchema, OutputSchema),
      TypeError,
      "StructCommand name must be a non-empty string",
    );
  });

  await t.step("should throw TypeError for non-string names", () => {
    assertThrows(
      () => createStructCommand(null as any, InputSchema, OutputSchema),
      TypeError,
      "StructCommand name must be a non-empty string",
    );
    assertThrows(
      () => createStructCommand(undefined as any, InputSchema, OutputSchema),
      TypeError,
      "StructCommand name must be a non-empty string",
    );
    assertThrows(
      () => createStructCommand(123 as any, InputSchema, OutputSchema),
      TypeError,
      "StructCommand name must be a non-empty string",
    );
  });
});

Deno.test("createStructCommand - CommandBus Integration", async (t) => {
  await t.step("should register and execute on CommandBus with preserved name", () => {
    const bus = new CommandBus();
    const PingCommand = createStructCommand(
      "PingCommand",
      s.struct({ message: s.string() }),
      s.struct({ reply: s.string() }),
    );

    bus.register(PingCommand, (cmd) => {
      assertEquals(cmd.data.message, "ping");
      return { reply: "pong" };
    });

    const result = bus.execute(new PingCommand({ message: "ping" }));
    assertEquals(result, { reply: "pong" });
  });

  await t.step("should check availability using constructor and string name", () => {
    const bus = new CommandBus();
    const PingCommand = createStructCommand(
      "PingCommand",
      s.struct({ message: s.string() }),
      s.struct({ reply: s.string() }),
    );

    assertEquals(bus.isAvailable(PingCommand), false);
    assertEquals(bus.isAvailable("PingCommand"), false);

    bus.register(PingCommand, () => ({ reply: "pong" }));

    assertEquals(bus.isAvailable(PingCommand), true);
    assertEquals(bus.isAvailable("PingCommand"), true);
    assertEquals(bus.getAvailableCommands().includes("PingCommand"), true);
  });

  await t.step("should work with streaming on CommandBus", async () => {
    const bus = new CommandBus();
    const CountdownCommand = createStructCommand(
      "CountdownCommand",
      s.struct({ from: s.number() }),
      s.number(),
    );

    bus.registerStream(CountdownCommand, (cmd, _ctx, next) => {
      for (let i = cmd.data.from; i >= 0; i--) {
        next(i, i === 0);
      }
      return () => {};
    });

    const emitted: number[] = [];
    await new Promise((resolve) => {
      bus.stream(new CountdownCommand({ from: 3 }), (val, done) => {
        emitted.push(val);
        if (done) resolve(undefined);
      });
    });

    assertEquals(emitted, [3, 2, 1, 0]);
  });
});

Deno.test("createStructCommand - Bundler Minification Resilience", async (t) => {
  await t.step(
    "should preserve class name even if variable name is mangled",
    () => {
      // Simulating a bundler renaming variable `CreateUserCommand` to `a`
      const a = createStructCommand("CreateUserCommand", InputSchema, OutputSchema);

      assertEquals(a.name, "CreateUserCommand");

      const instance = new a({ name: "Charlie", age: 40 });
      assertEquals(instance.constructor.name, "CreateUserCommand");
    },
  );
});

Deno.test("createStructCommand - Subclassing", async (t) => {
  await t.step("should allow extending the returned command class", () => {
    const Base = createStructCommand("BaseCommand", InputSchema, OutputSchema);

    class ChildCommand extends Base {
      public extra = "extra_field";
    }

    const child = new ChildCommand({ name: "Dan", age: 20 });
    assertEquals(child.data.name, "Dan");
    assertEquals(child.extra, "extra_field");
    assertInstanceOf(child, Base);
    assertInstanceOf(child, StructCommand);
    assertInstanceOf(child, Command);
  });
});
