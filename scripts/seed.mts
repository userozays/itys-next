/**
 * Fills an EMPTY database with demo data for local development.
 *   npm run db:seed            → data/demo.db
 * Demo sign-ins (local only, never use in production):
 *   admin / demo-admin-2026        tech.ayse / demo-tech-2026
 * The other technicians (tech.can, tech.elif, tech.murat) share the technician password.
 * tech.can may also read license keys; izleyici.deniz is a read-only viewer
 * with the technician password.
 * The data is generated from a fixed seed, so every run produces the same records.
 */
import path from "node:path";
import { todayIso } from "../src/lib/dates";
import { openDb } from "../src/server/db/client";
import type { AssetStatus, AssetType, Currency } from "../src/server/db/schema";
import { createAsset } from "../src/server/services/assets";
import { createCompany, updateCompany } from "../src/server/services/companies";
import { assignLicense, createLicense } from "../src/server/services/licenses";
import { createLocation } from "../src/server/services/locations";
import { createFirstAdmin, createUser, needsSetup } from "../src/server/services/users";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed demo data in production.");
}

const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "demo.db");
const db = openDb(file);

if (!needsSetup(db)) {
  console.log(`${file} already has users; nothing to do.`);
  process.exit(0);
}

// --- deterministic randomness -------------------------------------------------
let state = 20261111;
function random(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T,>(items: readonly T[]): T => items[int(0, items.length - 1)]!;
const chance = (p: number) => random() < p;
/** A date `days` from today, as YYYY-MM-DD. */
const inDays = (days: number) => todayIso(new Date(Date.now() + days * 86_400_000));

// --- catalogues ---------------------------------------------------------------
const firstNames = ["Ayşe", "Mehmet", "Zeynep", "Mert", "Selin", "Burak", "Deniz", "Ece", "Emre", "Elif", "Can", "Gizem", "Onur", "Derya", "Kerem", "Buse", "Tolga", "İrem", "Serkan", "Melis", "Hakan", "Nazlı", "Umut", "Pınar"];
const lastNames = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Arslan", "Aydın", "Öztürk", "Koç", "Polat", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Özkan", "Şimşek", "Yıldız", "Erdoğan", "Güneş"];
const person = () => `${pick(firstNames)} ${pick(lastNames)}`;

type Model = { brand: string; model: string; cpu?: string; ramGb?: number; storage?: string; os?: string };
const models: Record<AssetType, Model[]> = {
  computer: [
    { brand: "Dell", model: "OptiPlex 7010", cpu: "Intel Core i5-13500", ramGb: 16, storage: "256 GB SSD", os: "Windows 11 Pro" },
    { brand: "HP", model: "ProDesk 400 G9", cpu: "Intel Core i5-12500", ramGb: 8, storage: "256 GB SSD", os: "Windows 11 Pro" },
    { brand: "Lenovo", model: "ThinkCentre M70q", cpu: "Intel Core i5-12400T", ramGb: 16, storage: "512 GB SSD", os: "Windows 11 Pro" },
    { brand: "Casper", model: "Nirvana N2H", cpu: "Intel Core i3-12100", ramGb: 8, storage: "240 GB SSD", os: "Windows 10 Pro" },
  ],
  laptop: [
    { brand: "Lenovo", model: "ThinkPad E14", cpu: "Intel Core i5-1335U", ramGb: 16, storage: "512 GB SSD", os: "Windows 11 Pro" },
    { brand: "Dell", model: "Latitude 5440", cpu: "Intel Core i7-1355U", ramGb: 16, storage: "512 GB SSD", os: "Windows 11 Pro" },
    { brand: "HP", model: "EliteBook 840 G10", cpu: "Intel Core i5-1340P", ramGb: 16, storage: "512 GB SSD", os: "Windows 11 Pro" },
    { brand: "Apple", model: "MacBook Air M3", cpu: "Apple M3", ramGb: 16, storage: "512 GB SSD", os: "macOS 15" },
    { brand: "Asus", model: "ExpertBook B1", cpu: "Intel Core i5-1235U", ramGb: 8, storage: "256 GB SSD", os: "Windows 11 Pro" },
  ],
  server: [
    { brand: "Dell", model: "PowerEdge T350", cpu: "Intel Xeon E-2334", ramGb: 32, storage: "2 x 2 TB SSD (RAID 1)", os: "Windows Server 2022 Standard" },
    { brand: "HPE", model: "ProLiant ML30 Gen11", cpu: "Intel Xeon E-2434", ramGb: 32, storage: "2 x 4 TB HDD (RAID 1)", os: "Windows Server 2022 Standard" },
    { brand: "Synology", model: "DS923+", cpu: "AMD Ryzen R1600", ramGb: 8, storage: "4 x 8 TB HDD (SHR)", os: "DSM 7.2" },
  ],
  printer: [
    { brand: "HP", model: "LaserJet Pro M404dn" },
    { brand: "Canon", model: "i-SENSYS MF453dw" },
    { brand: "Brother", model: "HL-L2350DW" },
    { brand: "Zebra", model: "ZD220" },
    { brand: "Kyocera", model: "ECOSYS M2040dn" },
  ],
  network: [
    { brand: "Cisco", model: "CBS350-24T" },
    { brand: "Fortinet", model: "FortiGate 60F" },
    { brand: "Ubiquiti", model: "UniFi U6 Pro" },
    { brand: "TP-Link", model: "TL-SG1024DE" },
    { brand: "MikroTik", model: "hEX S" },
  ],
  monitor: [
    { brand: "Dell", model: "P2422H" },
    { brand: "LG", model: "27UL500" },
    { brand: "Samsung", model: "S24C310" },
  ],
  phone: [
    { brand: "Yealink", model: "T46U" },
    { brand: "Grandstream", model: "GXP2135" },
  ],
  other: [
    { brand: "Honeywell", model: "EDA51" },
    { brand: "APC", model: "Smart-UPS 1500" },
    { brand: "Epson", model: "EB-X06" },
  ],
};

const typeNames: Record<AssetType, string> = {
  computer: "PC", laptop: "Dizüstü", server: "Sunucu", printer: "Yazıcı", network: "Ağ Cihazı", monitor: "Monitör", phone: "Telefon", other: "Cihaz",
};
const departments = ["Muhasebe", "Satış", "Operasyon", "İnsan Kaynakları", "Yönetim", "Depo", "Üretim", "Teknik", "Pazarlama", "Satın Alma", "Kalite", "Resepsiyon"];
// How many of each kind a company of size 1 has, roughly.
const mix: [AssetType, number][] = [["computer", 9], ["laptop", 7], ["monitor", 5], ["printer", 3], ["network", 3], ["phone", 3], ["server", 1.5], ["other", 1.5]];

type LicenseTemplate = { name: string; vendor: string; unit: number; currency: Currency; perDevice: boolean };
const licenseCatalog: LicenseTemplate[] = [
  { name: "Microsoft 365 İş Standart", vendor: "Microsoft", unit: 307500, currency: "TRY", perDevice: true },
  { name: "ESET Endpoint Security", vendor: "ESET", unit: 96000, currency: "TRY", perDevice: true },
  { name: "Kaspersky Endpoint Security", vendor: "Kaspersky", unit: 88000, currency: "TRY", perDevice: true },
  { name: "Adobe Acrobat Pro", vendor: "Adobe", unit: 23988, currency: "USD", perDevice: true },
  { name: "AutoCAD LT", vendor: "Autodesk", unit: 49000, currency: "USD", perDevice: true },
  { name: "Logo Tiger 3", vendor: "Logo Yazılım", unit: 4850000, currency: "TRY", perDevice: false },
  { name: "Mikro ERP", vendor: "Mikro Yazılım", unit: 3600000, currency: "TRY", perDevice: false },
  { name: "Veeam Backup Essentials", vendor: "Veeam", unit: 120000, currency: "USD", perDevice: false },
  { name: "Windows Server 2022 Standard", vendor: "Microsoft", unit: 107000, currency: "USD", perDevice: false },
  { name: "TeamViewer Business", vendor: "TeamViewer", unit: 41880, currency: "EUR", perDevice: false },
  { name: "Zoom Workplace Pro", vendor: "Zoom", unit: 14990, currency: "USD", perDevice: true },
];

// --- companies ----------------------------------------------------------------
type CompanySpec = { name: string; contact: string; phone: string; size: number; locations: string[]; active?: boolean };
const companySpecs: CompanySpec[] = [
  { name: "Akdeniz Lojistik", contact: "Mehmet Kaya", phone: "0242 555 01 01", size: 2.2, locations: ["Merkez Ofis", "Depo", "Sistem Odası", "Antalya Şube", "Araç Filosu"] },
  { name: "Boğaziçi Tekstil", contact: "Elif Demir", phone: "0212 555 02 02", size: 1.6, locations: ["Yönetim Katı", "Atölye", "Sevkiyat", "Sistem Odası"] },
  { name: "Çınar Mimarlık", contact: "Onur Çetin", phone: "0312 555 03 03", size: 0.7, locations: ["Ofis", "Toplantı Odası"] },
  { name: "Doruk Sağlık Polikliniği", contact: "Dr. Selin Aydın", phone: "0232 555 04 04", size: 1.3, locations: ["Resepsiyon", "Muayene Odaları", "Laboratuvar", "Sistem Odası"] },
  { name: "Ege Gıda Sanayi", contact: "Hakan Özkan", phone: "0232 555 05 05", size: 2.6, locations: ["İdari Bina", "Üretim Hattı", "Soğuk Depo", "Kalite Laboratuvarı", "Sistem Odası", "Güvenlik"] },
  { name: "Fırat Hukuk Bürosu", contact: "Av. Derya Kılıç", phone: "0212 555 06 06", size: 0.5, locations: ["Ofis", "Arşiv"] },
  { name: "Güneş Otomotiv Yedek Parça", contact: "Tolga Aslan", phone: "0224 555 07 07", size: 1.8, locations: ["Mağaza", "Depo", "Muhasebe", "Sistem Odası"] },
  { name: "Hisar Yapı Malzemeleri", contact: "Pınar Şimşek", phone: "0216 555 08 08", size: 1.1, locations: ["Merkez", "Şantiye Ofisi", "Depo"] },
  { name: "Işık Eğitim Kurumları", contact: "Kerem Yıldız", phone: "0262 555 09 09", size: 2.0, locations: ["Müdürlük", "Bilgisayar Laboratuvarı", "Öğretmenler Odası", "Kütüphane", "Sistem Odası"] },
  { name: "Karadeniz Turizm", contact: "Melis Doğan", phone: "0462 555 10 10", size: 0.9, locations: ["Merkez Acente", "Havalimanı Ofisi"] },
  { name: "Ege Tarım (eski müşteri)", contact: "Umut Kara", phone: "0256 555 11 11", size: 0.4, locations: ["Ofis"], active: false },
];

const adminId = await createFirstAdmin(db, { username: "admin", name: "Demo Yönetici", password: "demo-admin-2026" });
const admin = { id: adminId, username: "admin", name: "Demo Yönetici", role: "admin" as const, canSeeLicenseKeys: false };

const companyIds: number[] = [];
let assetTotal = 0;
let licenseTotal = 0;

for (const spec of companySpecs) {
  const company = createCompany(db, admin, { name: spec.name, contact: spec.contact, phone: spec.phone, active: true });
  companyIds.push(company.id);
  const locationIds = spec.locations.map((name) => createLocation(db, admin, company.id, { name }).id);
  const serverRoom = locationIds[spec.locations.findIndex((n) => n.includes("Sistem"))] ?? locationIds[0]!;
  const subnet = `10.${company.id}.1`;
  let host = 10;
  const users: number[] = []; // computers and laptops, which take per-device licenses

  for (const [type, perSize] of mix) {
    const count = Math.max(type === "computer" ? 2 : 0, Math.round(perSize * spec.size * (0.75 + random() * 0.5)));
    for (let i = 1; i <= count; i++) {
      const model = pick(models[type]);
      const personal = type === "computer" || type === "laptop";
      const infra = type === "server" || type === "network";
      const status: AssetStatus = chance(0.06) ? "retired" : chance(0.07) ? "in_repair" : chance(infra ? 0.03 : 0.12) ? "in_stock" : "in_use";
      // Most warranties are comfortably in the future; some are close or just past, and old devices have none left.
      const roll = random();
      const warrantyDays = roll < 0.12 ? int(-6, 29) : roll < 0.3 ? int(-900, -30) : roll < 0.88 ? int(40, 1000) : null;
      const department = pick(departments);
      const name = personal ? `${department} ${typeNames[type]} ${i}` : infra ? `${typeNames[type]} ${i}` : `${department} ${typeNames[type]}`;
      const networked = personal || infra || type === "printer";
      const address = networked ? ++host : 0;

      const asset = createAsset(db, admin, company.id, {
        name,
        type,
        status,
        brand: model.brand,
        model: model.model,
        serial: `${model.brand.slice(0, 2).toUpperCase()}${int(1000000, 9999999)}`,
        locationId: infra ? serverRoom : pick(locationIds),
        assignedTo: personal && status === "in_use" ? person() : null,
        purchaseDate: warrantyDays === null ? null : inDays(warrantyDays - 1095),
        warrantyEnd: warrantyDays === null ? null : inDays(warrantyDays),
        notes: chance(0.08) ? pick(["Ekran kartı değiştirildi.", "Bataryası zayıf, yenilenecek.", "Uzaktan erişim kurulu.", "Yedek güç adaptörü depoda.", "Klavyesi değişti."]) : null,
        cpu: model.cpu ?? null,
        ramGb: model.ramGb ?? null,
        storage: model.storage ?? null,
        os: model.os ?? null,
        hostname: personal || type === "server" ? `${spec.name.slice(0, 3).toUpperCase()}-${typeNames[type].slice(0, 3).toUpperCase()}-${String(i).padStart(2, "0")}` : null,
        ipAddress: networked ? `${subnet}.${address}` : null,
        macAddress: networked ? `00:1A:2B:${company.id.toString(16).padStart(2, "0").toUpperCase()}:${int(16, 255).toString(16).toUpperCase()}:${address.toString(16).padStart(2, "0").toUpperCase()}` : null,
      });
      assetTotal++;
      if (personal && status !== "retired") users.push(asset.id);
    }
  }

  // Licenses: a handful per company, sized to its number of computers.
  const wanted = Math.max(2, Math.round(3 + spec.size * 2));
  const chosen = [...licenseCatalog].sort(() => random() - 0.5).slice(0, wanted);
  for (const template of chosen) {
    const seats = template.perDevice ? Math.max(2, Math.ceil(users.length * (0.6 + random() * 0.6))) : chance(0.5) ? int(1, 5) : null;
    const roll = random();
    const expiryDays = roll < 0.15 ? int(-5, 29) : roll < 0.25 ? int(-200, -20) : roll < 0.9 ? int(40, 700) : null;
    // No end date: a perpetual license. Otherwise a subscription, mostly yearly.
    const kind = expiryDays === null ? ("perpetual" as const) : ("subscription" as const);
    const billingPeriod = kind === "subscription" && chance(0.3) ? ("monthly" as const) : ("yearly" as const);
    const yearlyCost = template.unit * (template.perDevice && seats ? seats : 1);
    const license = createLicense(db, admin, company.id, {
      name: template.name,
      vendor: template.vendor,
      seats,
      key: `DEMO-${template.vendor.slice(0, 4).toUpperCase()}-${int(1000, 9999)}-${int(1000, 9999)}-${int(1000, 9999)}`, // made up
      kind,
      billingPeriod,
      purchaseDate: inDays(Math.min(expiryDays ?? 0, 0) - int(30, 700)),
      expiryDate: expiryDays === null ? null : inDays(expiryDays),
      cost: billingPeriod === "monthly" && kind === "subscription" ? Math.round(yearlyCost / 12) : yearlyCost,
      currency: template.currency,
    });
    licenseTotal++;
    if (template.perDevice && seats) {
      for (const assetId of users.slice(0, Math.min(seats, Math.round(users.length * (0.5 + random() * 0.5))))) {
        assignLicense(db, admin, license.id, assetId);
      }
    }
  }

  if (spec.active === false) {
    // Closed after its data was entered, as a former customer would be.
    updateCompany(db, admin, company.id, { name: spec.name, contact: spec.contact, phone: spec.phone, active: false });
  }
}

// --- users --------------------------------------------------------------------
const technicians: [string, string, number[]][] = [
  ["tech.ayse", "Ayşe Yılmaz", [companyIds[0]!]],
  ["tech.can", "Can Öztürk", [companyIds[0]!, companyIds[1]!, companyIds[4]!]],
  ["tech.elif", "Elif Şahin", [companyIds[2]!, companyIds[3]!, companyIds[5]!, companyIds[8]!]],
  ["tech.murat", "Murat Güneş", [companyIds[6]!, companyIds[7]!, companyIds[9]!]],
];
for (const [username, name, ids] of technicians) {
  const canSeeLicenseKeys = username === "tech.can";
  await createUser(db, admin, { username, name, password: "demo-tech-2026", role: "technician", companyIds: ids, canSeeLicenseKeys });
}
await createUser(db, admin, {
  username: "izleyici.deniz",
  name: "Deniz Aksoy",
  password: "demo-tech-2026",
  role: "viewer",
  companyIds: [companyIds[0]!, companyIds[1]!],
});

console.log(`Seeded ${companySpecs.length} companies, ${assetTotal} devices, ${licenseTotal} licenses and ${technicians.length + 2} users into ${file}`);
