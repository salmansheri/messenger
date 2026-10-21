import { describe, expect, it } from "vitest";
import { checkImageFile, chooseImage, MAX_IMAGE_BYTES } from "./image-file";

const file = (type: string, size: number) => ({ type, size }) as File;

describe("checking an image file before it is uploaded", () => {
  it.each(["image/png", "image/jpeg", "image/webp", "image/gif"])("accepts %s", (type) => {
    expect(checkImageFile(file(type, 1000))).toEqual({ ok: true });
  });

  it("refuses anything that is not one of the four kinds, with the reason", () => {
    for (const type of ["image/svg+xml", "image/bmp", "application/pdf", "text/plain", ""]) {
      expect(checkImageFile(file(type, 1000))).toEqual({ ok: false, message: "Choose a PNG, JPEG, WebP or GIF image." });
    }
  });

  it("refuses an empty file and one over 10 MB, but takes exactly 10 MB", () => {
    expect(checkImageFile(file("image/png", 0))).toEqual({ ok: false, message: "That file is empty." });
    expect(checkImageFile(file("image/png", MAX_IMAGE_BYTES + 1))).toEqual({ ok: false, message: "That image is larger than 10 MB." });
    expect(checkImageFile(file("image/png", MAX_IMAGE_BYTES))).toEqual({ ok: true });
  });
});

describe("choosing the image among pasted, dropped or picked files", () => {
  it("finds nothing when there are no files, so a paste of plain text is left alone", () => {
    expect(chooseImage(undefined)).toEqual({ kind: "none" });
    expect(chooseImage(null)).toEqual({ kind: "none" });
    expect(chooseImage([])).toEqual({ kind: "none" });
  });

  it("takes the first file when it is an image", () => {
    const first = file("image/png", 10);
    expect(chooseImage([first, file("image/jpeg", 10)])).toEqual({ kind: "image", file: first });
  });

  it("refuses a first file that is not an acceptable image, saying why", () => {
    expect(chooseImage([file("application/pdf", 10)])).toEqual({ kind: "refused", message: "Choose a PNG, JPEG, WebP or GIF image." });
    expect(chooseImage([file("image/png", MAX_IMAGE_BYTES + 1)])).toEqual({ kind: "refused", message: "That image is larger than 10 MB." });
  });
});
