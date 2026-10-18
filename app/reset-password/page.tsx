import Link from "next/link";
import { requireUser } from "../../lib/auth";
import PasswordForm from "../settings/password-form";

export default async function ResetPassword() {
  const { user } = await requireUser();
  return (
    <>
      <h1>Choose a new password.</h1>
      <p className="muted">
        Your old password stops working once you save a new one, and any other
        devices are signed out.
      </p>
      <PasswordForm email={user.email ?? ""} />
      <nav>
        <Link href="/" prefetch={false}>
          Skip for now
        </Link>
      </nav>
    </>
  );
}
