import Link from "next/link";
import { getContext, getStoreNames } from "../../lib/data";
import ScanEntry from "./scan-entry";
export default async function Scan() {
  const [context, stores] = await Promise.all([getContext(), getStoreNames()]);
  return (
    <>
      <nav>
        <Link href="/" prefetch={false}>
          ← Home
        </Link>
      </nav>
      <h1>From receipt to clarity.</h1>
      <p className="muted">
        Take or choose a photo of your receipt, then review what you paid.
      </p>
      <ScanEntry today={context.today} stores={stores} />
    </>
  );
}
