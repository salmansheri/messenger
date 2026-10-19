import { describe, expect, it } from "vitest";
import { addPerson, MAX_OTHERS, type Person } from "./members";

const person = (id: string, name = id): Person => ({ id, displayName: name, email: `${id}@example.com` });

describe("addPerson", () => {
  it("adds a person to the end of the list", () => {
    const result = addPerson([person("a")], person("b"), "me");
    expect(result).toEqual({ ok: true, people: [person("a"), person("b")] });
  });

  it("does not add the same person twice, and says who", () => {
    expect(addPerson([person("a", "Ada Lovelace")], person("a", "Ada Lovelace"), "me")).toEqual({
      ok: false,
      message: "Ada Lovelace is already in the list.",
    });
  });

  it("does not add yourself (you are in the Group anyway)", () => {
    expect(addPerson([], person("me"), "me")).toEqual({ ok: false, message: "You are already in the Group." });
  });

  it("stops at the most people a Group can have besides you", () => {
    const full = Array.from({ length: MAX_OTHERS }, (_, n) => person(`p${n}`));
    expect(addPerson(full, person("extra"), "me")).toEqual({
      ok: false,
      message: "A Group can have at most 256 Participants, you included.",
    });
    expect(MAX_OTHERS).toBe(255);
  });

  it("leaves the old list as it was", () => {
    const before = [person("a")];
    addPerson(before, person("b"), "me");
    expect(before).toEqual([person("a")]);
  });
});
