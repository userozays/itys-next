/**
 * Text helpers that follow Turkish rules. SQLite on its own lower-cases only
 * A–Z and orders text by byte value, so "AYŞE" does not find "Ayşe" and
 * "Çınar" sorts after "Zirve" (QA O2, O3). These functions are also
 * registered in SQLite (src/server/db/client.ts) to be used in queries.
 */

const stripMarks = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** For matching: case and accents do not matter, so "INSAN", "insan" and "İnsan", or "ayse" and "Ayşe", are equal. */
export function searchFold(text: string): string {
  return stripMarks(text.toLocaleLowerCase("tr").replace(/ı/g, "i"));
}

const ALPHABET = "abcçdefgğhıijklmnoöpqrsştuüvwxyz";
// Letters map to code points far above digits, spaces and punctuation, which keep their own (lower) code points.
const LETTER_BASE = 0x4000;

/**
 * A key whose plain byte order is Turkish alphabetical order, ignoring case:
 * a, b, c, ç, d … ı, i … o, ö … s, ş … u, ü … z. Digits and punctuation come
 * before letters. The original text is appended so that keys stay distinct.
 */
export function turkishSortKey(text: string): string {
  let key = "";
  for (const char of text.toLocaleLowerCase("tr")) {
    let index = ALPHABET.indexOf(char);
    if (index < 0) index = ALPHABET.indexOf(stripMarks(char)); // é sorts as e
    key += index < 0 ? char : String.fromCharCode(LETTER_BASE + index);
  }
  return `${key}\u0000${text}`;
}
