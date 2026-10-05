import type { BaseSchema } from "@collidor/struct";

/** A struct given a component name via `.named("Position")`. */
export type NamedComponent = BaseSchema<any, any> & { readonly __name: string };

const REQUIREMENT = Symbol.for("@collidor/struct-command/requirement");

export interface ComponentRequirement<
  TList extends readonly NamedComponent[] = readonly NamedComponent[],
> {
  readonly [REQUIREMENT]: true;
  readonly components: TList;
}

type Out<T> = T extends BaseSchema<any, infer O> ? O : never;
type In<T> = T extends BaseSchema<infer I, any> ? I : never;
type NameOf<C> = C extends { readonly __name: infer N extends string } ? N : never;

/** Property names (`Position` -> `"position" | "Position"`) a component may live under. */
export type ComponentKey<N extends string> = Uncapitalize<N> | Capitalize<N>;

/**
 * What the handler receives (`cmd.data`): the bare component for a single requirement,
 * otherwise `{ position, health, ... }` keyed by lower-cased component name.
 */
export type RequirementOutput<R> = R extends ComponentRequirement<infer L>
  ? L extends readonly [infer Only] ? Out<Only>
  : { [C in L[number] as Uncapitalize<NameOf<C>>]: Out<C> }
  : never;

/**
 * Compile-time guard: resolves to `unknown` when `H` has every required component under its
 * name (either case of the first letter) with a compatible type; otherwise to a branded error.
 */
export type HolderGuard<H, R> = R extends ComponentRequirement<infer L>
  ? {
    [C in L[number] as NameOf<C>]: [Extract<keyof H, ComponentKey<NameOf<C>>>] extends [never]
      ? false
      : H[Extract<keyof H, ComponentKey<NameOf<C>>>] extends In<C> ? true : false;
  } extends infer Check
    ? false extends Check[keyof Check] ? { __missingOrInvalidComponent: keyof Check } : unknown
  : unknown
  : unknown;

/**
 * Requires named components. Any object carrying them under a property named after the
 * component (first letter either case) is accepted; the handler only receives the component(s).
 *
 * @example
 * const Position = s.struct({ x: s.number(), y: s.number() }).named("Position");
 * requires(Position);            // goblin.position or goblin.Position
 * requires(Position, Health);    // data: { position, health }
 */
export function requires<const L extends readonly [NamedComponent, ...NamedComponent[]]>(
  ...components: L
): ComponentRequirement<L> {
  for (const c of components) {
    if (typeof (c as any)?.descriptor?.name !== "string" || (c as any).descriptor.name === "") {
      throw new TypeError('requires(): components must be named, e.g. s.struct({...}).named("Position")');
    }
  }
  return { [REQUIREMENT]: true, components };
}

export function isComponentRequirement(value: unknown): value is ComponentRequirement {
  return typeof value === "object" && value !== null && (value as any)[REQUIREMENT] === true;
}

/** Error raised when a game object cannot supply a required component. */
export class ComponentResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComponentResolutionError";
  }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Resolves one named component from `source` and validates it with its schema. */
export function resolveComponent(source: unknown, component: NamedComponent): unknown {
  const name: string = (component as any).descriptor.name;
  if (typeof source !== "object" || source === null) {
    throw new ComponentResolutionError(`Expected an object carrying "${name}", received ${typeof source}`);
  }
  const obj = source as Record<string, unknown>;
  const keys = [...new Set([lowerFirst(name), upperFirst(name)])];
  const present = keys.filter((k) => obj[k] !== undefined);

  if (present.length === 0) {
    throw new ComponentResolutionError(`Object has no "${name}" component (looked for ${keys.map((k) => `"${k}"`).join(", ")})`);
  }
  if (present.length > 1) {
    throw new ComponentResolutionError(`Ambiguous "${name}" component: found under ${present.map((k) => `"${k}"`).join(", ")}`);
  }

  const res = component.safeParse(obj[present[0]]);
  if (!res.success) {
    throw new ComponentResolutionError(
      `Invalid "${name}" component at "${present[0]}": ${res.issues.map((i: any) => i.message).join("; ")}`,
    );
  }
  return res.data;
}

/** Resolves every required component from `source` into the command's `data` payload. */
export function extractRequirement(requirement: ComponentRequirement, source: unknown): any {
  const { components } = requirement;
  if (components.length === 1) {
    return resolveComponent(source, components[0]);
  }
  const data: Record<string, unknown> = {};
  for (const component of components) {
    data[lowerFirst((component as any).descriptor.name)] = resolveComponent(source, component);
  }
  return data;
}
