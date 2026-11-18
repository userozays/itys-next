import { describe, expect, it } from "vitest";
import { addCompany, addUser, assetInput, testDb } from "../testing/fixtures";
import { createAsset, listAssignees } from "./assets";

describe("assignee suggestions (QA Ö4)", () => {
  it("lists each name used in the company once, in Turkish order", async () => {
    const db = testDb();
    const a = addCompany(db, "A");
    const b = addCompany(db, "B");
    const admin = await addUser(db, "admin", "admin");
    const tech = await addUser(db, "tech", "technician", { companyIds: [a] });
    for (const assignedTo of ["Zeynep Kaya", "Çağla Er", "Zeynep Kaya", "Can Ak", undefined]) {
      createAsset(db, admin, a, assetInput({ assignedTo }));
    }
    createAsset(db, admin, b, assetInput({ assignedTo: "Başka Şirketten" }));

    expect(listAssignees(db, tech, a)).toEqual(["Can Ak", "Çağla Er", "Zeynep Kaya"]);
    expect(() => listAssignees(db, tech, b)).toThrow("notFound");
  });
});
