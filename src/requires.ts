import {
  ComponentResolutionError,
  extractComponents,
  getComponent,
  getComponentName,
  type ComponentKey,
  type In,
  type NamedComponent,
  type NameOf,
  type Out,
} from "@collidor/struct";

export { ComponentResolutionError, type ComponentKey, type NamedComponent };

const REQUIREMENT = Symbol.for("@collidor/struct-command/requirement");

export interface ComponentRequirement<
  TList extends readonly NamedComponent[] = readonly NamedComponent[],
> {
  readonly [REQUIREMENT]: true;
  readonly components: TList;
}

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
 * const Position = s.struct("Position", { x: s.number(), y: s.number() });
 * requires(Position);            // goblin.position or goblin.Position
 * requires(Position, Health);    // data: { position, health }
 */
export function requires<const L extends readonly [NamedComponent, ...NamedComponent[]]>(
  ...components: L
): ComponentRequirement<L> {
  for (const c of components) {
    try {
      getComponentName(c);
    } catch {
      throw new TypeError('requires(): components must be named, e.g. s.struct({...}).named("Position")');
    }
  }
  return { [REQUIREMENT]: true, components };
}

export function isComponentRequirement(value: unknown): value is ComponentRequirement {
  return typeof value === "object" && value !== null && (value as any)[REQUIREMENT] === true;
}

/** Resolves one named component from `source` and validates it with its schema. */
export const resolveComponent = getComponent;

/** Resolves every required component from `source` into the command's `data` payload. */
export function extractRequirement<R extends ComponentRequirement>(
  requirement: R,
  source: unknown,
): RequirementOutput<R> {
  return extractComponents(
    source,
    ...requirement.components,
  ) as RequirementOutput<R>;
}
