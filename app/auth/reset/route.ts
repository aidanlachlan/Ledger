import { NextRequest } from "next/server";
import { exchangeCode } from "../exchange-code";
// Password reset links sign the user in, then require a new password.
export const GET = (request: NextRequest) =>
  exchangeCode(request, "/reset-password");
