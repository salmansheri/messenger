/** Someone found by their exact email address, shown as a chip until the Group is created. */
export type Person = { id: string; displayName: string; email: string };

/** The most Participants a Group can have. */
export const MAX_PARTICIPANTS = 256;

/** The most people to add to a new Group: the person creating it is one of the Participants. */
export const MAX_OTHERS = MAX_PARTICIPANTS - 1;

/** The list with one more person, or why they cannot be added. The old list is not changed. */
export function addPerson(
  people: readonly Person[],
  person: Person,
  myId: string | undefined,
): { ok: true; people: Person[] } | { ok: false; message: string } {
  if (person.id === myId) return { ok: false, message: "You are already in the Group." };
  if (people.some((known) => known.id === person.id)) {
    return { ok: false, message: `${person.displayName} is already in the list.` };
  }
  if (people.length >= MAX_OTHERS) {
    return { ok: false, message: `A Group can have at most ${MAX_PARTICIPANTS} Participants, you included.` };
  }
  return { ok: true, people: [...people, person] };
}
