import { getActor } from "@/server/auth/context";

// Semicolons and a BOM so that Excel in Turkish locales opens it correctly.
const TEMPLATE = [
  "Etiket No;Cihaz Adı;Tür;Durum;Marka;Model;Seri No;Konum;Zimmetli Kişi;Alım Tarihi;Garanti Bitişi;Notlar;İşlemci;RAM;Depolama;İşletim Sistemi;Bilgisayar Adı;IP Adresi;MAC Adresi",
  ";Muhasebe PC;Masaüstü;Kullanımda;Dell;OptiPlex 7010;ABC12345;Merkez Ofis;Ayşe Yılmaz;15.01.2024;15.01.2027;;Intel Core i5-13500;16;512 GB SSD;Windows 11 Pro;MUHASEBE-01;192.168.1.21;00:1A:2B:3C:4D:5E",
  "YZ-01;Kat Yazıcısı;Yazıcı;Kullanımda;HP;LaserJet M404;;Merkez Ofis;;;;Toner: CF259A",
  ";Yedek Dizüstü;Dizüstü;Depoda;Lenovo;ThinkPad L14;;Depo;;01.06.2023;01.06.2026;",
].join("\r\n");

export async function GET() {
  if (!(await getActor())) return new Response(null, { status: 401 });
  return new Response(`﻿${TEMPLATE}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cihaz-sablonu.csv"',
    },
  });
}
