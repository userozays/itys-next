import { notFound } from "next/navigation";

// Unknown addresses get the 404 page inside the app shell (menu, company switcher)
// instead of the bare root one. More specific routes always win over this one.
export default function Missing() {
  notFound();
}
