import { searchFold } from "./turkish";

// Long but easy to guess: these pass a length rule, so they are checked by name.
const COMMON = new Set([
  "password123", "password1234", "passw0rd123", "iloveyou123", "12345678910", "123456789a",
  "123456789123", "1234512345", "1122334455", "1111122222", "abc1234567", "abcd123456",
  "qwerty1234", "qwerty12345", "qwerty123456", "q1w2e3r4t5", "1q2w3e4r5t", "1q2w3e4r5t6y",
  "1qaz2wsx3edc", "qazwsxedc123", "qwertyuiop", "asdfghjkl1", "zxcvbnm123", "football123",
  "welcome123", "admin12345", "administrator", "trustno1234", "parola1234", "parola12345",
  "sifre12345", "sifre123456", "qwertyuiopgu", "galatasaray", "fenerbahce", "besiktas1903",
]);

const KEYBOARD_ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm", "qwertyuıopğü", "asdfghjklşi"];

/** One straight run up or down the alphabet, the digits or a keyboard row: "1234567890", "abcdefghij", "poiuytrewq". */
function isRun(text: string): boolean {
  const steps = new Set<number>();
  for (let i = 1; i < text.length; i++) steps.add(text.charCodeAt(i) - text.charCodeAt(i - 1));
  if (steps.size === 1 && Math.abs([...steps][0]) === 1) return true;
  return KEYBOARD_ROWS.some((row) => {
    const doubled = row + row;
    const reversed = [...doubled].reverse().join("");
    return doubled.includes(text) || reversed.includes(text);
  });
}

/**
 * Whether a password that meets the length rule is still too easy to guess (QA D9):
 * very few different characters ("1111111111", "abababababab"), a straight run,
 * or a well-known password.
 */
export function isWeakPassword(password: string): boolean {
  const folded = searchFold(password);
  if (new Set(folded).size < 4) return true;
  if (isRun(folded)) return true;
  return COMMON.has(folded);
}
