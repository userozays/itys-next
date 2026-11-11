export type FormState = {
  ok?: boolean;
  /** Translated, form-level message. */
  error?: string;
  /** Translated note about what a successful action did. */
  message?: string;
  /** Translated messages keyed by field name. */
  fieldErrors?: Record<string, string>;
};
