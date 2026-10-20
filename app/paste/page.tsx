import Link from "next/link";
import { getContext, getStoreNames } from "../../lib/data";
import PasteEntry from "./paste-entry";
export default async function Paste() {
  const [context, stores] = await Promise.all([
    getContext(),
    getStoreNames(),
  ]);
  return (
    <>
      <nav>
        <Link href="/" prefetch={false}>
          ← Home
        </Link>
      </nav>
      <h1>From receipt to clarity.</h1>
      <p className="muted">
        Paste copied text, then review what you paid. Or{" "}
        <Link href="/scan" prefetch={false}>
          scan a photo
        </Link>{" "}
        instead.
      </p>
      <PasteEntry
        today={context.today}
        stores={stores}
      />
    </>
  );
}
