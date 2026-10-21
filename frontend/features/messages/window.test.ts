import { describe, expect, it } from "vitest";
import type { MessagePage, MessageResponse } from "@/lib/api";
import { withMessage, type History } from "./history";
import { confirmedMessages } from "./timeline";
import { firstParam, isDetached, newerParam, olderParam, readingReportable, refreshBounds, targetFrom, type HistoryParam } from "./window";

const message = (seq: number): MessageResponse => ({ id: `m${seq}`, conversationId: "c1", seq, senderId: "grace", body: `m${seq}` });
const run = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => message(from + i));
const param = (query: HistoryParam["query"]): HistoryParam => ({ path: { conversationId: "c1" }, query });

describe("firstParam", () => {
  it("asks for the newest Messages when there is no target", () => {
    expect(firstParam("c1", undefined, 60)).toEqual(param({ limit: 60 }));
  });

  it("asks for the window around the target Message when there is one", () => {
    expect(firstParam("c1", 120, 60)).toEqual(param({ aroundSeq: 120 }));
  });
});

describe("olderParam", () => {
  it("pages back from the oldest Message of the newest page or an older page while older ones remain", () => {
    expect(olderParam({ messages: run(51, 100), hasMore: true }, param({ limit: 50 }))).toEqual(param({ beforeSeq: 51, limit: 50 }));
    expect(olderParam({ messages: run(1, 50), hasMore: false }, param({ beforeSeq: 51, limit: 50 }))).toBeUndefined();
  });

  it("reads a window's own word for its older end", () => {
    const window: MessagePage = { messages: run(95, 145), hasMore: true, hasOlder: true, hasNewer: true };
    expect(olderParam(window, param({ aroundSeq: 120 }))).toEqual(param({ beforeSeq: 95, limit: 50 }));
    const atTheStart: MessagePage = { messages: run(1, 28), hasMore: false, hasOlder: false, hasNewer: true };
    expect(olderParam(atTheStart, param({ aroundSeq: 3 }))).toBeUndefined();
  });

  it("goes on from a page of newer Messages to the ones before it (when a detached history is fetched again)", () => {
    expect(olderParam({ messages: run(146, 195), hasMore: true }, param({ afterSeq: 145, limit: 50 }))).toEqual(
      param({ beforeSeq: 146, limit: 50 }),
    );
  });

  it("has nowhere to go from an empty page", () => {
    expect(olderParam({ messages: [], hasMore: true }, param({ limit: 50 }))).toBeUndefined();
    expect(olderParam({ messages: [], hasMore: true }, param({ afterSeq: 10, limit: 50 }))).toBeUndefined();
  });
});

describe("newerParam", () => {
  it("never pages forward from the newest Messages or from older pages", () => {
    expect(newerParam({ messages: run(51, 100), hasMore: true }, param({ limit: 50 }))).toBeUndefined();
    expect(newerParam({ messages: run(1, 50), hasMore: true }, param({ beforeSeq: 51, limit: 50 }))).toBeUndefined();
  });

  it("pages forward from a window while newer Messages remain", () => {
    const window: MessagePage = { messages: run(95, 145), hasMore: true, hasOlder: true, hasNewer: true };
    expect(newerParam(window, param({ aroundSeq: 120 }))).toEqual(param({ afterSeq: 145, limit: 50 }));
    const reachingTheEnd: MessagePage = { messages: run(95, 145), hasMore: true, hasOlder: true, hasNewer: false };
    expect(newerParam(reachingTheEnd, param({ aroundSeq: 120 }))).toBeUndefined();
  });

  it("goes on from a page of newer Messages until one says it reached the end", () => {
    expect(newerParam({ messages: run(146, 195), hasMore: true }, param({ afterSeq: 145, limit: 50 }))).toEqual(
      param({ afterSeq: 195, limit: 50 }),
    );
    expect(newerParam({ messages: run(146, 160), hasMore: false }, param({ afterSeq: 145, limit: 50 }))).toBeUndefined();
  });
});

describe("isDetached", () => {
  const history = (pages: MessagePage[], pageParams: HistoryParam[]): History => ({ pages, pageParams });
  const window = (hasNewer: boolean): MessagePage => ({ messages: run(95, 145), hasMore: true, hasOlder: true, hasNewer });

  it("is attached when the newest Messages were loaded, however far back it has paged", () => {
    expect(isDetached(history([{ messages: run(51, 100), hasMore: true }], [param({ limit: 50 })]))).toBe(false);
    expect(
      isDetached(
        history(
          [
            { messages: run(51, 100), hasMore: true },
            { messages: run(1, 50), hasMore: false },
          ],
          [param({ limit: 50 }), param({ beforeSeq: 51, limit: 50 })],
        ),
      ),
    ).toBe(false);
  });

  it("is detached while a window has newer Messages it has not loaded", () => {
    expect(isDetached(history([window(true)], [param({ aroundSeq: 120 })]))).toBe(true);
    expect(isDetached(history([window(false)], [param({ aroundSeq: 120 })]))).toBe(false);
  });

  it("stays detached while paging forward, and attaches once a page reaches the newest Message", () => {
    const later: MessagePage = { messages: run(146, 195), hasMore: true };
    expect(isDetached(history([later, window(true)], [param({ afterSeq: 145, limit: 50 }), param({ aroundSeq: 120 })]))).toBe(true);
    const last: MessagePage = { messages: run(196, 210), hasMore: false };
    expect(
      isDetached(
        history([last, later, window(true)], [param({ afterSeq: 195, limit: 50 }), param({ afterSeq: 145, limit: 50 }), param({ aroundSeq: 120 })]),
      ),
    ).toBe(false);
  });

  it("is attached when nothing is loaded", () => {
    expect(isDetached(history([], []))).toBe(false);
  });
});

describe("refreshBounds", () => {
  it("fetches from the oldest Message loaded to the end of an attached history", () => {
    const attached: History = { pages: [{ messages: run(51, 100), hasMore: true }], pageParams: [param({ limit: 50 })] };
    expect(refreshBounds(attached)).toEqual({ from: 51, upTo: undefined });
  });

  it("stops a detached window at its newest Message, so a refresh never fills the gap to the latest", () => {
    const detached: History = {
      pages: [{ messages: run(95, 145), hasMore: true, hasOlder: true, hasNewer: true }],
      pageParams: [param({ aroundSeq: 120 })],
    };
    expect(refreshBounds(detached)).toEqual({ from: 95, upTo: 145 });
  });

  it("has nothing to refresh from when nothing is loaded", () => {
    expect(refreshBounds({ pages: [{ messages: [], hasMore: false }], pageParams: [param({ limit: 50 })] })).toEqual({
      from: undefined,
      upTo: undefined,
    });
  });
});

describe("targetFrom", () => {
  it("reads the Sequence number of the Message to open at from the address", () => {
    expect(targetFrom("120")).toBe(120);
    expect(targetFrom("1")).toBe(1);
  });

  it("opens at the latest for anything that is not a positive whole number", () => {
    for (const value of [null, "", "0", "-3", "1.5", "abc", "12abc", " 12", "1e3", "99999999999999999999"]) {
      expect(targetFrom(value)).toBeUndefined();
    }
  });
});

describe("a window and the pages fetched from it", () => {
  const window: MessagePage = { messages: run(95, 145), hasMore: true, hasOlder: true, hasNewer: true };

  it("merge into one run without holes or repeats, whichever way it was paged", () => {
    const later = olderParam(window, param({ aroundSeq: 120 }));
    const newer = newerParam(window, param({ aroundSeq: 120 }));
    expect(later).toEqual(param({ beforeSeq: 95, limit: 50 }));
    expect(newer).toEqual(param({ afterSeq: 145, limit: 50 }));

    // What the server answers for those: the 50 before 95 and the 50 after 145 (newest page first, as TanStack keeps them).
    const pages: MessagePage[] = [{ messages: run(146, 195), hasMore: true }, window, { messages: run(45, 94), hasMore: true }];
    expect(confirmedMessages(pages).map((m) => m.seq)).toEqual(run(45, 195).map((m) => m.seq));
  });

  it("keeps an own sent Message or a caught-up one out of a detached window, and takes it once attached", () => {
    const detached: History = { pages: [window], pageParams: [param({ aroundSeq: 120 })] };
    expect(withMessage(detached, message(300))).toBe(detached);

    const attached: History = { pages: [{ ...window, hasNewer: false }], pageParams: [param({ aroundSeq: 120 })] };
    expect(withMessage(attached, message(146)).pages[0].messages?.at(-1)?.seq).toBe(146);
  });

  it("goes back to the latest by starting again from the newest Messages", () => {
    const back = firstParam("c1", undefined, 50);
    expect(back).toEqual(param({ limit: 50 }));
    const latest: History = { pages: [{ messages: run(251, 300), hasMore: true }], pageParams: [back] };
    expect(isDetached(latest)).toBe(false);
  });
});

describe("readingReportable", () => {
  it("reports reading as always when the Conversation was opened at the latest", () => {
    expect(readingReportable({ detached: false, target: undefined, firstUnread: 900, oldestLoaded: 950 })).toBe(true);
  });

  it("never reports from a detached window: its read position would cover unread Messages never shown", () => {
    expect(readingReportable({ detached: true, target: 120, firstUnread: undefined, oldestLoaded: 95 })).toBe(false);
  });

  it("reports from a window that reaches the latest only when it also reaches back to the first unread Message", () => {
    expect(readingReportable({ detached: false, target: 120, firstUnread: undefined, oldestLoaded: 95 })).toBe(true);
    expect(readingReportable({ detached: false, target: 120, firstUnread: 100, oldestLoaded: 95 })).toBe(true);
    expect(readingReportable({ detached: false, target: 120, firstUnread: 60, oldestLoaded: 95 })).toBe(false);
    expect(readingReportable({ detached: false, target: 120, firstUnread: 60, oldestLoaded: undefined })).toBe(false);
  });
});
