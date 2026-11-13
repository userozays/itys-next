import { describe, expect, it } from "vitest";
import { searchFold, turkishSortKey } from "./turkish";

describe("Turkish text rules (QA O2, O3)", () => {
  it("folds case and accents the Turkish way", () => {
    for (const text of ["İnsan", "insan", "INSAN", "ınsan"]) expect(searchFold(text)).toBe("insan");
    for (const text of ["Ayşe", "AYŞE", "ayse", "Ayse"]) expect(searchFold(text)).toBe("ayse");
    expect(searchFold("ÇAĞRI Öğüt")).toBe("cagri ogut");
    expect(searchFold("D-0054 / 192.168.1.21")).toBe("d-0054 / 192.168.1.21");
  });

  it("sorts in Turkish alphabetical order, ignoring case", () => {
    const names = ["Zirve", "üretim", "Çınar", "Işık", "İnsan", "ılık", "Ufuk", "Öz", "Şahin", "Sevgi", "cam", "Oda", "2. Kat", "ağaç", "Ağ", "Hisar", "Ege", "Gül", "Ğ"];
    const sorted = [...names].sort((a, b) => (turkishSortKey(a) < turkishSortKey(b) ? -1 : 1));
    expect(sorted).toEqual(["2. Kat", "Ağ", "ağaç", "cam", "Çınar", "Ege", "Gül", "Ğ", "Hisar", "ılık", "Işık", "İnsan", "Oda", "Öz", "Sevgi", "Şahin", "Ufuk", "üretim", "Zirve"]);
  });

  it("puts accented foreign letters with their base letter, and keeps keys distinct", () => {
    expect(turkishSortKey("Café") < turkishSortKey("Cafeterya")).toBe(true);
    expect(turkishSortKey("TEST")).not.toBe(turkishSortKey("Test"));
  });
});
