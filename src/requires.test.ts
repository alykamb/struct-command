import { assertEquals, assertThrows } from "@std/assert";
import { s } from "@collidor/struct";
import { CommandBus } from "@collidor/command";
import { createStructCommand } from "./createStructCommand.ts";
import { structCommand } from "./structCommand.ts";
import { ComponentResolutionError, requires } from "./requires.ts";

const Position = s.struct({ x: s.number(), y: s.number() }).named("Position");
const Health = s.struct({ hp: s.number(), max: s.number() }).named("Health");

const goblin = {
  id: "g1",
  name: "Goblin",
  position: { x: 1, y: 2 },
  health: { hp: 5, max: 10 },
};

Deno.test("requires - object with a lowercase-named component is accepted; only the component is extracted", () => {
  const Move = createStructCommand("Move", requires(Position), s.boolean());
  const cmd = new Move(goblin);

  assertEquals(cmd.data, { x: 1, y: 2 });
  assertEquals(cmd.constructor.name, "Move");
});

Deno.test("requires - capitalised property name matches too", () => {
  const Move = structCommand(requires(Position), s.boolean());
  assertEquals(new Move({ Position: { x: 3, y: 4 } }).data, { x: 3, y: 4 });
});

Deno.test("requires - handlers on CommandBus see only the component", () => {
  const Move = createStructCommand("Move2", requires(Position), s.string());
  const bus = new CommandBus();
  bus.register(Move, (cmd) => `to ${cmd.data.x},${cmd.data.y}`);

  assertEquals(bus.execute(new Move(goblin)), "to 1,2");
});

Deno.test("requires - several components yield a payload keyed by lower-cased name", () => {
  const Heal = structCommand(requires(Position, Health), s.number());
  const cmd = new Heal({ Position: { x: 1, y: 2 }, health: { hp: 5, max: 10 } });

  assertEquals(cmd.data, { position: { x: 1, y: 2 }, health: { hp: 5, max: 10 } });
});

Deno.test("requires - missing component throws at runtime (and fails type-check)", () => {
  const Move = structCommand(requires(Position), s.boolean());
  assertThrows(
    // @ts-expect-error object has no position/Position property
    () => new Move({ id: "x", name: "nothing" }),
    ComponentResolutionError,
    "no",
  );
});

Deno.test("requires - wrong component type fails type-check and validation", () => {
  const Move = structCommand(requires(Position), s.boolean());
  assertThrows(
    // @ts-expect-error position.x must be a number
    () => new Move({ position: { x: "no", y: 1 } }),
    ComponentResolutionError,
    "Invalid",
  );
});

Deno.test("requires - both casings present is ambiguous", () => {
  const Move = structCommand(requires(Position), s.boolean());
  assertThrows(
    () => new Move({ position: { x: 1, y: 1 }, Position: { x: 0, y: 0 } }),
    ComponentResolutionError,
    "Ambiguous",
  );
});

Deno.test("requires - unnamed components are rejected", () => {
  assertThrows(
    // @ts-expect-error component must be created with .named()
    () => requires(s.struct({ x: s.number() })),
    TypeError,
    "named",
  );
});
