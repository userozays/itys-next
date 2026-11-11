import type { AssetStatus, AssetType } from "../db/schema";

/** Asset fields a spreadsheet column can be mapped to. */
export const importFields = [
  "name",
  "tag",
  "type",
  "status",
  "brand",
  "model",
  "serial",
  "location",
  "assignedTo",
  "purchaseDate",
  "warrantyEnd",
  "notes",
  "cpu",
  "ramGb",
  "storage",
  "os",
  "hostname",
  "ipAddress",
  "macAddress",
] as const;
export type ImportField = (typeof importFields)[number];

/** Field → zero-based column index. Unmapped fields are simply absent. */
export type Mapping = Partial<Record<ImportField, number>>;

/** Lower-cases with Turkish rules, drops accents and anything that is not a letter or digit. */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const headerSynonyms: Record<ImportField, string[]> = {
  name: ["cihazadi", "cihaz", "ad", "adi", "name", "devicename", "device", "tanim", "aciklama"],
  tag: ["etiketno", "etiket", "tag", "demirbasno", "demirbas", "envanterno", "barkod", "assettag"],
  type: ["tur", "turu", "tip", "tipi", "type", "kategori", "category", "cihazturu"],
  status: ["durum", "durumu", "status", "state"],
  brand: ["marka", "brand", "uretici", "manufacturer", "vendor"],
  model: ["model"],
  serial: ["serino", "serinumarasi", "seri", "serial", "serialnumber", "serialno", "sn"],
  location: ["konum", "lokasyon", "yer", "location", "oda", "sube", "departman", "birim"],
  assignedTo: ["zimmetlikisi", "zimmet", "zimmetli", "kullanici", "kisi", "assignedto", "user", "owner", "personel"],
  purchaseDate: ["alimtarihi", "alistarihi", "satinalmatarihi", "purchasedate", "faturatarihi", "alim"],
  warrantyEnd: ["garantibitisi", "garantibitis", "garantibitistarihi", "garanti", "warrantyend", "warranty", "garantisonu"],
  notes: ["notlar", "not", "notes", "note", "aciklamalar"],
  cpu: ["islemci", "cpu", "processor"],
  ramGb: ["ram", "ramgb", "bellek", "memory", "hafiza"],
  storage: ["depolama", "disk", "harddisk", "hdd", "ssd", "storage"],
  os: ["isletimsistemi", "os", "operatingsystem", "isletimsis"],
  hostname: ["bilgisayaradi", "hostname", "makineadi", "computername", "host"],
  ipAddress: ["ipadresi", "ip", "ipaddress"],
  macAddress: ["macadresi", "mac", "macaddress"],
};

/** Best-effort mapping from header names; each column is used at most once. */
export function guessMapping(headers: string[]): Mapping {
  const folded = headers.map(fold);
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const field of importFields) {
    for (const synonym of headerSynonyms[field]) {
      const index = folded.findIndex((h, i) => h === synonym && !used.has(i));
      if (index >= 0) {
        mapping[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

/** Keeps only known fields pointing at columns that exist. */
export function sanitizeMapping(raw: Record<string, unknown>, columnCount: number): Mapping {
  const mapping: Mapping = {};
  for (const field of importFields) {
    const index = Number(raw[field]);
    if (raw[field] !== "" && raw[field] != null && Number.isInteger(index) && index >= 0 && index < columnCount) {
      mapping[field] = index;
    }
  }
  return mapping;
}

const typeWords: Record<AssetType, string[]> = {
  computer: ["computer", "masaustu", "pc", "bilgisayar", "desktop", "kasa", "masaustubilgisayar"],
  laptop: ["laptop", "dizustu", "notebook", "dizustubilgisayar", "tasinabilir"],
  server: ["server", "sunucu"],
  printer: ["printer", "yazici", "tarayici", "scanner", "fotokopi"],
  network: ["network", "agcihazi", "ag", "switch", "router", "modem", "firewall", "guvenlikduvari", "accesspoint", "ap"],
  monitor: ["monitor", "ekran", "display"],
  phone: ["phone", "telefon", "ceptelefonu", "iptelefon", "tablet"],
  other: ["other", "diger"],
};

const statusWords: Record<AssetStatus, string[]> = {
  in_use: ["inuse", "kullanimda", "aktif", "active", "kullaniliyor"],
  in_stock: ["instock", "depoda", "stokta", "yedek", "stock", "spare"],
  in_repair: ["inrepair", "tamirde", "serviste", "arizali", "repair"],
  retired: ["retired", "hurda", "emekli", "kullanimdisi", "pasif", "disposed"],
};

function lookup<T extends string>(words: Record<T, string[]>, text: string): T | undefined {
  const key = fold(text);
  return (Object.keys(words) as T[]).find((value) => words[value].includes(key));
}

export const readType = (text: string) => lookup(typeWords, text);
export const readStatus = (text: string) => lookup(statusWords, text);

/** Accepts 2026-03-09, 09.03.2026, 9/3/2026 and 09-03-2026 (day first). Returns YYYY-MM-DD or null. */
export function readDate(text: string): string | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  const parts = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : null;
  if (!parts) return null;
  const [y, m, d] = parts as [string, string, string];
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const real = date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
  return real ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : null;
}
