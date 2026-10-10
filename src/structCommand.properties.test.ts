import { assertEquals, assertThrows } from "@std/assert";
import * as fc from "fast-check";
import { s } from "@collidor/struct";
import { CommandBus } from "@collidor/command";
import { createStructCommand } from "./createStructCommand.ts";
import { structCommand } from "./structCommand.ts";
import { ComponentResolutionError, requires } from "./requires.ts";

Deno.test("Property-Based Invariants - CommandBus Payload Roundtrip (1,000 runs)", () => {
  const UserSchema = s.struct({
    name: s.string(),
    age: s.number(),
    active: s.boolean().optional(),
  });
  const OutputSchema = s.struct({
    userId: s.string(),
    processedAge: s.number(),
  });

  const ProcessUser = structCommand(UserSchema, OutputSchema);
  const bus = new CommandBus();
  bus.register(ProcessUser, (cmd) => ({
    userId: `user_${cmd.data.name}`,
    processedAge: cmd.data.age * 2,
  }));

  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 30 }),
      fc.integer({ min: 0, max: 150 }),
      fc.option(fc.boolean(), { nil: undefined }),
      (name, age, active) => {
        const input = { name, age, active };
        const cmd = new ProcessUser(input);
        const result = bus.execute(cmd);

        assertEquals(result, {
          userId: `user_${name}`,
          processedAge: age * 2,
        });
      },
    ),
    { numRuns: 1000 },
  );
});

Deno.test("Property-Based Invariants - Component Requirement Extraction & Noise Isolation (1,000 runs)", () => {
  const Position = s.struct("Position", {
    x: fc ? s.number() : s.number(),
    y: s.number(),
  });

  const Move = createStructCommand("Move", requires(Position), s.boolean());

  fc.assert(
    fc.property(
      fc.record({
        x: fc.integer({ min: -50_000, max: 50_000 }),
        y: fc.integer({ min: -50_000, max: 50_000 }),
      }),
      fc.constantFrom("position", "Position"),
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 20 }).filter((k) => !/^(position)$/i.test(k)),
        fc.jsonValue(),
      ),
      (coords, casing, noise) => {
        if (casing === "position") {
          const cmd = new Move({ ...noise, position: coords });
          assertEquals(cmd.data, coords);
        } else {
          const cmd = new Move({ ...noise, Position: coords });
          assertEquals(cmd.data, coords);
        }
      },
    ),
    { numRuns: 1000 },
  );
});

Deno.test("Property-Based Invariants - Multi-Component Requirement Conjunction (1,000 runs)", () => {
  const Position = s.struct("Position", {
    x: s.number(),
    y: s.number(),
  });
  const Health = s.struct("Health", {
    hp: s.number(),
    max: s.number().optional(),
  });

  const UpdateEntity = structCommand(requires(Position, Health), s.string());

  fc.assert(
    fc.property(
      fc.record({
        x: fc.integer({ min: -10_000, max: 10_000 }),
        y: fc.integer({ min: -10_000, max: 10_000 }),
      }),
      fc.record({
        hp: fc.integer({ min: 0, max: 10_000 }),
        max: fc.option(fc.integer({ min: 1, max: 10_000 }), { nil: undefined }),
      }),
      fc.boolean(),
      fc.boolean(),
      fc.dictionary(
        fc.string({ minLength: 1, maxLength: 15 }).filter((k) => !/^(position|health)$/i.test(k)),
        fc.jsonValue(),
      ),
      (pos, hp, upperPos, upperHp, noise) => {
        const cmd = upperPos
          ? (upperHp
            ? new UpdateEntity({ ...noise, Position: pos, Health: hp })
            : new UpdateEntity({ ...noise, Position: pos, health: hp }))
          : (upperHp
            ? new UpdateEntity({ ...noise, position: pos, Health: hp })
            : new UpdateEntity({ ...noise, position: pos, health: hp }));

        assertEquals(cmd.data, {
          position: pos,
          health: hp,
        });
      },
    ),
    { numRuns: 1000 },
  );
});

Deno.test("Property-Based Invariants - Ambiguity Determinism Rejection (1,000 runs)", () => {
  const Position = s.struct("Position", {
    x: s.number(),
    y: s.number(),
  });
  const Move = structCommand(requires(Position), s.boolean());

  fc.assert(
    fc.property(
      fc.record({ x: fc.integer(), y: fc.integer() }),
      fc.record({ x: fc.integer(), y: fc.integer() }),
      (pos1, pos2) => {
        const ambiguous = {
          position: pos1,
          Position: pos2,
        };

        assertThrows(
          () => new Move(ambiguous as any),
          ComponentResolutionError,
          "Ambiguous",
        );
      },
    ),
    { numRuns: 1000 },
  );
});

Deno.test("Property-Based Invariants - Adversarial Corruption Rejection (1,000 runs)", () => {
  const Position = s.struct("Position", {
    x: s.number(),
    y: s.number(),
  });
  const Move = structCommand(requires(Position), s.boolean());

  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.integer(),
        fc.string(),
        fc.boolean(),
        fc.record({ position: fc.string() }),
        fc.record({ position: fc.boolean() }),
        fc.record({ Position: fc.array(fc.integer()) }),
        fc.record({ otherProp: fc.string() }),
      ),
      (corrupted) => {
        assertThrows(
          () => new Move(corrupted as any),
          ComponentResolutionError,
        );
      },
    ),
    { numRuns: 1000 },
  );
});
