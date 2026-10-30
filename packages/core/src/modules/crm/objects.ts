import { DomainError } from "../../errors.js";
import { contactObject } from "./standard/contact.js";
import type { ObjectDef } from "./types.js";

/** API name → definition. Companies, notes and tasks join in phase 2. */
export const OBJECTS: Record<string, ObjectDef> = { contacts: contactObject };

export function objectDef(name: string): ObjectDef {
  const def = Object.hasOwn(OBJECTS, name) ? OBJECTS[name] : undefined;
  if (!def) throw new DomainError("not_found", "Unknown object.");
  return def;
}
