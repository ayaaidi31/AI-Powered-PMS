import { describe, it, expect } from "vitest"
import { stripMarkers, parseRow, isSeparatorRow } from "@/lib/markdown"

describe("stripMarkers", () => {
  it("removes ** and __ markers", () => {
    expect(stripMarkers("Sie ** of **")).toBe("Sie  of ")
    expect(stripMarkers("a __ b")).toBe("a  b")
  })
  it("leaves text without markers unchanged", () => {
    expect(stripMarkers("plain text")).toBe("plain text")
  })
})

describe("parseRow", () => {
  it("splits a table row into trimmed cells, dropping edge pipes", () => {
    expect(parseRow("| Priorität | Zustand | Handlung |")).toEqual(["Priorität", "Zustand", "Handlung"])
  })
  it("handles rows without leading/trailing pipes", () => {
    expect(parseRow("a | b | c")).toEqual(["a", "b", "c"])
  })
})

describe("isSeparatorRow", () => {
  it("detects a plain separator", () => {
    expect(isSeparatorRow("|---|---|---|")).toBe(true)
  })
  it("detects alignment colons", () => {
    expect(isSeparatorRow("|:--|--:|:-:|")).toBe(true)
  })
  it("rejects a header/content row", () => {
    expect(isSeparatorRow("| Priorität | Zustand |")).toBe(false)
  })
  it("rejects a bullet line (single dash, has text)", () => {
    expect(isSeparatorRow("- item")).toBe(false)
  })
  it("rejects an empty line", () => {
    expect(isSeparatorRow("")).toBe(false)
  })
})
