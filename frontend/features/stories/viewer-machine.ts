/**
 * What the Story viewer is showing and when it moves on, kept pure so it can be tested without a browser or a clock:
 * the component feeds it ticks of time, taps, keys and loads, and the tray as it changes. Each Story shows for
 * `STORY_MS` (a photo's time starts once it has loaded); after a person's last Story come the next person's, starting
 * at their first unseen one, and after the last person the viewer closes.
 */

/** How long each Story is shown. */
export const STORY_MS = 5000;

export type ViewerStory = { id: string; photo: boolean; seen: boolean };
export type ViewerPerson = { userId: string; stories: ViewerStory[] };

export type ViewerState = {
  /** Who is played, in the order the tray had when the viewer opened. */
  people: ViewerPerson[];
  person: number;
  story: number;
  /** How long the Story shown has been on screen, not counting pauses or the wait for a photo to load. */
  elapsed: number;
  /** Whether the Story can be timed: a text at once, a photo once it has loaded. */
  ready: boolean;
  /** Pressed and held. */
  held: boolean;
  /** Paused with Space or the Pause button, until it is pressed again. */
  paused: boolean;
  /** Something is open over the Story (a menu, the list of viewers). */
  covered: boolean;
  closed: boolean;
};

export type ViewerAction =
  | { type: "tick"; ms: number }
  | { type: "loaded"; storyId: string }
  | { type: "next" }
  | { type: "previous" }
  | { type: "hold"; held: boolean }
  | { type: "togglePause" }
  | { type: "cover"; covered: boolean }
  /** The tray changed: Stories may have come or gone while the viewer is open. */
  | { type: "sync"; people: ViewerPerson[] };

const CLOSED: ViewerState = {
  people: [],
  person: 0,
  story: 0,
  elapsed: 0,
  ready: false,
  held: false,
  paused: false,
  covered: false,
  closed: true,
};

/** The first Story a person is played from: the first they have not seen, or the first of all. */
function firstUnseen(person: ViewerPerson): number {
  const index = person.stories.findIndex((story) => !story.seen);
  return index === -1 ? 0 : index;
}

/** The state showing one Story afresh, keeping the pause the person chose. */
function at(state: ViewerState, people: ViewerPerson[], person: number, story: number): ViewerState {
  const shown = people[person]?.stories[story];
  if (!shown) return { ...CLOSED, people };
  return { ...state, people, person, story, elapsed: 0, ready: !shown.photo, closed: false };
}

/**
 * Opens at `userId`'s first unseen Story. The people after them follow; going back from their first Story reaches the
 * people before them.
 */
export function openViewer(people: ViewerPerson[], userId: string): ViewerState {
  const withStories = people.filter((person) => person.stories.length > 0);
  const start = withStories.findIndex((person) => person.userId === userId);
  if (start === -1) return CLOSED;
  return at({ ...CLOSED, closed: false }, withStories, start, firstUnseen(withStories[start]));
}

function forward(state: ViewerState): ViewerState {
  const person = state.people[state.person];
  if (state.story + 1 < person.stories.length) return at(state, state.people, state.person, state.story + 1);
  const nextPerson = state.people[state.person + 1];
  if (!nextPerson) return { ...CLOSED, people: state.people };
  return at(state, state.people, state.person + 1, firstUnseen(nextPerson));
}

function backward(state: ViewerState): ViewerState {
  if (state.story > 0) return at(state, state.people, state.person, state.story - 1);
  const previousPerson = state.people[state.person - 1];
  if (!previousPerson) return at(state, state.people, state.person, 0); // the very first: start it again
  return at(state, state.people, state.person - 1, previousPerson.stories.length - 1);
}

/**
 * Takes the tray as it is now: the people keep the order they had, nobody new is added, and the Story shown stays
 * shown if it is still there. If it went, the viewer moves to what came after it.
 */
function sync(state: ViewerState, fresh: ViewerPerson[]): ViewerState {
  const byId = new Map(fresh.map((person) => [person.userId, person]));
  const shown = current(state);
  // Everyone still there, with their Stories as they are now; who was shown and what of theirs came after.
  const people: ViewerPerson[] = [];
  // Where to go on: a Story of a person (by index), or the person at that index from their first unseen Story.
  let resumeAt: { person: number; story: number } | { person: number; story: "first unseen" } | undefined;
  state.people.forEach((before, index) => {
    const now = byId.get(before.userId);
    const stories = now?.stories ?? [];
    if (index === state.person && shown) {
      const still = stories.findIndex((story) => story.id === shown.storyId);
      if (still !== -1) resumeAt = { person: people.length, story: still };
      else {
        // The first Story that was after the one shown and is still there, else this person's are over.
        const later = before.stories.slice(state.story + 1).map((story) => story.id);
        const next = stories.findIndex((story) => later.includes(story.id));
        if (next !== -1 && stories.length > 0) resumeAt = { person: people.length, story: next };
      }
    }
    if (stories.length > 0) people.push({ userId: before.userId, stories });
    if (index === state.person && resumeAt === undefined && shown) {
      resumeAt = { person: people.length, story: "first unseen" }; // the next person
    }
  });

  if (!resumeAt) return { ...CLOSED, people };
  if (resumeAt.story === "first unseen") {
    const next = people[resumeAt.person];
    return next ? at(state, people, resumeAt.person, firstUnseen(next)) : { ...CLOSED, people };
  }
  const sameStory = shown && people[resumeAt.person]?.stories[resumeAt.story]?.id === shown.storyId;
  return sameStory
    ? { ...state, people, person: resumeAt.person, story: resumeAt.story }
    : at(state, people, resumeAt.person, resumeAt.story);
}

export function step(state: ViewerState, action: ViewerAction): ViewerState {
  if (state.closed) return state;
  switch (action.type) {
    case "tick": {
      if (!state.ready || state.held || state.paused || state.covered) return state;
      const elapsed = state.elapsed + action.ms;
      return elapsed >= STORY_MS ? forward(state) : { ...state, elapsed };
    }
    case "loaded":
      return current(state)?.storyId === action.storyId && !state.ready ? { ...state, ready: true } : state;
    case "next":
      return forward(state);
    case "previous":
      return backward(state);
    case "hold":
      return state.held === action.held ? state : { ...state, held: action.held };
    case "togglePause":
      return { ...state, paused: !state.paused };
    case "cover":
      return state.covered === action.covered ? state : { ...state, covered: action.covered };
    case "sync":
      return sync(state, action.people);
  }
}

/** The Story shown: whose, which, and where it is among that person's (from 0). */
export function current(state: ViewerState): { userId: string; storyId: string; index: number; count: number } | undefined {
  if (state.closed) return undefined;
  const person = state.people[state.person];
  const story = person?.stories[state.story];
  return person && story ? { userId: person.userId, storyId: story.id, index: state.story, count: person.stories.length } : undefined;
}
