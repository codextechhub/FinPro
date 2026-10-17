/**
 * Mrs Bello looks back at Bright Star's documents: one financial year, or a
 * stretch of dates within one. The pick lives in the page address.
 */

import { describe, expect, it } from "vitest";

import { listPeriodArg, listPeriodFor } from "./list-period";

const read = (query: string) => listPeriodFor(new URLSearchParams(query));

describe("which stretch of time a list shows", () => {
  it("shows every year when the address names none", () => {
    expect(read("")).toEqual({ kind: "all" });
    expect(listPeriodArg(read(""))).toEqual({});
  });

  it("asks the server for the year picked, by its label", () => {
    expect(read("year=2015")).toEqual({ kind: "year", year: 2015 });
    expect(listPeriodArg(read("year=2015"))).toEqual({ fiscal_year: 2015 });
  });

  it("asks for the ends of a custom range that are given", () => {
    expect(listPeriodArg(read("year=custom&from=2015-03-01&to=2015-05-31"))).toEqual({
      date_from: "2015-03-01", date_to: "2015-05-31",
    });
    expect(listPeriodArg(read("year=custom&from=2015-03-01"))).toEqual({ date_from: "2015-03-01" });
  });

  it("holds Custom dates open before either end is chosen, asking for nothing yet", () => {
    expect(read("year=custom")).toEqual({ kind: "range", from: "", to: "" });
    expect(listPeriodArg(read("year=custom"))).toEqual({});
  });

  it("ignores a date that is not a date rather than sending it", () => {
    expect(listPeriodArg(read("year=custom&from=01/03/2015&to=2015-05-31"))).toEqual({ date_to: "2015-05-31" });
  });

  it("ignores a year that is not a year", () => {
    expect(read("year=abc")).toEqual({ kind: "all" });
  });
});
